# Arena Archive Plan

> **Goal**: Stop `GET /api/arena` from returning an ever-growing list of finished arenas.
> Keep the lobby request as fast and minimal as possible (**1 single Redis call**) on the
> happy path, while retaining a bounded history of completed arenas for the arena
> management page (`arena.html`).
>
> **Core Decisions**:
> 1. **`arena:active` is a HASH, not a SET** — field is `id`, value is the active arena JSON
>    (~300 bytes of metadata + participants). `GET /api/arena` reads all active arenas in
>    **one single `HGETALL` command** — zero follow-up fetches, zero `MGET`, zero N+1.
> 2. **Client-driven tidy, no server timers** — `tidyFinishedArenas()` runs inside the two read
>    paths clients already poll, `GET /api/arena` (30 s lobby poll) and
>    `GET /api/arena/results`. Arena creation is left untouched.
> 3. **Minimal operation** — move old active → archived, then roll the archive window: the
>    21st snapshot is evicted and its arena records are deleted. Work is strictly incurred
>    during a list/results request.
> 4. **No TTL anywhere** — `arena:<id>`, `arena:<id>:scores`, `arena:<id>:scored` and the
>    snapshots in `arena:archived` are all written with no `EX`. No key in the arena
>    lifecycle expires on its own, and there is no `EXPIRE` call left in `api.njs`.
>    The only clock involved is the duplicate-result window in `arenaResult` (see §3).
> 5. **`arena:archived` stores complete snapshots** — finished arenas are stored as complete
>    JSON members scored by `endTime`, so the completed list needs no follow-up record lookup.
> 6. **Eviction owns the lifetime of arena KV** — `arena:archived` is the single owner of an
>    arena's records. A roll pops the over-limit snapshots (`ZPOPMIN`) and `DEL`s the
>    `arena:<id>`, `:scores` and `:scored` keys of each one. An arena's keys therefore live
>    exactly as long as the snapshot that represents it: ~20 finished arenas, plus whatever
>    is currently active. Retention is a **window, not a timer** — score hashes are never
>    TTL'd, so an archived arena's leaderboard stays readable until it rolls out.

---

## 1. Architecture Overview [DONE]

| Collection | Key | Type | Contains |
|---|---|---|---|
| **Active** | `arena:active` | HASH (`id` → arena JSON) | The handful of currently running arenas. Gives `GET /api/arena` everything in 1 call. |
| **Archived** | `arena:archived` | ZSET (score = `endTime`, member = complete arena JSON) | Finished arena snapshots, capped at the 20 most recent. **The archive is the retention owner**: the roll evicts the 21st snapshot and deletes that arena's records. |
| **Winners** | `arena:winners` | LIST (winner names, newest first) | Bounded mirror of the archive: winner names only, no-winner arenas skipped, trimmed to the last 20 (`LPUSH`+`LTRIM` at archive time). Serves `GET /api/arena/winners` as a plain `LRANGE` with zero compute. Not backfilled from existing snapshots, and capped independently — a winner can outlive its arena's records. |
| **Records** | `arena:<id>`, `arena:<id>:scores`, `arena:<id>:scored` | — | Full arena data & score hashes; **no TTL**. Deleted only by `tidyFinishedArenas()`: on eviction from the archive window, or immediately when an arena finishes with ≤ 2 entrants. |

Why a HASH for active:
- Active arenas are very small (typically 1 hourly arena, at most 2–3 with custom games).
- The arena object (~300 bytes: id, name, ruleType, options, duration, start/end times, status, player list) contains everything the lobby needs to display icons, participant count, countdown, and Join buttons.
- `HGETALL arena:active` returns all active arenas in **one single round-trip HTTP call** to Upstash.
- Individual updates (`HSET`, `HDEL`) are atomic and concurrent-safe across nginx workers.

### Lifetimes at a glance

Every arena key has exactly one owner, and none of them age out on their own:

| Key | Written by | Deleted by |
|---|---|---|
| `arena:active` field | seed / join / leave | tidy `HDEL` once the arena has ended |
| `arena:<id>` | seed / join / leave / `loadArena` status transition | tidy eviction `DEL`; immediate `DEL` when entrants ≤ 2 |
| `arena:<id>:scores` | first accepted result (`HINCRBY`, no `EXPIRE`) | the same eviction `DEL` |
| `arena:<id>:scored` | first accepted result (`ZADD`, no `EXPIRE`) | the same eviction `DEL` |
| `arena:archived` member | tidy at `endTime` | `ZPOPMIN` when a roll exceeds 20 |
| `arena:winners` entry | tidy, only when a winner has points | `LTRIM` to 20 |

Consequence for readers: `GET /api/arena/:id` stays correct for as long as the arena is in the
window — for every archived arena, not just recent ones. Once it rolls out the record is gone
and the endpoint 404s; the client renders "Arena no longer available" instead of a leaderboard
of zeros. A page of zeros now only ever means "no results were uploaded", never "the scores
expired".

---

## 2. The Maintenance Operation (`tidyFinishedArenas`) [DONE]

`tidyFinishedArenas()` moves expired arenas out of `arena:active` and into
`arena:archived`, then rolls the archive window. It is called from the client-driven
read paths (`GET /api/arena`, `GET /api/arena/results`), not on arena creation. This
keeps the create path minimal and shifts housekeeping to the client poll.

1. `HGETALL arena:active`. If empty, exit tidy immediately.
2. Inspect entries (pairs of `[id, jsonString]`):
   - Parse each arena object.
   - Treat `endTime` as authoritative (`status === "finished"` is also accepted).
   - Count entrants from `players.length`; a player who leaves remains an entrant.
   - For an eligible arena, build the final leaderboard, set `status: "finished"`,
     and store the complete JSON snapshot as the sorted-set member scored by `endTime`.
   - An arena with ≤ 2 entrants is dropped without archiving: `DEL` its three keys.
3. Batch writes:
   - If eligible snapshots exist: `ZADD arena:archived NX <...endTime-json-pairs>`.
   - Remove processed entries from `arena:active` with one `HDEL`.
4. When a new snapshot was added, roll the window and clean up:
   - `count = ZCARD arena:archived`
   - If `count > 20`: pop the `count - 20` lowest-ranked entries with
     `ZPOPMIN arena:archived (count - 20)`. The reply is `[member, score, …]` — the flat
     pair shape `parseHashEntries()` already walks.
     *(Rank 0 is the oldest because members are scored by end time. `ZPOPMIN key count`
     needs Redis ≥ 6.2; the deployment runs Upstash Redis 8.4.0.)*
   - Parse each evicted member for its `id` (legacy id-only members fall back to the raw
     member) and delete that arena's records with one `DEL` of
     `arena:<id>`, `arena:<id>:scores`, `arena:<id>:scored`.
   - **Ordering is deliberate**: the snapshot is removed from the archive *before* its keys
     are deleted. If the roll is interrupted, the only possible outcome is invisible orphan
     keys — never an archived arena listed with its records already gone. That second failure
     mode is exactly the "all zeros on the leaderboard" bug this model replaces.

Rules:
- **Best-effort**: wrapped in try/catch + `logApi` — housekeeping failure must never fail a results request.
- **Idempotent**: safe under concurrent calls (`ZADD NX`, `HDEL`, `ZPOPMIN`).
- **Bounded**: tidy uses a single active scan, batched archive writes/removal, and one count
  check + pop + `DEL` when rolling. The count check is behind the "a snapshot was added this
  pass" guard, since only a write can push the archive over the limit — the quiet path keeps
  its call budget. It remains off the fast lobby `GET` payload read.

---

## 3. Active Hash Sync & Key Lifetime [DONE]

1. **`arenaJoin` and `arenaLeave`**:
   When players join or leave an active arena, update both the permanent record and the active hash:
   - `SET arena:<id> <json>` (no TTL)
   - `HSET arena:active <id> <json>`
   This keeps the lobby's participant count (`👥 N`) accurate in the active row without separate lookups.
2. **`loadArena` status transition**:
   Writing the transitioned arena back does not need to preserve any expiration — arena
   records have no TTL by design (decision 4). Lifetime is owned by the archive roll.
3. **`arenaResult`**:
   Score increments (`HINCRBY` on `p:`/`w:`/`g:`) and the dedupe `ZADD` are written with
   **no `EXPIRE`**. Score retention is the archive window, not a timer. The single timed
   operation left is pruning the `arena:<id>:scored` set with
   `ZREMRANGEBYSCORE … -inf (now - RESULT_DEDUPE_WINDOW_MS)` (24 h), which bounds the
   duplicate-`challengeId` guard without touching what the leaderboard reads.
   *(The removed `EXPIRE` calls are why old arenas used to show all-zero leaderboards: the
   scores hash lapsed after 24 h while the snapshot stayed in the archive for days.)*

---

## 4. Endpoint Behavior After the Change [DONE]

| Endpoint | Change | Redis Commands | Status |
|---|---|---|---|
| `GET /api/arena` | Runs tidy first, then a single `HGETALL arena:active`. Parses active arena JSONs, applies in-memory `transition()` if just expired, sorts by `createdAt`. Zero record fetches. | **2 calls** quiet (tidy scan + payload), plus batched tidy writes only when an arena ended or the window rolls | [x] Implemented |
| `POST /api/arena` | Writes new arena to `SET arena:<id> <json> NX` (**no TTL**) and `HSET arena:active <id> <json>`. No tidy on create. | **2 calls** (incurred only on seed/create) | [x] Implemented |
| `GET /api/arena/results` | Runs `tidyFinishedArenas()`, then reads the top 20 complete snapshots from `arena:archived` (`ZREVRANGE 0 19`) and parses them directly. | **2 calls** quiet (tidy + `ZREVRANGE`), plus the pop + `DEL` on a roll | [x] Implemented |
| `POST /api/arena/:id/result` | `HINCRBY` score updates with **no `EXPIRE`**; prunes the `scored` dedupe set by time only. Results are still rejected once the arena has ended. | **8 calls** (record read + dedupe prune + `ZADD` + 4 `HINCRBY` + `HGETALL`) | [x] Implemented |
| `GET /api/arena/:id` | Unchanged: reads `arena:<id>` plus `HGETALL arena:<id>:scores`. Correct for every arena still in the archive window; **404 once evicted**. | **2 calls** | [x] Implemented |

---

## 5. Code Touch Points [DONE]

- [x] **`docker/api.njs`**
   - Changed `arenaList` to do a single `HGETALL K_ACTIVE` and parse the results in-memory.
   - In `arenaCreate`: `HSET K_ACTIVE id JSON.stringify(arena)`.
   - In `arenaJoin` / `arenaLeave`: sync updated arena to `HSET K_ACTIVE id JSON.stringify(arena)`.
   - Repointed `arenaResultsGet` at complete snapshots in `arena:archived` (`ZREVRANGE 0 19`, no `MGET`).
   - Removed `tidyFinishedArenas()` from the arena creation path and added it to the
     client-driven read paths (`arenaList`, `arenaResultsGet`).
   - **Removed every arena TTL**: the 48 h `WORKING_TTL_SECONDS` / `SCORED_TTL_MS` expirations on
     records and score hashes are gone, replaced by archive-owned deletion. The remaining
     `RESULT_DEDUPE_WINDOW_MS` constant only prunes the `scored` dedupe set.
   - **Archive roll now evicts and cleans up**: `ZCARD` → `ZPOPMIN` over-limit snapshots →
     parse their ids → one `DEL` of each evicted arena's three keys, ordered pop-then-delete.
- [x] **`src/client/tournament/arena.js`** (arena.html only)
   - "Completed Arenas" list fetches `GET /api/arena/results` instead of relying on active-list payload.
- [x] **`src/client/arena-panel.js`**
   - A 404 from an evicted arena renders "Arena no longer available" instead of leaving the
     panel header on its "Loading…" placeholder forever.
- [x] **`src/client/active-arenas.js` / lobby** — **zero changes**.

---

## 6. Verification [DONE]

- [x] `npm run lint` — passed with 0 errors and 0 warnings.
- [x] `docker/api.njs` parses as an ES module (`node --check`).
- [ ] Manual verification against a live KV (see below) — not run, because it needs the
      production Upstash credentials and the roll is destructive by design.

To verify a roll against a **scratch** KV (never the production one):

1. Seed 21 finished arenas, then hit `GET /api/arena` and watch the log lines
   `tidy archive size after run=21`, `tidy evicted 1 arenas and deleted their keys`.
2. Confirm `ZCARD arena:archived` is 20 and that `EXISTS arena:<evicted-id>` returns 0 for all
   three keys.
3. Confirm an arena still inside the window keeps a working leaderboard after its score hash
   would previously have expired (e.g. re-check a snapshot older than 24 h), and that the same
   `GET /api/arena/:id` returns 404 with the "Arena no longer available" message once evicted.

---

## 7. Explicitly Out of Scope & Accepted Caveats

- **Retention is a window, not a duration**: an arena's detail page works while it is one of the
  20 archived snapshots, then 404s. There is no time-based retention to tune, and no timer.
  Because `arena:winners` is capped independently, a trophy or cabinet link can point at an
  arena whose records have already rolled out — those links now dead-end in the friendly 404
  message rather than showing zeros.
- **Finished arenas stay in `arena:active` until a client polls**: the lobby hides them via
  `endTime`/`status` filtering in the meantime. Since `GET /api/arena` is polled every 30 s by
  every open lobby, this is normally a sub-minute lag.
- **Best-effort, and forward-only**: if no client ever hits `GET /api/arena` or
  `/api/arena/results`, nothing is archived and nothing is evicted — the archive never grows and
  the keys of finished arenas are never reclaimed. A roll that is interrupted part-way can leak
  orphan keys (invisible to every view); a stranded over-limit archive is corrected by the next
  pass that adds a snapshot. Neither state is repaired by a background sweep, because there is
  no background anything.
- **Legacy backlog**: arenas that left the window before eviction existed keep their
  `arena:<id>` / `:scores` / `:scored` keys, and any arena whose score hash already lapsed under
  the old 24 h TTL still reads all-zero until it rolls out. The roll only cleans up what it
  evicts, so reaching the "≈ 20 arenas in KV" invariant needs a one-off
  `SCAN 0 MATCH arena:* COUNT 100` sweep deleting ids not present in the current archive.
- **Snapshot members are de-duplicated by byte equality**: `ZADD NX` treats a re-archived arena
  as new if its JSON changed between passes, which would put two members in the archive for one
  id. Evicting either would delete the shared keys while the other member is still listed. A
  best-effort tidy makes this window very unlikely; gate the `DEL` on the id no longer appearing
  in the remaining archive if it ever needs to be airtight.
- **Zero background timers**: no server timers, no scheduled jobs. Archived rotation happens only
  when a client triggers `tidyFinishedArenas()`, and arena records do not expire on their own.
