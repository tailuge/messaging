// Match-result upload: the write path ported from the scoreboard's
// /api/match-results. The record building, the replay split, the Elo math and
// the exact command list of the writes all live here.
//
// WRITES_ENABLED is the one switch deciding whether that command list is sent.
// It is true: an upload runs the read (`HMGET elo:<ruleType>`, so the Elo maths
// sees live ratings), sends the SET/ZADD/ZREMRANGEBYRANK/HSET list as one
// pipeline and answers 201 with the record it built. Flip it to false to get the
// dry run back — same read, same answer, no KV write — which is the off-ramp if
// the writes ever need to stop quickly; the handler body needs no other edit.
//
// Imports follow the rule that njs enforces: one default export per module,
// members aliased locally. Named imports fail at load time with
// "Non-default import is not supported".
import upstash from './upstash.njs';
import nchanMeta from './nchan_meta.js';

const redis = upstash.redis;
const redisPipeline = upstash.redisPipeline;
const netBucket = upstash.netBucket;
const geoForRequest = nchanMeta.geoForRequest;

// One tag for every line this module writes, so the calls and their failures are
// greppable in njs_error.log — the same file /api/stats tails for the dashboard.
// Deliberately terse: the entry line and failures only, never per-write or
// per-field tracing. Payloads are only ever summarised by their length.
const LOG_TAG = "MATCH-RESULT: ";

// The single place the port decides whether it is allowed to mutate the KV.
const WRITES_ENABLED = true;

// This route's row in the usage page's bytes-by-route table. The slug has to
// match API_SLUGS in nchan_meta.js and apiSlug in api.njs: readNet turns every
// `e:<slug>`/`c:<slug>` key into one row labelled `/api/<slug>`.
const ROUTE_SLUG = "match-results";

// Kept identical to the scoreboard: the replay blob lives for 5 days, and the
// recent-matches window is the newest 32 entries (ranks 0 to -33).
const REPLAY_TTL_S = 432000;
const MATCH_RESULTS_KEY = "match_results";
const MATCH_RESULTS_TRIM = -33;

// Classic Elo, per the spec: K = 32, no deviation, no volatility, no decay.
const K_FACTOR = 32;
const DEFAULT_RATING = 1500;

function logMatchResult(message) {
    ngx.log(ngx.ERR, LOG_TAG + message);
}

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

// UTC day, the elo-history hash field, exactly as the scoreboard writes it.
function historyDate(ms) {
    return new Date(ms).toISOString().split("T")[0];
}

// ---- ratings ---------------------------------------------------------------

// One stored rating hash value. Anything unreadable is treated as a fresh player
// rather than an error: the upload must still succeed, and an unknown player
// starts at 1500 by the spec.
function readRating(raw) {
    let parsed = null;
    if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    }
    const stored = parsed && typeof parsed === "object" ? parsed : {};
    const rating = Math.round(Number(stored.rating));
    return {
        rating: Number.isFinite(rating) ? rating : DEFAULT_RATING,
        gamesPlayed: parseInt(stored.gamesPlayed, 10) || 0,
        wins: parseInt(stored.wins, 10) || 0,
        losses: parseInt(stored.losses, 10) || 0,
    };
}

// All seven existing keys, so no reader can break on a missing field. rd and
// volatility are inert now, but they stay because /api/elo and the player page
// still read the hash expecting them.
function ratingJson(rating, gamesPlayed, wins, losses, lastUpdated) {
    return JSON.stringify({
        rating: rating,
        rd: 0,
        volatility: 0,
        lastUpdated: lastUpdated,
        gamesPlayed: gamesPlayed,
        wins: wins,
        losses: losses,
    });
}

// Plain Elo. Both stored ratings are rounded to integers, one integer delta is
// computed, and the loser loses exactly what the winner gains — rounding the two
// new values independently would let that drift by a point. Both players carry
// the same `lastUpdated`, which is what the Glicko writer did.
function planRatings(winnerRaw, loserRaw, now) {
    const winner = readRating(winnerRaw);
    const loser = readRating(loserRaw);
    const expected = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
    const delta = Math.round(K_FACTOR * (1 - expected));
    return {
        delta: delta,
        winnerBefore: winner.rating,
        loserBefore: loser.rating,
        winnerAfter: winner.rating + delta,
        loserAfter: loser.rating - delta,
        winnerJson: ratingJson(winner.rating + delta, winner.gamesPlayed + 1, winner.wins + 1, winner.losses, now),
        loserJson: ratingJson(loser.rating - delta, loser.gamesPlayed + 1, loser.wins, loser.losses + 1, now),
    };
}

// ---- record ----------------------------------------------------------------

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

// ---- writes ----------------------------------------------------------------

// The command list this upload would issue, built whether or not it will be sent
// so the dry run and the real write differ in exactly one place. The one read
// lives here: HMGET, because the Elo maths needs both current ratings before the
// HSETs can be planned.
async function planWrites(record, replayData) {
    const commands = [];
    if (replayData) commands.push(["SET", "match_replay:" + record.id, replayData, "EX", REPLAY_TTL_S]);
    commands.push(["ZADD", MATCH_RESULTS_KEY, record.timestamp, JSON.stringify(record)]);
    commands.push(["ZREMRANGEBYRANK", MATCH_RESULTS_KEY, 0, MATCH_RESULTS_TRIM]);
    // Ratings only move for a two-player result. Bot games carry a `loser`, so
    // they count; a solo or reveal upload does not.
    if (typeof record.loser === "undefined" || !record.loser) return commands;

    const ratingKey = "elo:" + record.ruleType;
    const current = await redis("HMGET", ratingKey, record.winner, record.loser);
    const ratings = planRatings(
        current ? current[0] : null,
        current ? current[1] : null,
        record.timestamp
    );
    const date = historyDate(record.timestamp);
    commands.push(["HSET", ratingKey, record.winner, ratings.winnerJson]);
    commands.push(["HSET", ratingKey, record.loser, ratings.loserJson]);
    // A hash, not a sorted set: field = UTC date, value = the integer rating.
    // A second result on the same day overwrites that day's point.
    commands.push(["HSET", "elo-history:" + record.ruleType + ":" + record.winner, date, String(ratings.winnerAfter)]);
    commands.push(["HSET", "elo-history:" + record.ruleType + ":" + record.loser, date, String(ratings.loserAfter)]);
    return commands;
}

// Happy path only: a malformed body throws and is answered 500 by the catch
// below, which is the spec's stance (no input validation on this route).
async function matchResult(r) {
    const bytes = r.requestText ? r.requestText.length : 0;
    // The entry line is the whole point of this route while writes are off, so it
    // carries the dry-run state and how many commands the upload planned.
    logMatchResult("called bytes=" + bytes + (WRITES_ENABLED ? "" : " dryRun=1"));
    try {
        const body = JSON.parse(r.requestText || "{}");
        const replayData = body.replayData;
        const record = await buildRecord(r, body, replayData);
        const commands = await planWrites(record, replayData);
        if (WRITES_ENABLED) {
            await redisPipeline(commands);
            logMatchResult("wrote " + commands.length + " commands");
        } else {
            logMatchResult("skipped " + commands.length + " writes");
        }
        return json(r, 201, record);
    } catch (e) {
        logMatchResult("failed: " + (e && e.stack ? e.stack : e));
        return json(r, 500, { error: 'Internal Server Error', message: e && e.message ? e.message : String(e) });
    }
}

// Exported on the default (the only kind of import this njs accepts) so the pure
// record building and the Elo maths can be exercised without the route.
export default { matchResult, buildRecord, planWrites, planRatings, readRating, uid, WRITES_ENABLED };
