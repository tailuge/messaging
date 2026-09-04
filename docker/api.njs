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

const USAGE_KEYS = ["chineseUsage", "koreanUsage", "germanUsage", "turkishUsage", "vietnameseUsage"];

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

function normalizeUsage(result) {
    const rows = [];
    if (!Array.isArray(result)) return rows;

    for (let i = 0; i < result.length; i += 1) {
        let member;
        let score;
        if (Array.isArray(result[i])) {
            member = result[i][0];
            score = result[i][1];
        } else if (i + 1 < result.length && typeof result[i] !== "object") {
            member = result[i];
            score = result[++i];
        } else if (result[i] && typeof result[i] === "object") {
            member = result[i].value;
            score = result[i].score;
        }

        try {
            const parsed = typeof member === "string" ? JSON.parse(member) : member;
            const count = Number(score);
            if (parsed && parsed.date && Number.isFinite(count)) {
                rows.push({ date: parsed.date, count });
            } else {
                logApi("usage malformed entry member=" + String(member) + " score=" + String(score));
            }
        } catch (e) {
            logApi("usage member parse failed: " + (e && e.message ? e.message : e));
        }
    }
    rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    return rows;
}

async function usageStats(r) {
    const data = {};
    for (let i = 0; i < USAGE_KEYS.length; i += 1) {
        const key = USAGE_KEYS[i];
        try {
            const result = await redis("ZRANGE", key, "0", "-1", "WITHSCORES");
            logApi("usage key=" + key + " result=" + JSON.stringify(result));
            data[key] = normalizeUsage(result);
        } catch (e) {
            logApi("usage fetch failed key=" + key + ": " + (e && e.stack ? e.stack : e));
            throw e;
        }
    }
    return json(r, 200, data);
}

async function redis() {
    const args = Array.prototype.slice.call(arguments);
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL/TOKEN not configured");        if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
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

const K_ACTIVE = "arena:active";
const K_ARCHIVED = "arena:archived";
const RESULT_HISTORY_LIMIT = 20;
const ARENA_DURATION_MINUTES = [10, 30];
const WORKING_TTL_SECONDS = 48 * 60 * 60;
const SCORED_TTL_MS = 24 * 60 * 60 * 1000;
const SEEDED_PLAYERS = [
    { playerId: "bot-thefarjaw", name: "TheFarJaw" },
    { playerId: "bot-clawbreak", name: "ClawBreak" },
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
    try { arena = JSON.parse(raw); } catch (e) { throw new Error("Arena data corrupted in KV"); }
    const before = arena.status;
    transition(arena);
    if (arena.status !== before) await redis("SET", keys.arena, JSON.stringify(arena), "EX", String(WORKING_TTL_SECONDS));
    return arena;
}

function requireActive(arena) {
    if (!arena) return "No arena found";
    if (arena.status === "scheduled") return "Arena has not started yet";
    if (arena.status === "finished") return "Arena has already ended";
    return null;
}

function scoresFromHgetall(result) {
    const scores = {};
    if (!result || !Array.isArray(result)) return scores;
    for (let i = 0; i + 1 < result.length; i += 2) {
        scores[String(result[i])] = String(result[i + 1]);
    }
    return scores;
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

function parseHashEntries(result) {
    const entries = [];
    if (!result) return entries;
    if (Array.isArray(result)) {
        for (let i = 0; i + 1 < result.length; i += 2) {
            entries.push([String(result[i]), result[i + 1]]);
        }
    } else if (typeof result === "object") {
        const keys = Object.keys(result);
        for (let i = 0; i < keys.length; i += 1) {
            const k = keys[i];
            entries.push([k, result[k]]);
        }
    }
    return entries;
}

async function tidyFinishedArenas() {
    try {
        const raw = await redis("HGETALL", K_ACTIVE);
        const entries = parseHashEntries(raw);
        if (entries.length === 0) return;

        const now = Date.now();
        const staleIds = [];
        const archiveArgs = [];

        for (let i = 0; i < entries.length; i += 1) {
            const id = entries[i][0];
            let arena = null;
            try {
                arena = typeof entries[i][1] === "string" ? JSON.parse(entries[i][1]) : entries[i][1];
            } catch (e) {}

            if (!arena || arena.status === "finished" || (typeof arena.endTime === "number" && now >= arena.endTime)) {
                staleIds.push(id);
                const score = (arena && typeof arena.endTime === "number") ? arena.endTime : now;
                archiveArgs.push(String(score), id);
            }
        }

        if (staleIds.length > 0) {
            await redis.apply(null, ["HDEL", K_ACTIVE].concat(staleIds));
        }
        if (archiveArgs.length > 0) {
            await redis.apply(null, ["ZADD", K_ARCHIVED, "NX"].concat(archiveArgs));
        }

        const count = Number(await redis("ZCARD", K_ARCHIVED)) || 0;
        if (count > RESULT_HISTORY_LIMIT) {
            await redis("ZREMRANGEBYRANK", K_ARCHIVED, "0", String(count - RESULT_HISTORY_LIMIT - 1));
        }
    } catch (e) {
        logApi("tidyFinishedArenas error: " + (e && e.message ? e.message : e));
    }
}

async function arenaList(r) {
    const raw = await redis("HGETALL", K_ACTIVE);
    const entries = parseHashEntries(raw);
    const arenas = [];
    for (let i = 0; i < entries.length; i += 1) {
        try {
            const arena = typeof entries[i][1] === "string" ? JSON.parse(entries[i][1]) : entries[i][1];
            if (arena && typeof arena === "object") {
                transition(arena);
                arenas.push(arena);
            }
        } catch (e) {}
    }
    arenas.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return json(r, 200, { status: "success", arenas: arenas });
}

async function arenaGet(r, arenaId) {
    const arena = await loadArena(arenaId);
    if (!arena) return json(r, 404, { error: "No arena found" });
    const scores = scoresFromHgetall(await redis("HGETALL", arenaKeys(arenaId).scores));
    return json(r, 200, { status: "success", arena, leaderboard: buildLeaderboard(arena, scores) });
}

async function arenaResultsGet(r) {
    const ids = (await redis("ZREVRANGE", K_ARCHIVED, "0", String(RESULT_HISTORY_LIMIT - 1))) || [];
    if (!Array.isArray(ids) || ids.length === 0) {
        return json(r, 200, { status: "success", results: [] });
    }
    const keys = ids.map((id) => arenaKeys(id).arena);
    const records = (await redis.apply(null, ["MGET"].concat(keys))) || [];
    const results = [];
    for (let i = 0; i < records.length; i += 1) {
        if (!records[i]) continue;
        try {
            const arena = JSON.parse(records[i]);
            transition(arena);
            results.push(arena);
        } catch (e) {}
    }
    return json(r, 200, { status: "success", results });
}

async function arenaCreate(r) {
    await tidyFinishedArenas();
    const body = await readBody(r);
    if (!body) return json(r, 400, { error: "Invalid JSON" });
    logApi("create payload=" + JSON.stringify(body));
    if (typeof body.ruleType !== "string" || !body.ruleType) {
        return json(r, 400, { error: "ruleType is required" });
    }
    if (!body.options || typeof body.options !== "object" || Array.isArray(body.options)) {
        return json(r, 400, { error: "options is required" });
    }
    const start = Date.now();
    let endTime;
    let durationMinutes;
    if (typeof body.endTime === "number") {
        // Hourly-seed path: exact end time so auto arenas end on the UTC
        // hour / half-hour. The arena may run shorter than 30 minutes to
        // reach the next boundary.
        if (body.endTime <= start || body.endTime > start + 30 * 60 * 1000) {
            return json(r, 400, { error: "endTime must be between now and +30 minutes" });
        }
        durationMinutes = Math.max(1, Math.round((body.endTime - start) / 60000));
        endTime = body.endTime;
    } else {
        if (typeof body.durationMinutes !== "number" || ARENA_DURATION_MINUTES.indexOf(body.durationMinutes) === -1) {
            return json(r, 400, { error: "durationMinutes must be 10 or 30" });
        }
        durationMinutes = body.durationMinutes;
        endTime = start + durationMinutes * 60 * 1000;
    }
    const id = typeof body.id === "string" && body.id.length > 0
        ? body.id
        : "arena-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const arena = {
        id,
        creatorId: body.creatorId ? String(body.creatorId) : "",
        creatorName: body.creatorName ? String(body.creatorName) : "Anonymous",
        ruleType: body.ruleType,
        options: body.options,
        durationMinutes: durationMinutes,
        startTime: start,
        endTime: endTime,
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
    await redis("HSET", K_ACTIVE, id, JSON.stringify(arena));
    await redis("EXPIRE", keys.scores, String(WORKING_TTL_SECONDS));
    await redis("EXPIRE", keys.scored, String(WORKING_TTL_SECONDS));
    return json(r, 201, { status: "success", arena });
}

async function arenaJoin(r, arenaId) {
    const body = await readBody(r);
    if (!body) return json(r, 400, { error: "Invalid JSON" });
    if (!body.playerId) return json(r, 400, { error: "playerId is required" });
    const arena = await loadArena(arenaId);
    const err = requireActive(arena);
    if (err) return json(r, 409, { error: err });
    const playerId = String(body.playerId);
    const existing = arena.players.find((p) => p.playerId === playerId);
    if (existing) {
        if (existing.active) return json(r, 409, { error: "Already a participant" });
        // Rejoin after leaving: reactivate the existing record rather than duplicating it
        existing.active = true;
        existing.name = String(body.name || existing.name || playerId);
    } else {
        arena.players.push({
            playerId: playerId,
            name: String(body.name || playerId),
            active: true,
        });
    }
    const keys = arenaKeys(arenaId);
    await redis("SET", keys.arena, JSON.stringify(arena), "EX", String(WORKING_TTL_SECONDS));
    await redis("HSET", K_ACTIVE, arenaId, JSON.stringify(arena));
    return json(r, 200, { status: "success", arena });
}

async function arenaLeave(r, arenaId) {
    const body = await readBody(r);
    if (!body) return json(r, 400, { error: "Invalid JSON" });
    const arena = await loadArena(arenaId);
    if (!arena) return json(r, 404, { error: "No arena found" });
    const playerId = String(body.playerId);
    const rec = arena.players.find((p) => p.playerId === playerId);
    if (!rec) return json(r, 404, { error: "Not a participant" });
    rec.active = false;
    await redis("SET", arenaKeys(arenaId).arena, JSON.stringify(arena), "EX", String(WORKING_TTL_SECONDS));
    await redis("HSET", K_ACTIVE, arenaId, JSON.stringify(arena));
    return json(r, 200, { status: "success" });
}

async function arenaResult(r, arenaId) {
    const body = await readBody(r);
    if (!body) return json(r, 400, { error: "Invalid JSON" });
    logApi("arena result upload arenaId=" + arenaId + " payload=" + JSON.stringify(body));
    if (!body.challengeId || !body.winnerId || !body.loserId) {
        return json(r, 400, { error: "challengeId, winnerId and loserId are required" });
    }
    if (String(body.winnerId) === String(body.loserId)) return json(r, 400, { error: "winnerId and loserId must differ" });
    const arena = await loadArena(arenaId);
    const err = requireActive(arena);
    if (err) return json(r, 409, { error: err });
    const winnerId = String(body.winnerId);
    const loserId = String(body.loserId);
    if (!arena.players.some((p) => p.playerId === winnerId) || !arena.players.some((p) => p.playerId === loserId)) {
        return json(r, 404, { error: "Participant is not in the Arena" });
    }
    const keys = arenaKeys(arenaId);
    await redis("EXPIRE", keys.scored, String(WORKING_TTL_SECONDS));
    const cutoff = Date.now() - SCORED_TTL_MS;
    await redis("ZREMRANGEBYSCORE", keys.scored, "-inf", String(cutoff));
    const added = await redis("ZADD", keys.scored, "NX", String(Date.now()), String(body.challengeId));
    if (added === 0) {
        logApi("arena result duplicate arenaId=" + arenaId + " challengeId=" + String(body.challengeId));
        return json(r, 200, { status: "success", duplicate: true });
    }
    const winnerPoints = body.beserk === true ? 2 : 1;
    await redis("HINCRBY", keys.scores, `p:${winnerId}`, winnerPoints);
    await redis("HINCRBY", keys.scores, `w:${winnerId}`, 1);
    await redis("HINCRBY", keys.scores, `g:${winnerId}`, 1);
    await redis("HINCRBY", keys.scores, `g:${loserId}`, 1);
    await redis("EXPIRE", keys.scores, String(WORKING_TTL_SECONDS));
    const scores = scoresFromHgetall(await redis("HGETALL", keys.scores));
    const leaderboard = buildLeaderboard(arena, scores);
    logApi("arena result accepted arenaId=" + arenaId + " challengeId=" + String(body.challengeId) + " winnerId=" + winnerId + " loserId=" + loserId + " leaderboard=" + JSON.stringify(leaderboard));
    return json(r, 200, { status: "success", duplicate: false, leaderboard: leaderboard });
}

async function router(r) {
    try {
        if (r.uri === '/api/hello' && r.method === 'GET') return await hello(r);
        if (r.uri === '/api/usage' && r.method === 'GET') return await usageStats(r);
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
