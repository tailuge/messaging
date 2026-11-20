// Match-result upload: the write path ported from the scoreboard's
// /api/match-results. The record building is here; the pipelined KV writes and
// the Elo update are not yet, so the handler still answers 501. The imports the
// writes will need already load in the runtime image.
//
// Imports follow the rule that njs enforces: one default export per module,
// members aliased locally. Named imports fail at load time with
// "Non-default import is not supported". The aliases below are unused until the
// write path lands, which is deliberate: they are the wiring being verified now.
import upstash from './upstash.njs';
import nchanMeta from './nchan_meta.js';

const netBucket = upstash.netBucket;
const redis = upstash.redis;
const redisPipeline = upstash.redisPipeline;
const geoForRequest = nchanMeta.geoForRequest;

// One tag for every line this module writes, so the calls and their failures are
// greppable in njs_error.log — the same file /api/stats tails for the dashboard.
// Deliberately terse: the entry line and failures only, never per-write or
// per-field tracing. Payloads are only ever summarised by their length.
const LOG_TAG = "MATCH-RESULT: ";

function logMatchResult(message) {
    ngx.log(ngx.ERR, LOG_TAG + message);
}

// This route's row in the usage page's bytes-by-route table. The slug has to
// match API_SLUGS in nchan_meta.js and apiSlug in api.njs: readNet turns every
// `e:<slug>`/`c:<slug>` key into one row labelled `/api/<slug>`.
const ROUTE_SLUG = "match-results";

// The three counters noteApiOut writes in api.njs, repeated here because that
// helper is private to the dispatcher and this module answers its own requests
// rather than going through it. Same keys, same meaning: egress bytes, call
// count, and the request body total the footer chart reads.
function noteResponseBytes(r, payload) {
    const minute = Math.floor(Date.now() / 60000);
    netBucket(minute, "e:" + ROUTE_SLUG, payload.length);
    netBucket(minute, "c:" + ROUTE_SLUG, 1);
    const inBytes = parseInt(r.headersIn['content-length'], 10);
    if (inBytes > 0) netBucket(minute, 'api.in', inBytes);
}

// The response writer, the one place a reply leaves this module. It counts the
// reply so the usage page has a row for this route, and logs the unhappy path
// itself: any non-2xx answer is recorded with its status and body, so a bad
// upload is visible without each call site remembering to log.
function json(r, status, obj) {
    const payload = JSON.stringify(obj);
    noteResponseBytes(r, payload);
    if (status >= 400) logMatchResult("answered " + status + " body=" + payload);
    r.headersOut['Content-Type'] = 'application/json';
    r.return(status, payload);
}

// 8 random hex chars, the scoreboard's getUID algorithm, inlined because nothing
// bundles that TypeScript helper into the image. Replay keys and URLs keep the
// shape the scoreboard's readers (and any issued URL) expect.
function uid() {
    return "xxxxxxxx".replace(/x/g, function () {
        return Math.floor(Math.random() * 16).toString(16);
    });
}

// The stored record: the posted body minus replayData, plus id, timestamp,
// hasReplay and geo. No allowlist — the lobby's recent-matches row keeps gaining
// fields, so anything the client sends is carried through.
//
// Geo comes last and only after the rest of the record is assembled, so the one
// thing here that can block on a network fetch (a cold ip_cache entry) never
// runs for a record that could not be built. The caller needs no separate timer:
// geoForRequest already bounds its own lookup.
async function buildRecord(r, body, replayData) {
    const record = {};
    const keys = Object.keys(body);
    for (let i = 0; i < keys.length; i += 1) {
        if (keys[i] === "replayData") continue;
        record[keys[i]] = body[keys[i]];
    }
    // Passed through unvalidated: rule types outside the five game types are
    // posted today (reveal is one), and the scoreboard stores whatever it gets.
    if (typeof record.ruleType === "undefined") record.ruleType = "nineball";
    record.id = uid();
    record.timestamp = Date.now();
    if (replayData) record.hasReplay = true;
    // The shared helper from nchan_meta.js: same ip_cache entry and the same
    // geo.* counters as presence traffic, so a cold upload seeds the entry the
    // lobby will read rather than warming a cache of its own.
    const geo = await geoForRequest(r);
    if (geo.country && geo.country !== "XX") {
        record.locationCountry = geo.country;
        if (geo.city) record.locationCity = geo.city;
    }
    return record;
}

// Stub. Logs that an upload arrived, then answers with the content type the real
// handler will use and no writes, so the route can be exercised end to end
// before any logic exists. The try/catch is the failure path Stage 2 will need:
// an exception thrown by the writes is logged with its stack and answered 500
// rather than surfacing as an empty nginx 500.
async function matchResult(r) {
    logMatchResult("called bytes=" + (r.requestText ? r.requestText.length : 0));
    try {
        return json(r, 501, { error: 'Not Implemented' });
    } catch (e) {
        logMatchResult("failed: " + (e && e.stack ? e.stack : e));
        return json(r, 500, { error: 'Internal Server Error', message: e && e.message ? e.message : String(e) });
    }
}

// buildRecord and uid are on the default export (the only kind of import this
// njs accepts) so the pure record building can be exercised without the route.
export default { matchResult, buildRecord, uid };
