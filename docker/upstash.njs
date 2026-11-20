// Upstash REST access shared by the API routes: one command (`redis`), many
// commands in one request (`redisPipeline`), and the byte/minute accounting both
// feed (`noteUpstash`, via `netBucket`). Extracted from api.njs so a second
// writer module can use the same connection code instead of copying it, and so
// every caller's traffic lands in the same `up.*` counters.
//
// One default export, not named exports: the njs in the runtime image rejects
// `import { redis } from './upstash.njs'` at load time with "Non-default import
// is not supported". Callers import the default and alias the members they use.
//
// `netBucket` lives here rather than in api.njs because noteUpstash needs it.
// nchan_meta.js keeps its own copy of the same function: that module is loaded
// by the publish hooks and the duplicate is a few lines, so the two files do not
// import from each other.

// ---- network byte accounting ----------------------------------------------
// Same in-memory minute buckets as nchan_meta.js: one JSON object per minute
// (`n:<minute>`), matching the reader there; the two workers can lose a delta on
// a simultaneous write. Only lengths are ever recorded, never parsed payloads.
const NET_PREFIX = "n:";
const NET_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function netBucket(minute, metric, delta) {
    if (!(delta > 0)) return;
    const dict = ngx.shared.net_stats;
    if (!dict) return;
    const key = NET_PREFIX + minute;
    const raw = dict.get(key);
    let bucket = {};
    if (raw) {
        try { bucket = JSON.parse(raw) || {}; } catch (e) { bucket = {}; }
    }
    bucket[metric] = (parseInt(bucket[metric], 10) || 0) + delta;
    dict.set(key, JSON.stringify(bucket), NET_TTL_MS);
}

function noteUpstash(calls, reqBytes, respBytes, ms, failed) {
    const minute = Math.floor(Date.now() / 60000);
    netBucket(minute, 'up.calls', calls);
    netBucket(minute, 'up.in', reqBytes);
    netBucket(minute, 'up.out', respBytes);
    netBucket(minute, 'up.ms', ms);
    if (failed) netBucket(minute, 'up.err', 1);
}

// Credentials + URL check shared by the single-command and pipeline callers, so
// the two can't drift. Trailing slash is stripped because the pipeline endpoint is
// reached by appending a path.
function redisEndpoint() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL/TOKEN not configured");
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
        throw new Error("UPSTASH_REDIS_REST_URL must start with http:// or https://");
    }
    return { url: url.replace(/\/$/, ""), token: token };
}

async function redis() {
    const args = Array.prototype.slice.call(arguments);
    // Plain property access, not destructuring: the njs bundled in the runtime image
    // rejects destructuring assignment outright (SyntaxError at load time), and this
    // code has never used it elsewhere.
    const endpoint = redisEndpoint();
    const body = JSON.stringify(args);
    const started = Date.now();
    let res;
    try {
        res = await ngx.fetch(endpoint.url, {
            method: "POST",
            headers: { Authorization: `Bearer ${endpoint.token}`, "Content-Type": "application/json" },
            body: body,
        });
    } catch (e) {
        noteUpstash(1, body.length, 0, Date.now() - started, true);
        throw e;
    }
    // text() rather than json(): the response body length is the outbound byte
    // count for this call, and it is only paid on a cache miss.
    const text = await res.text();
    const ms = Date.now() - started;
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        noteUpstash(1, body.length, text.length, ms, true);
        throw e;
    }
    noteUpstash(1, body.length, text.length, ms, Boolean(data && data.error));
    if (data.error) throw new Error(`Redis: ${data.error}`);
    return data.result;
}

// Several commands in ONE HTTP request: POST <url>/pipeline with a two-dimensional
// body of command arrays, answered by one {"result"} or {"error"} object per command,
// in order. Each Upstash REST call is a full round trip to a remote host, so this is
// the difference between N round trips and one — and unlike parallel `ngx.fetch`
// calls it needs a single connection with a single handshake.
//
// Two properties matter when using it:
//  - NOT atomic. Other clients' commands may interleave with the pipeline, so this is
//    only safe for commands that don't need isolation from each other or from writers.
//  - Ordered. Commands execute in the order given, so a read placed after some writes
//    in the same pipeline observes them. That is why a read can safely ride along with
//    the writes that feed it, where a sibling promise would race.
// Commands are still billed individually; the saving is round trips, not commands.
async function redisPipeline(commands) {
    const endpoint = redisEndpoint();
    const body = JSON.stringify(commands);
    const started = Date.now();
    let res;
    try {
        res = await ngx.fetch(endpoint.url + "/pipeline", {
            method: "POST",
            headers: { Authorization: `Bearer ${endpoint.token}`, "Content-Type": "application/json" },
            body: body,
        });
    } catch (e) {
        noteUpstash(1, body.length, 0, Date.now() - started, true);
        throw e;
    }
    const text = await res.text();
    const ms = Date.now() - started;
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        noteUpstash(1, body.length, text.length, ms, true);
        throw e;
    }
    noteUpstash(1, body.length, text.length, ms, !Array.isArray(data));
    if (!Array.isArray(data)) {
        throw new Error(`Redis pipeline: ${data && data.error ? data.error : "unexpected response"}`);
    }
    const results = [];
    for (let i = 0; i < data.length; i += 1) {
        const item = data[i];
        if (item && item.error) throw new Error(`Redis: ${item.error}`);
        results.push(item ? item.result : null);
    }
    return results;
}

export default {
    netBucket: netBucket,
    noteUpstash: noteUpstash,
    redis: redis,
    redisPipeline: redisPipeline,
};
