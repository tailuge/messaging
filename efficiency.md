# Server CPU efficiency review

Suggestions only — nothing in this document has been applied. Paths are relative to the repo
root; line numbers are from the current `main`.

The server is two things: an Nginx/Nchan process whose JS hooks run in NJS, and the `api.njs`
router in front of Upstash Redis. Almost all "server CPU" work is one of:

| Path | Trigger | Scales with |
| --- | --- | --- |
| `nchan_meta.publish` | every publish (presence heartbeat, game move) | message rate |
| `nchan_meta.presence_sub` / `table_sub` | every WS subscribe/unsubscribe | connection rate |
| `nchan_meta.stats` | every dashboard load (`/api/stats`) | cache size × uptime |
| `api.router` | lobby/scoreboard/arena polling | request rate |
| Nchan fan-out | every publish × subscribers | messages × subscribers |
| Logging | nearly all of the above | all of it, twice |

## Method

Micro-benchmarks ran the real functions from `docker/nchan_meta.js` in Node (V8) with the
`ngx`/`require` globals stubbed, the same way `test/nchan-meta-unit.spec.ts` loads them. NJS is
typically a few times slower than V8 for regex and JSON work, so treat every number below as a
**lower bound**: the ordering is reliable, the absolute values are optimistic.

Measured (V8, per call):

| Function | Cost | Notes |
| --- | --- | --- |
| `parseUA` | 0.58 µs | ~10 regex tests |
| `reduceUA` | 0.75 µs | calls `parseUA` again |
| `createMeta` | 1.50 µs | includes `reduceUA` → second `parseUA` |
| `extractClientVersion` | 0.29 µs | two scans of the whole body |
| `injectMetaString` (330 B body) | 1.15 µs | 3 scans + `JSON.stringify(meta)` |
| `buildMeta`, warm `ip_cache` | 5.20 µs | the per-publish total |
| `getIpCache` + `getReferrerCache` (5.5k entries) | 0.20 ms | two full `keys()` scans |
| `JSON.stringify` both caches (5.5k entries) | 0.52 ms | the `/api/stats` payload |
| `getNjsLogs`, 1 MB log | 2.7 ms | whole file read + split |
| `getNjsLogs`, 10 MB log | 36.7 ms | same, and it grows with uptime |

Ranked roughly by (savings ÷ risk):

## 1. Logging is the largest avoidable fixed cost

- `docker/nginx.conf:11` sets **two** `error_log` directives, both at `info`:
  `error.log` and `njs_error.log`. Nginx writes every line to each, so the whole server pays
  double formatting + two file writes for every log record.
- `docker/nchan_meta.js:292, 342, 354, 375` log at `WARN` on **every** presence/table
  subscribe and unsubscribe (`presence_sub.. <uid>`, `table_sub …`). Between reconnects, page
  resumes and Nchan's 7200 s subscriber-timeout cycling, these are likely the most frequent log
  lines the server produces (the 20 s WebSocket pings themselves do not log).
- `docker/api.njs:6-8` (`logApi`) logs at `ERR`, and it is used for routine events, not just
  failures: `summary hit ms=…` / `summary miss ms=…` (315, 326), every tidy summary line
  (445–581), `results archiveSnapshots=…` (664), plus **whole request bodies** on create and
  result upload (671, 775) and the entire `leaderboard` on every accepted result (821). Each of
  those is a `JSON.stringify` of a payload followed by a file write, on the request path.
- `docker/nchan_meta.js:466` (`r.warn("Stats data")`) writes a line per dashboard load, and
  `:194` logs every geo-lookup failure.

Cheapest fix, in order: drop one `error_log`; lower the second to `warn` (or point both at the
same file); delete the per-connection `WARN`s or demote them to `ngx.DEBUG`; keep `logApi` for
errors but stop stringifying request bodies and leaderboards into it. If these lines are wanted
for debugging, gate them on a single `debug` flag evaluated once rather than logging
unconditionally.

Impact: proportional to log volume, and every request path pays it. Risk: none (observability
loss is the only trade-off).

## 2. `/api/stats` cost grows with uptime and cache size

- `getNjsLogs` → `getLastLines` (`docker/nchan_meta.js:452-465`) does `fs.readFileSync` of the **entire** log,
  `.trim().split("\n")` and then keeps 1000 lines. Measured 2.7 ms/MB, 37 ms for a 10 MB file,
  plus an allocation of the whole file. Nothing rotates `njs_error.log` inside the container, so
  this cost only ever grows until restart — and section 1 is what makes the file grow.
- `stats` calls `getIpCache` (411), `getReferrerCache` (422) and `getOnlineUsers`, i.e. three
  full `keys()` enumerations per load, two of them over the same `ip_cache` dict.
- The response embeds both caches verbatim, so it is O(distinct IPs) in JSON size and every
  dashboard load pays to serialise and ship it.

Suggested shape: read only the tail of the log (`fs.open` + `read` of the last ~64 KB, or a byte
offset from `statSync`), enumerate `ip_cache` once and split keys into the two maps in that pass,
and cache the assembled payload in `summary_cache` for 10–30 s — `usageStats` (`api.njs:95`)
already demonstrates exactly that pattern. Bounding the log file size (or setting the second
`error_log` to a level that keeps routine lines out) removes the growth term entirely.

## 3. Redis round trips park a worker on every request

These are I/O, not compute: an `await ngx.fetch` to Upstash costs little CPU directly (TLS setup,
JSON encode/decode, connection bookkeeping) but it holds the request open for a remote round
trip, and every extra call adds latency and per-worker queueing. Batching is therefore a latency
win first and a CPU win second — each Upstash call carries its own connection and JSON work.

- `api.njs:308`: `summary()` issues `ZINCRBY lobbyUsage` **before** the cache check at 313, so
  even a shared-dict hit pays a full HTTPS round trip. Move the counter off the cache-hit path:
  accumulate in a shared dict and flush with the pipeline once a minute, or count only misses.
- `api.njs:48`: `usage()` issues one `ZINCRBY` per page view (every `PUT /api/usage/<metric>`).
  Same treatment — buffer locally, flush on a timer.
- `api.njs:271` (`readHiscores`) and `:285` (`summaryTopPlayers`) each fire **five** parallel
  `redis()` calls — separate requests, separate TLS handshakes, ten in total per summary miss.
  `redisPipeline` (`api.njs:190`) already exists and `usageStats` uses it: two pipeline requests
  instead of ten.
- `api.njs:638` (`arenaGet`) does `GET arena` then `HGETALL scores` sequentially; one pipeline
  gets both.
- `api.njs:616` (`arenaList`) runs `tidyFinishedArenas()` (which reads `HGETALL K_ACTIVE`) and
  then re-reads the same hash; `arenaResultsGet` (645) runs the full tidy as well. Have tidy
  return its `entries`, and debounce it with a shared-dict timestamp so N clients polling in the
  same 30 s window cause one tidy, not N.

## 4. The publish hook: small per message, but the only thing that scales with traffic

`buildMeta` (`docker/nchan_meta.js:158-200`) runs on **every** presence and table publish. At
5.2 µs/op warm (V8) that is ~0.5 ms CPU per 100 publishes, or ~2.6 ms per 100 if NJS is 5×
slower — not a problem today, but it is the only path whose cost multiplies with game activity.
Free wins inside it:

- **`parseUA` runs twice per publish.** `buildMeta:164` parses, then `createMeta:151` calls
  `reduceUA`, which parses again. Pass `parsedUA` into `createMeta`. (`payload.md` §3.3 already
  describes this as the intended change for the compact-meta work.)
- **`classifyForCache:127` computes `cacheSafeUA(ua)` unconditionally**, even when both halves
  classified. Compute the fallback only when `os` or `browser` is `Unknown`.
- **`cache.set` on every publish** (`:179`, `:198`) rebuilds the whole value string, re-running
  the UA sanitiser, just to bump `count` and maybe append an origin. Storing the hit counter in
  its own dict entry, or skipping the write when nothing but the count changed, removes a
  formatted write per message.
- `incrementStat` (`publish:274`) does a `get` + `set` per publish; both counters could ride in
  the cache write that is already happening.
- `extractClientVersion:269` scans the whole body twice for a value the client already sends in
  `meta`. It is 0.29 µs, so this is only worth folding in if the function is touched anyway.

Leave `injectMetaString` alone: the string-splice approach deliberately avoids
`JSON.parse`/`JSON.stringify` of large game-state bodies, and rewriting it is a correctness risk
(payload.md §7) for an unproven gain. If it is ever measured as hot, benchmark parse+mutate+
stringify on a realistic 8 KB state payload first.

## 5. Nchan buffering copies more than the lobby needs

`docker/nchan.conf:56-57, 83-84` keep **2000** buffered messages with a 90 s timeout on both
presence locations. Nchan maintains that buffer per channel and copies each publish into every
subscriber's queue, so `buffer_length` sets the per-channel memory watermark and the amount of
message copying done on publish.

Presence traffic is one heartbeat per user per 60 s (`src/lobby.ts:67`), so a 90 s window needs
about 2–3 messages per user: a buffer of 200 already covers roughly 130 concurrently active
users, and 2000 covers ~1300 — far more than the lobby holds. Dropping presence to ~200–300
keeps the "reconnecting client sees active users immediately" property (the reason for
retention) while cutting the ring and its copying by 85–90%. Table subscriptions are already
`0` and arena channels `20`, which is the right shape.

Related: `nchan_websocket_ping_interval 20s` sends a ping frame to every connected client three
times a minute. 45–60 s is usually enough (check Render's proxy idle timeout before raising it).

## 6. Worker count

`docker/nginx.conf:9` pins `worker_processes 2`. Each worker runs its own NJS runtime, so the
in-flight requests of one worker share its connection and upstream-wait budget (Redis,
`api.country.is`): a burst of awaits lengthens that worker's queue rather than blocking it, but
with only two workers the queueing starts early. Under bursty load (a lobby full of heartbeats
plus several game tables) that is where latency comes from. If the container has
more than 2 vCPUs, `worker_processes auto` is worth testing; the shared dicts are genuinely
shared, so this does not multiply cache memory. Do not raise it blindly — measure with
`docker stats` first, and remember each worker runs its own NJS runtime with its own memory.

## 7. Static assets

`location /` in `nchan.conf` uses `expires -1` (no-cache), and `docker/nginx.conf` enables gzip
at level 4 for HTML/plain text, JSON and JS. The bundles are `lobby.js` 180 KB, `reveal` 124 KB,
`map` 92 KB and `arena` 84 KB, so each load revalidates (usually a cheap 304) and any full 200 is
compressed on the worker, per request. Building `.gz` artefacts alongside the bundles and
enabling `gzip_static` removes that per-request compression; a short `expires` (or
content-hashed filenames) removes the revalidation traffic. Low impact per request, but it is
pure waste, and it also cuts bandwidth and TLS work.

## 8. Client-side levers that reduce server work

No server change needed; listed because they dominate the message rate the server sees.

- **Heartbeat interval.** `src/lobby.ts:67` defaults to 60 s, which is what makes
  `/publish/presence/lobby` the busiest endpoint. 75 s cuts publish volume 20 % while staying
  inside the 90 s presence message timeout; 90 s would sit exactly on the retention edge and
  risks a client momentarily showing as absent.
- **Keep `/api/stats` manual.** `src/client/dashboard.html:931` fetches once on load, with a
  Refresh button. If it ever gains a timer, implement section 2's response cache first — each
  load is a full dict dump plus log read.
- `active-arenas.js` deliberately loads on mount only, and `arena-view.js` refetches on presence
  change rather than on a timer. Preserve that; a 30 s poll on either would multiply section 3's
  tidy work by the number of open tabs.

## Not worth optimising

- `parseUA`'s regex chain itself (0.58 µs) — only the duplicate call (section 4) matters.
- `obfuscateIp` / `obfuscateOrigin` — string ops over tens of bytes.
- CORS/`Vary` headers on every response, `add_header` counts, `limit_req` — noise at any
  realistic request rate.
- `njs_error.log` parsing as such: the cost is reading the file (section 2), not the filter.

## How to verify any of this before/after

1. **Log pressure:** `wc -l` and `du -h /var/log/nginx/*.log` inside the container (or
   `docker exec`), sampled hourly. Section 1 and 2 should show up here first.
2. **Endpoint cost:** `ab -n 200 -c 10` (or `wrk`) against `/api/summary` and `/api/stats` locally
   with `npm run docker:start`. `/api/stats` is the only one expected to move the needle.
3. **Publish path:** wrap `publish` in `Date.now()` deltas logged at `ngx.DEBUG`, run a table's
   worth of moves (or the Playwright suites) and compare p50/p99.
4. **Container CPU:** `docker stats` while running `npm run test` (testcontainers) and
   `npx playwright test`; record before/after so a change is never claimed without evidence.
