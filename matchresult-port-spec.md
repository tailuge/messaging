# Match result port

Port the match-result write path into `../messaging`: the handler lives in a new
`docker/matchresult.njs` module driven from `docker/api.njs`, writing to the same
Upstash KV the scoreboard already uses.

Backend write path only. The client repoint, the cutover, and any change to the
scoreboard's own routes are out of scope.

## Progress

Staged implementation, in order. Stages 0 and 1 have landed in `messaging`, and
Stage 2's logic is in: the route builds the record, splits the replay, runs the
Elo maths against live ratings and assembles the exact write list. What it does
not do yet is send that list — `WRITES_ENABLED` in `matchresult.njs` is `false`,
so no KV write lands. See **Dry run** below.

| Stage | Scope | Status |
| --- | --- | --- |
| 0 | Shared plumbing: `upstash.njs` extraction, and `geoForRequest(r)` pulled out of `buildMeta` in `nchan_meta.js` and exported | Done |
| 1 | Endpoint skeleton: `docker/matchresult.njs` with a default-exported `matchResult` (501 stub), imported and dispatched from `api.njs`, `COPY` in the Dockerfile | Done |
| 2 | `buildRecord`, replay blob, pipelined KV writes, Elo updates | Logic done, writes disabled |
| 3 | Container verification (the checklist below) and the scoreboard checks | Not started |

Stage 0 is covered by `test/nchan-meta-unit.spec.ts`, which now exercises
`geoForRequest` on a cache hit, a cold lookup and a failed lookup, and asserts
the helper is on the default export. Stage 1 has no logic to test: it exists so
the module loads at nginx start and the route answers before the writes land.
It does carry the logging and the response accounting described under **Logging**,
which are the parts Stage 2 reuses unchanged.

The route now answers the response described under **Response** below — `201`
with the stored record — whether or not the writes are enabled, because that
reply is what the client contract is checked against. The client only checks
`response.ok`, so it is not pointed at this host yet (repointing is out of scope
anyway).

## Dry run

`WRITES_ENABLED = false` at the top of `matchresult.njs` is the one switch, and
while it is off:

- The read still runs. `planWrites` issues the real `HMGET elo:<ruleType>
  <winner> <loser>`, so the Elo maths sees live ratings, and a read failure still
  surfaces as a `500` instead of being hidden by the switch.
- The command list is still built — replay `SET`, `ZADD`, `ZREMRANGEBYRANK` and
  the four rating/history `HSET`s — and then dropped rather than sent. Flipping
  the constant to `true` sends it; nothing else in the handler changes.
- The answer is still `201` with the built record, so the client path, the
  response writer and the byte accounting are exercised for real.
- Nothing in the KV changes: no new `match_results` member, no replay blob, no
  rating write, no history field.

This is the state the container checks run in for anything that has to be
observed without touching shared data. The writes themselves stay unverified
until the switch is flipped. `test/matchresult-unit.spec.ts` covers what needs no
KV: the Elo maths (zero-sum, the integer snap, `K = 32` at both extremes, the
seven-key rating JSON, the counter increments), the record building (`replayData`
split, arbitrary `ruleType` verbatim, geo omitted on `XX`, the `uid` shape) and
the dry run itself (a `201` after exactly one `HMGET` and no pipeline).

## Goal

Accept a POSTed match result in messaging, store it, and update player ratings —
with less code and fewer stored fields than the current Vercel implementation,
and without running on Vercel Fluid Compute at all.

The success condition is "match uploads no longer bill Vercel". The client does
block on the response: `../billiards` `src/controller/end.ts` awaits the upload,
and in the arena flow it then awaits the arena result with the "Back to Arena"
button disabled for the duration — so the reply should come back as soon as the
writes have landed, with nothing else queued in front of it.

## Scope

**In scope**

- A `POST /api/match-results` handler in messaging, in its own module.
- The stored match record and its KV writes.
- Replay blob storage.
- Geo (country/city) for the stored record, via the existing NJS IP cache and
  its country lookup.
- Player rating updates, including which rating shape is written.

**Out of scope**

- Repointing the client (`../billiards`) at the messaging host.
- Cutover sequencing, dual writing, or retiring anything on the scoreboard.
- Deleting or editing the scoreboard's `src/pages/api/match-results.ts` — leave
  it untouched even though its POST becomes unused.
- Request-body size limits (nginx already caps at 1MB).
- Duplicate suppression — see Future work.
- The arena result flow (`/api/arena/<id>/result`), usage metrics, hiscores, and
  `GET /api/match-results`.

## Current flow (for reference)

The scoreboard builds the record, then `MatchResultService.addMatchResult` writes
`match_replay:<id>`, adds the record to the `match_results` sorted set scored by
timestamp, trims to the newest 32, and — for two-player uploads — updates both
players' Glicko-2 ratings plus an `elo-history` entry.

- The only caller of the scoreboard route is `../billiards`
  `src/network/client/scorereporter.ts`, and it only ever POSTs.
- `GET /api/match-results` has no callers anywhere in either repo.
- The lobby reads matches through `/api/summary`, so the stored field set is
  driven by the lobby's recent-matches row, not by the route's response.

## Route and wiring

- New module `docker/matchresult.njs`, exporting one handler (suggested name
  `matchResult`) via a default export, matching how `api.njs` and
  `nchan_meta.js` already export.
- `docker/api.njs` gains one import at the top and one dispatch line in its
  `router` for `POST /api/match-results`. It does not grow a handler: the file
  stays a dispatcher.
- Done already: the Upstash helpers were private to `api.njs`, so they were
  pulled out rather than duplicated. `redis`, `redisPipeline`, `noteUpstash` and
  the bucket counter they record into now live in `docker/upstash.njs`;
  `redisEndpoint` stays private to it. The functions are unchanged, so the
  `up.*` accounting still covers every call whichever module makes it, and
  `api.njs` is ~100 lines shorter with its call sites untouched.
- `upstash.njs` exports **one object as the default export**, because the njs in
  the runtime image rejects named imports: `import { redis } from './upstash.njs'`
  fails at load with `SyntaxError: Non-default import is not supported`. Callers
  do `import upstash from './upstash.njs'` and alias what they use
  (`const redis = upstash.redis;`), which keeps `redis(...)`/`redisPipeline(...)`
  calls as they were. This was verified against the built image, not assumed —
  it is the one module-loading rule to respect when adding `matchresult.njs`.
- The geo helper is shared the same way, not copied: `docker/nchan_meta.js`
  exports the cache-read / miss-lookup / cache-write block from `buildMeta` as
  `geoForRequest(r)`, returning `{country, city}`, and `buildMeta` calls it
  before adding `u` and `o`. No behaviour change on the publish path;
  `geo.calls`/`geo.out` still count every lookup. `nchan_meta.js` keeps its
  default export for `js_import`.
- NJS syntax: the bundled njs rejects destructuring assignment at load time
  (`api.njs` documents this where it reads the environment field by field), and
  neither deployed module uses rest/spread, `??` or optional chaining. The new
  module stays with the syntax those files already use.
- `docker/Dockerfile` gains `COPY` lines for `matchresult.njs` and
  `upstash.njs`, beside the existing `COPY api.njs` and before the `chown` that
  makes `/etc/nginx` readable by the `nginx` user. Only `api.njs` and
  `nchan_meta.js` stay in `js_import`; the new modules are reached by import.
- No `nginx.conf` change. The existing `location /api/` block
  (`docker/nchan.conf:245`) already routes to `api.router`, applies the same
  rate limiting as the other API routes, and answers a browser `OPTIONS`
  preflight from `cors.conf` before the router is reached — which is what lets a
  cross-origin upload from the game page through.
- Logging is one entry line per call plus failures, and each answer is counted
  for the usage page's route table — see **Logging**.
- Happy path only. No method handling beyond what the router already does, no
  input validation, no error-state design.

## Logging

Not tracing: just enough to tell whether uploads arrive and whether they fail.
Every line is tagged `MATCH-RESULT: ` and written with `ngx.log(ngx.ERR, ...)`, so
it lands in `njs_error.log` — the file `/api/stats` tails for the dashboard's NJS
log panel.

| Where | Line |
| --- | --- |
| Entry of `matchResult` | `called bytes=<request body length>` |
| Response writer, any status ≥ 400 | `answered <status> body=<response JSON>` |
| The handler's `catch` | `failed: <stack>` |

While `WRITES_ENABLED` is false the entry line also carries `dryRun=1`, and a
second line records `skipped <n> writes` so the planned command count is visible
without dumping the commands. With the switch on, that line becomes
`wrote <n> commands`. Nothing else differs.

The entry line is what makes an upload visible at all while the route is a stub,
and the response writer's line means the unhappy path is logged in one place
instead of at every call site. Nothing on a successful write is logged beyond the
entry line: no per-write, per-field or per-rating logging, and no request body
contents — the body is only ever summarised by its length.

The response writer also counts the reply, so the route has byte accounting and
not just log lines. It writes the same three `net_stats` counters `noteApiOut`
writes in `api.njs` — `e:match-results`, `c:match-results` and `api.in` — which
is what makes `readNet` produce a row for it in `/api/net/history` and therefore
a row in the usage page's bytes-by-route table. The slug is repeated wherever
the route is named: `ROUTE_SLUG` in `matchresult.njs`, `API_SLUGS` in
`nchan_meta.js`, and `apiSlug` in `api.njs`. Because a stub reply is only a few
hundred bytes, `usage.html` lists `match-results` outside its top-six-by-bytes
cut rather than letting bigger routes hide it.

## Stored record

Store the POST body as received, minus `replayData`, plus `id`, `timestamp`,
`hasReplay`, and `locationCountry`/`locationCity` when they are known. No
allowlist. The lobby's recent-matches row is the authoritative consumer and it
keeps gaining fields (`club`, `card`), so anything the client sends is kept
rather than enumerated — that is also what the scoreboard does today, and it
means a new client field needs no change here or in the spec.

**Rules**

- `ruleType` is passed through verbatim, with **no type checking anywhere** on
  the write path. It defaults to `nineball` only when absent; otherwise the
  posted string is stored exactly as given — `reveal`, `fourball`, a typo, mixed
  case, an empty string, anything. No allowlist, no enum, no regex, no
  truncation, no lowercasing, and no comparison against the five game types. Do
  not add validation here, or before the rating update: the scoreboard stores
  whatever it is given, and the client already posts rule types outside the five
  (`reveal` is a live one that posts results).
- Every match type is stored: two-player, solo (no `loser`), bot games, reveal
  results. This matches today's behaviour exactly.
- `timestamp` is `Date.now()` at write; it is the sort score and the "Ago"
  column.
- `hasReplay` is set true only when a replay blob was stored.
- `id` uses the same 8-random-hex-chars algorithm as the scoreboard's `getUID`
  so replay keys and URLs keep the same shape. Nothing bundles that TypeScript
  helper into the image, so the algorithm is inlined in `matchresult.njs`.
- `replayData` is never part of the record. It is split off the body before the
  record is built, exactly as the scoreboard route does — but not by
  destructuring. Copy the body's own fields across in a loop and skip
  `replayData` while copying:

  ```js
  function buildRecord(r, body, replayData) {
      const record = {};
      const keys = Object.keys(body);
      for (let i = 0; i < keys.length; i += 1) {
          if (keys[i] === "replayData") continue;
          record[keys[i]] = body[keys[i]];
      }
      if (typeof record.ruleType === "undefined") record.ruleType = "nineball";
      record.id = uid();           // 8 random hex chars, algorithm below
      record.timestamp = Date.now();
      if (replayData) record.hasReplay = true;
      const geo = geoForRequest(r);
      if (geo.country && geo.country !== "XX") {
          record.locationCountry = geo.country;
          if (geo.city) record.locationCity = geo.city;
      }
      return record;
  }
  ```

  No destructuring, no spread, no `Object.assign`: the load-time gate above
  rejects them before any of this runs.

## KV writes

The replay blob write, the match write, and the trim are issued together as one
pipelined request through the shared `redisPipeline` helper — no new library, and
no Next.js or KV client.

| Order | Operation | Key | Notes |
| --- | --- | --- | --- |
| 1 (only if a blob was sent) | `SET` with expiry 432000s (5 days) | `match_replay:<id>` | Skipped entirely for uploads without a replay |
| 2 | `ZADD` score = timestamp, member = the record as JSON | `match_results` | One member per match |
| 3 | `ZREMRANGEBYRANK` ranks 0 to −33 | `match_results` | Keeps the newest 32, unchanged from today |

Keep the keys, the member shape, the 5-day TTL and the 32-entry trim identical
to the current implementation: that is what lets the scoreboard's existing reads
(`/api/summary`, `/api/match-replay`) keep working without changes.

The window stays at 32. At roughly 89 uploads/day that spans about 8 hours,
comfortably inside the 5-day replay TTL, so a rendered replay button cannot
point at an expired blob.

## Response

`201 Created`, with the stored record as the JSON body — the same status and
shape the scoreboard's POST returns today. Nothing consumes it: `../billiards`
`scorereporter.ts` only checks `response.ok` and logs the result. The upload is
fire-and-forget; the `await` in `end.ts` exists so the player cannot navigate
away mid-write, not because the answer is read.

The client retries up to 3 times on 5xx and 429, which predate this port and
exist for a service that may be asleep. See Future work for what those retries do
to duplicates.

## Replay blobs

- Stored under their own key as today, with a 5-day expiry, and `hasReplay` set
  true on the record only when a non-empty blob was stored.
- The scoreboard keeps serving `/api/match-replay`, which looks up the blob and
  redirects to the game. Nothing about that endpoint changes.
- The blob is never copied into the `match_results` member.

## Geo

Store `locationCountry` and `locationCity` so the lobby's flag and City column
keep working. Reuse the geo code that already exists rather than writing a third
copy: `geoForRequest(r)` in `nchan_meta.js` resolves the client IP from the
forwarded headers, obfuscates it, reads the `ip_cache` entry keyed by that
obfuscated IP (`country|city|hits|origins|os|browser`), and on a miss asks
`https://api.country.is/<ip>?fields=city`, writing the entry back.

- A cache hit costs nothing; a miss does one lookup, already bounded by that
  code's 2 s timeout, so a cold upload waits at most that long.
- The lookup is best-effort. When the country is missing or comes back as the
  `XX` sentinel, store neither field — not `XX` — and still store the match.
  A failed lookup never fails the upload.
- Because the helper keeps its own cache write and counters, an upload from a
  cold IP also seeds the entry that presence traffic will use.

## Ratings

Plain Elo replaces Glicko-2 for the write path. This removes the `glicko2.ts`
dependency from the port entirely — no dependency, no bundling, no port of the
volatility iteration.

### Update rule

- Classic Elo, K = 32, no rating deviation, no volatility, no inactivity decay.
- Expected score for the winner is `1 / (1 + 10 ** ((loserRating − winnerRating) / 400))`.
- The winner gains `K × (1 − expected)` and the loser loses exactly the same
  amount, so a match is zero-sum.
- Rounding is fine (decided 2026-11-20): both players' stored ratings are
  rounded to integers when read, the delta is rounded once
  (`Math.round(K × (1 − expected))`), and both sides are written as integers.
  One integer delta applied to two integer bases keeps the pair exactly
  zero-sum; rounding the two *new* values independently would let it drift by a
  point. The first Elo write therefore snaps a legacy Glicko float to the
  nearest integer — half a point at most, once.
- Ratings are updated only when `loser` is present. That includes bot games,
  which do carry a `loser` — unchanged from today.
- An unknown player starts at 1500. An existing rating is carried over as that
  player's Elo rating; nothing is reset.

### Storage

- Key `elo:<ruleType>`, a Redis hash whose field is the player name and whose
  value is that player's rating JSON. This is the existing structure and the key
  must not change — `/api/elo`, `/api/summary` and the player page all read it.
  `<ruleType>` is the stored string verbatim: no validation, so a rule type
  outside the five simply gets its own `elo:<ruleType>` hash, inert until
  something reads it. Never reject a result because its rule type is unknown —
  that would drop a match the scoreboard would have accepted.
- The rating JSON keeps **all the existing keys**:
  `{rating, rd, volatility, lastUpdated, gamesPlayed, wins, losses}`, with
  `rd` and `volatility` written as `0` and `rating` as an integer. Keeping the
  keys means no existing reader can break on a missing field; the two
  Glicko-only fields are simply inert.
- `lastUpdated` is `Date.now()` in **epoch milliseconds**, as a bare number, and
  the same value for both players in one result. That is what the Glicko writer
  emits today (`const now = Date.now()`, used for both), so every existing
  reader sees a value it already understands. It is the only input to the
  scoreboard's `applyInactivity`, which this module deliberately does not port.
- `gamesPlayed`, `wins` and `losses` are incremented per result as today: both
  players gain a game, the winner a win, the loser a loss. A player with no
  stored value starts from the existing default object — `rating` 1500, `rd`
  350, `volatility` 0.06, `lastUpdated` 0, counters 0 — with the `rd`/`volatility`
  replaced by `0` on write and the rating by 1500.
- Read both players' current values with one `HMGET elo:<ruleType> <winner>
  <loser>`, then write both ratings and both history fields in a single
  pipeline: `HSET elo:<ruleType> <name> <json>` twice, then
  `HSET elo-history:<ruleType>:<name> <YYYY-MM-DD> <rating>` twice.
- `elo-history:<ruleType>:<name>` is a **hash, not a sorted set** — a `ZADD` on
  it fails with `WRONGTYPE`. The field is the UTC date `YYYY-MM-DD`, the value is
  the player's rating rounded to an integer. The player page's rating graph reads
  it with `HGETALL` and nothing else does. A second result on the same day
  **overwrites** that day's point instead of appending, which is the existing
  behaviour and why the graph has one point per active day.
- Remove the only other Glicko remnant: there is no `applyInactivity` equivalent
  in this module. Decay was a Glicko concept and plain Elo has no RD to decay.

### Observed KV format (interrogated 2026-11-20)

Read from the live Upstash KV through the running container's credentials, so
these are shapes the writer must match, not inferences from the scoreboard
source:

- `TYPE elo:threecushion` → `hash`, and `TYPE elo-history:threecushion:Lukey` →
  `hash`. The `elo:*` keys that exist are `eightball`, `fourball`, `libre`,
  `nineball`, `sagu`, `snooker` and `threecushion` — more rule types than the
  five `/api/summary` reads. `fourball` and `libre` have no reader in this repo.
  An upload whose `ruleType` is outside the five simply creates another inert
  `elo:<ruleType>` hash, which is the expected consequence of storing the value
  with no type checking.
- A stored rating, verbatim:
  `{"rating":2118.010021071503,"rd":135.06252650996316,"volatility":0.06008109013720271,"lastUpdated":1795194763501,"gamesPlayed":555,"wins":436,"losses":119}`
  — exactly the seven keys, `lastUpdated` a bare epoch-millisecond number,
  `rating`/`rd`/`volatility` floats (hence the integer snap above).
- A history hash, verbatim (Lukey, threecushion, first fields):
  `["2026-06-06","1872","2026-06-08","1808","2026-07-04","1941","2026-11-19","2059"]`
  — date field, integer rating value.
- One consequence of writing `rd: 0` to record rather than rediscover: the
  scoreboard's `PlayerRatingStore.processEntries` still calls `applyInactivity`
  and still ranks on `conservativeRating = rating − 2 × rd`, so `/elo` and
  `/api/elo` will publish a decayed score for Elo-written players — about −100
  after a day, −265 after a week. Those are scoreboard routes and out of scope
  here; messaging's `/api/summary` already ranks on raw `rating`. Fixing them
  belongs to the cutover, not this port.

### What the rating payload must expose (compatibility note)

These changes are implied by writing plain Elo but are not files this spec
edits — they describe what the written values must support:

- The leaderboard payloads built from the rating hash must expose `rating`.
  `conservativeRating` is no longer produced.
- Ranking must use the emitted `rating` directly, not a value derived from
  decaying `rd`. With `rd` written as `0` the old decayed formula would inflate
  toward `sqrt(2500 × daysInactive)`, pulling an idle player's published score
  down by roughly 100 points after a day and 265 after a week, while a player who
  just played would show their raw rating. Ranking on the raw rating removes the
  whole class of problem and needs no guard anywhere.
- The already-deployed lobby bundle reads
  `conservativeRating ?? Math.round(rating)`, so it tolerates the field
  disappearing and needs no change.
- The `/elo` page renders an RD column, which will read `0` for every player
  written since the switch. That is expected, not a bug.

### Effect on existing ratings

Switching models re-ranks every player once, by `2 × rd` (up to +700 at the 350
cap), and for a provisional player that is a lasting jump rather than a cosmetic
one. Measured against the current library: a rookie (1500, rd 350) beating a
1600, rd 60 veteran moves from a displayed conservative 1225 to a raw 1732,
leapfrogging that veteran at 1591. Ranks settle as those players keep playing Elo
games. This is accepted.

## Verification

No NJS unit tests exist for `api.njs` or its siblings — `test/matchresult-unit.spec.ts`
covers this module's pure logic only — and E2E is out of scope for cloud agents.
Every KV check below needs `WRITES_ENABLED = true`: with it false the same POST
answers `201` and stores nothing. Verify manually against the container:

- `POST /api/match-results` with only `winner` and `winnerScore` answers `201`
  with the stored record, the newest `match_results` member carries `timestamp`,
  `id` and no `replayData`, and any other body field (`club`, `card`, `version`)
  is stored as sent.
- The same POST with `replayData` stores a blob under `match_replay:<id>`, the
  member carries `hasReplay: true`, and a read of that key returns the blob.
- A two-player POST leaves both names present in `elo:<ruleType>` with `rd: 0`,
  `volatility: 0`, an integer `rating` and a fresh epoch-ms `lastUpdated`, with
  the winner's rating up and the loser's down by the same amount. `HGETALL
  elo-history:<ruleType>:<name>` gains a field for today's UTC date holding the
  rounded rating, and both entries carry the same `lastUpdated`.
- An arbitrary `ruleType` — `reveal`, or a string no code has ever heard of —
  round-trips stored as sent and creates `elo:<that string>`. Nothing rejects it
  and no rule type is special-cased.
- `/api/summary` still renders the new match and the rankings, and the lobby row
  shows the parseable fields (rule, both names, scores, city, flag).
- A match uploaded from an IP with no `ip_cache` entry runs the existing lookup
  once, seeds the cache entry, and stores the country/city it returned. A record
  posted while the lookup is failing carries neither field, and still answers
  `201`.
- Each upload is visible twice outside the KV: `MATCH-RESULT: called bytes=<n>`
  in the dashboard's NJS log panel, and a `/api/match-results` row in the usage
  page's bytes-by-route table whose call count matches the number of uploads
  (`/api/net/history` reports since nginx start, so both need a fresh container).
  The row is present even when the route is not in the top six by bytes.

## Checks

- `../messaging`: `npm run lint` (currently `tsc --noEmit`, the Playwright
  tsconfig, and oxlint over `src`, `test`, `playwright` and
  `playwright.config.ts`) — note the new modules sit outside those paths, and
  `src/client/usage.html` is not linted at all, so none of this is covered by
  that gate. `node --check` on a copy renamed to `.mjs` is the cheapest syntax
  gate for an NJS module before a rebuild, with the caveat that it is V8's
  parser, not njs's.
- `../scoreboard`: `yarn test` and `yarn lint`.
- Confirm the new module loads: a syntax error in an NJS module surfaces at
  nginx start, so a container start plus one successful POST is the real gate.

## Future work

- **Duplicate suppression.** Not part of this spec. The client retries up to 3
  times on 5xx and 429 — retries that predate this port and exist for a service
  that may be asleep — and there is no dedupe anywhere on this route today, so a
  retry after a partial write can record the same match twice in the lobby
  window and apply the rating change twice. The cheapest fix is the pattern
  messaging already uses for arena results — a `ZADD ... NX` guard keyed on a
  value unique to the match, which would require the client to send a stable
  match identifier.
- Deleting the scoreboard's now-unused `GET /api/match-results`.

## Decisions taken

| Decision | Choice |
| --- | --- |
| Handler location | New `docker/matchresult.njs`, dispatched from `api.njs` |
| Shared KV helpers | `redis`/`redisPipeline` and their accounting helpers now live in `docker/upstash.njs` (one default export; njs rejects named imports), imported by both modules |
| Record fields | Store the body as received minus `replayData`, plus `id`, `timestamp`, `hasReplay`, geo |
| Record building | Explicit field copy; no destructuring, rest or spread (rejected by this njs at load time) |
| Geo | Reuse the existing `ip_cache` + `country.is` helper in `nchan_meta.js`; omit both fields when the country is unknown |
| Response | `201` with the stored record; the client only checks `response.ok` |
| Replays | Keep as today — separate key, 5-day TTL, `hasReplay` flag |
| History window | Keep the newest 32 |
| Match types | All, unchanged (two-player, solo, bot, reveal) |
| `ruleType` | Any value, no type checking: stored verbatim, `nineball` only when absent |
| Ratings | Plain Elo, K = 32, unknown players start at 1500 |
| Rating hash | Keep all existing keys, `rd` and `volatility` = 0 |
| `elo-history` | Keep writing it, as a hash: field `YYYY-MM-DD` (UTC), value the integer rating |
| `lastUpdated` | `Date.now()` epoch milliseconds, one value for both players in a result |
| Rounding | Integer ratings: round both bases on read, apply one integer delta per match |
| Ranking field | Emit `rating`; stop emitting `conservativeRating` |
| Logging | One `MATCH-RESULT: called` line per upload, plus any non-2xx answer and any exception; no per-write tracing beyond that |
| Response accounting | The response writer counts `e:`/`c:` under the `match-results` slug plus `api.in`, so the usage page's route table lists the route |
| Scoreboard route | Untouched |
| Client repoint / cutover | Out of scope |
