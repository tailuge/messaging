function json(r, status, obj) {
    r.headersOut['Content-Type'] = 'application/json';
    r.return(status, JSON.stringify(obj));
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
    if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL/TOKEN não configurados");
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
const RESULT_HISTORY_LIMIT = 10;
const SCORED_TTL_MS = 2 * 60 * 60 * 1000;
const WORKING_TTL_SECONDS = 4 * 60 * 60;

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
        elo: typeof rec.elo === "number" ? rec.elo : 0,
        points: scoreFor(scores, rec.playerId).points,
        wins: scoreFor(scores, rec.playerId).wins,
        games: scoreFor(scores, rec.playerId).games,
    }));
    rows.sort((a, b) => b.points - a.points || b.elo - a.elo ||
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
    if (!body || !body.gameType) return json(r, 400, { error: body ? "gameType obrigatório" : "JSON inválido" });
    const start = typeof body.startTime === "number" ? body.startTime : Date.now();
    const duration = typeof body.durationMs === "number" && body.durationMs > 0 ? body.durationMs : 60 * 60 * 1000;
    const id = "arena-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const arena = {
        id,
        gameType: String(body.gameType),
        startTime: start,
        endTime: start + duration,
        status: start > Date.now() ? "scheduled" : "active",
        players: [],
        createdAt: Date.now(),
    };
    const keys = arenaKeys(id);
    await redis("SET", keys.arena, JSON.stringify(arena), "EX", String(WORKING_TTL_SECONDS), "NX");
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
        elo: typeof body.elo === "number" ? body.elo : 0,
        joinedAt: Date.now(),
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
    const rec = arena.players.find((p) => p.playerId === String(body.playerId));
    if (!rec) return json(r, 404, { error: "Não participante" });
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
        return json(r, 500, { error: "Internal Server Error", message: e.message });
    }
}

export default { router };
