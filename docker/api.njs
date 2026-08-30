function json(r, status, obj) {
    r.headersOut['Content-Type'] = 'application/json';
    r.return(status, JSON.stringify(obj));
}

function logApi(message) {
    ngx.log(ngx.ERR, "API: " + message);
}

async function hello(r) {
    const upstashUrl = process.env.UPSTASH_URL || "not set";
    r.headersOut['Content-Type'] = 'text/plain';
    r.return(200, `hello world\nUPSTASH_URL: ${upstashUrl}\n`);
}

async function usage(r) {
    const match = r.uri.match(/^\/api\/usage\/(.+)$/);
    if (!match) return json(r, 400, { error: "Missing key" });
    return json(r, 200, {
        status: "success",
        message: "usage recorded (noop)",
        key: decodeURIComponent(match[1]),
        ts: Date.now()
    });
}

async function redis() {
    const args = Array.prototype.slice.call(arguments);
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL/TOKEN não configurados");        if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
            throw new Error("UPSTASH_REDIS_REST_URL must start with http:// or https://");
        }
        const res = await ngx.fetch(url, {
            method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Redis: ${data.error}`);
    return data.result;
}

const K_RESULTS = "arena:results";
const K_ACTIVE = "arena:active";
const RESULT_HISTORY_LIMIT = 10;
const ARENA_DURATION_MINUTES = [10, 30];
const WORKING_TTL_SECONDS = 4 * 60 * 60;
const SEEDED_PLAYERS = [
    { playerId: "arena-thefarjaw", name: "TheFarJaw" },
    { playerId: "arena-clawbreak", name: "ClawBreak" },
];

function arenaKeys(arenaId) {
    const id = encodeURIComponent(String(arenaId));
    return {
        arena: `arena:${id}`,
        scores: `arena:${id}:scores`,
        scored: `arena:${id}:scored`,
    };
}

function validArenaId(id) {
    return typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);
}

function transition(arena) {
    const now = Date.now();
    if (arena.status !== "finished" && now >= arena.endTime) arena.status = "finished";
    else if (arena.status === "scheduled" && now >= arena.startTime) arena.status = "active";
    return arena;
}

async function loadArena(arenaId) {
    const keys = arenaKeys(arenaId);
    const raw = await redis("GET", keys.arena);
    if (!raw) return null;
    let arena;
    try { arena = JSON.parse(raw); } catch (e) { throw new Error("Arena corrompida no KV"); }
    const before = arena.status;
    transition(arena);
    if (arena.status !== before) await redis("SET", keys.arena, JSON.stringify(arena));
    return arena;
}

function requireActive(arena) {
    if (!arena) return "Nenhuma Arena criada";
    if (arena.status === "scheduled") return "Arena ainda não começou";
    if (arena.status === "finished") return "Arena já encerrada";
    return null;
}

function scoreFor(scores, id) {
    return {
        points: parseInt(scores[`p:${id}`], 10) || 0,
        wins: parseInt(scores[`w:${id}`], 10) || 0,
        games: parseInt(scores[`g:${id}`], 10) || 0,
    };
}

function buildLeaderboard(arena, scores) {
    const rows = arena.players.map((rec) => ({
        playerId: rec.playerId,
        name: rec.name,
        points: scoreFor(scores, rec.playerId).points,
        wins: scoreFor(scores, rec.playerId).wins,
        games: scoreFor(scores, rec.playerId).games,
    }));
    rows.sort((a, b) => b.points - a.points ||
        (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
    return rows;
}

async function readBody(r) {
    try { return JSON.parse(r.requestText || "{}"); } catch (e) { return null; }
}

function arenaIdFromUri(r, suffix) {
    const match = r.uri.match(new RegExp("^/api/arena/([^/]+)/" + suffix + "$"));
    return match ? decodeURIComponent(match[1]) : null;
}

async function arenaList(r) {
    const ids = (await redis("SMEMBERS", K_ACTIVE)) || [];
    const arenas = [];
    const stale = [];
    for (let i = 0; i < ids.length; i += 1) {
        const id = String(ids[i]);
        const arena = await loadArena(id);
        if (!arena || arena.status === "finished") {
            stale.push(id);
        } else {
            arenas.push(arena);
        }
    }
    for (let i = 0; i < stale.length; i += 1) await redis("SREM", K_ACTIVE, stale[i]);
    arenas.sort((a, b) => b.createdAt - a.createdAt);
    return json(r, 200, { status: "success", arenas: arenas });
}

async function arenaGet(r, arenaId) {
    const arena = await loadArena(arenaId);
    if (!arena) return json(r, 404, { error: "Nenhuma Arena criada" });
    const scores = (await redis("HGETALL", arenaKeys(arenaId).scores)) || {};
    return json(r, 200, { status: "success", arena, leaderboard: buildLeaderboard(arena, scores) });
}

async function arenaResultsGet(r) {
    const raw = await redis("GET", K_RESULTS);
    if (!raw) return json(r, 200, { status: "success", results: {} });
    let results;
    try { results = JSON.parse(raw); } catch (e) { throw new Error("Histórico de Arenas corrompido no KV"); }
    return json(r, 200, { status: "success", results });
}

async function arenaCreate(r) {
    const body = await readBody(r);
    if (!body) return json(r, 400, { error: "JSON inválido" });
    logApi("create payload=" + JSON.stringify(body));
    if (typeof body.ruleType !== "string" || !body.ruleType) {
        return json(r, 400, { error: "ruleType obrigatório" });
    }
    if (!body.options || typeof body.options !== "object" || Array.isArray(body.options)) {
        return json(r, 400, { error: "options obrigatório" });
    }
    if (typeof body.durationMinutes !== "number" || ARENA_DURATION_MINUTES.indexOf(body.durationMinutes) === -1) {
        return json(r, 400, { error: "durationMinutes deve ser 10 ou 30" });
    }
    const start = Date.now();
    const duration = body.durationMinutes * 60 * 1000;
    const id = "arena-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const arena = {
        id,
        creatorId: body.creatorId ? String(body.creatorId) : "",
        creatorName: body.creatorName ? String(body.creatorName) : "Anonymous",
        ruleType: body.ruleType,
        options: body.options,
        durationMinutes: body.durationMinutes,
        startTime: start,
        endTime: start + duration,
        status: "active",
        players: SEEDED_PLAYERS.map((player) => ({
            playerId: player.playerId,
            name: player.name,
            active: true,
        })),
        createdAt: start,
    };
    const keys = arenaKeys(id);
    logApi("creating arena " + id + " creator=" + arena.creatorName + " ruleType=" + arena.ruleType);
    await redis("SET", keys.arena, JSON.stringify(arena), "EX", String(WORKING_TTL_SECONDS), "NX");
    await redis("SADD", K_ACTIVE, id);
    await redis("EXPIRE", keys.scores, String(WORKING_TTL_SECONDS));
    await redis("EXPIRE", keys.scored, String(WORKING_TTL_SECONDS));
    return json(r, 201, { status: "success", arena });
}

async function arenaJoin(r, arenaId) {
    const body = await readBody(r);
    if (!body) return json(r, 400, { error: "JSON inválido" });
    if (!body.playerId) return json(r, 400, { error: "playerId obrigatório" });
    const arena = await loadArena(arenaId);
    const err = requireActive(arena);
    if (err) return json(r, 409, { error: err });
    if (arena.players.some((p) => p.playerId === String(body.playerId))) return json(r, 409, { error: "Já participante" });
    arena.players.push({
        playerId: String(body.playerId),
        name: String(body.name || body.playerId),
        active: true,
    });
    const keys = arenaKeys(arenaId);
    await redis("SET", keys.arena, JSON.stringify(arena), "EX", String(WORKING_TTL_SECONDS));
    return json(r, 200, { status: "success", arena });
}

async function arenaLeave(r, arenaId) {
    const body = await readBody(r);
    if (!body) return json(r, 400, { error: "JSON inválido" });
    const arena = await loadArena(arenaId);
    if (!arena) return json(r, 404, { error: "Nenhuma Arena criada" });
    const playerId = String(body.playerId);
    const rec = arena.players.find((p) => p.playerId === playerId);
    if (!rec) return json(r, 404, { error: "Não participante" });
    if (SEEDED_PLAYERS.some((player) => player.playerId === playerId)) {
        return json(r, 409, { error: "Participante fixo não pode sair" });
    }
    rec.active = false;
    await redis("SET", arenaKeys(arenaId).arena, JSON.stringify(arena), "EX", String(WORKING_TTL_SECONDS));
    return json(r, 200, { status: "success" });
}

async function arenaResult(r, arenaId) {
    const body = await readBody(r);
    if (!body) return json(r, 400, { error: "JSON inválido" });
    if (!body.challengeId || !body.winnerId || !body.loserId) {
        return json(r, 400, { error: "challengeId, winnerId e loserId obrigatórios" });
    }
    if (String(body.winnerId) === String(body.loserId)) return json(r, 400, { error: "winnerId e loserId devem diferir" });
    const arena = await loadArena(arenaId);
    const err = requireActive(arena);
    if (err) return json(r, 409, { error: err });
    const winnerId = String(body.winnerId);
    const loserId = String(body.loserId);
    if (!arena.players.some((p) => p.playerId === winnerId) || !arena.players.some((p) => p.playerId === loserId)) {
        return json(r, 404, { error: "Participante não está na Arena" });
    }
    const keys = arenaKeys(arenaId);
    await redis("EXPIRE", keys.scored, String(WORKING_TTL_SECONDS));
    const cutoff = Date.now() - SCORED_TTL_MS;
    await redis("ZREMRANGEBYSCORE", keys.scored, "-inf", String(cutoff));
    const added = await redis("ZADD", keys.scored, "NX", String(Date.now()), String(body.challengeId));
    if (added === 0) return json(r, 200, { status: "success", duplicate: true });
    await redis("HINCRBY", keys.scores, `p:${winnerId}`, 1);
    await redis("HINCRBY", keys.scores, `w:${winnerId}`, 1);
    await redis("HINCRBY", keys.scores, `g:${winnerId}`, 1);
    await redis("HINCRBY", keys.scores, `g:${loserId}`, 1);
    await redis("EXPIRE", keys.scores, String(WORKING_TTL_SECONDS));
    const scores = (await redis("HGETALL", keys.scores)) || {};
    return json(r, 200, { status: "success", duplicate: false, leaderboard: buildLeaderboard(arena, scores) });
}

async function router(r) {
    try {
        if (r.uri === '/api/hello' && r.method === 'GET') return await hello(r);
        if (r.uri.startsWith('/api/usage/') && r.method === 'PUT') return await usage(r);
            if (r.uri === '/api/arena' && r.method === 'GET') return await arenaList(r);
        if (r.uri === '/api/arena' && r.method === 'POST') return await arenaCreate(r);
        if (r.uri === '/api/arena/results' && r.method === 'GET') return await arenaResultsGet(r);
        if (r.uri.startsWith('/api/arena/') && r.method === 'GET') {
            const id = r.uri.substring('/api/arena/'.length);
            if (id && validArenaId(id)) return await arenaGet(r, decodeURIComponent(id));
        }
        const joinId = arenaIdFromUri(r, 'join');
        if (joinId && validArenaId(joinId) && r.method === 'POST') return await arenaJoin(r, joinId);
        const leaveId = arenaIdFromUri(r, 'leave');
        if (leaveId && validArenaId(leaveId) && r.method === 'POST') return await arenaLeave(r, leaveId);
        const resultId = arenaIdFromUri(r, 'result');
        if (resultId && validArenaId(resultId) && r.method === 'POST') return await arenaResult(r, resultId);
        return json(r, 404, { error: "Not Found", uri: r.uri, method: r.method });
    } catch (e) {
        logApi("request failed: " + (e && e.stack ? e.stack : e));
        return json(r, 500, { error: "Internal Server Error", message: e && e.message ? e.message : String(e) });
    }
}

export default { router };
