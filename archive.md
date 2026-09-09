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
> 2. **Client-driven tidy, no server timers** — the tidy runs inside `arenaResultsGet()`,
>    so it fires when clients fetch the completed list (`GET /api/arena/results`). Arena creation
>    is left untouched.
> 3. **Minimal operation** — move old active → archived, truncate archived to the 20 most
>    recent. Work is strictly incurred during a results request.
> 4. **No TTL on arena records** — `arena:<id>`, `arena:<id>:scores`, and
>    `arena:<id>:scored` are written without an `EX` ttl. The only cleanup path is
>    `tidyFinishedArenas()`: expired arenas are moved out of `arena:active` and into
>    `arena:archived` when a client fetches `/api/arena/results`. Expiry is determined from
>    `endTime`, not only the persisted status field. If no client ever hits that endpoint,
>    expired arenas remain in `arena:active`; the lobby hides them via `endTime`/`status` filtering
>    in the meantime. The 20-entry archive cap keeps the archive set small once populated.
> 5. **`arena:archived` stores complete snapshots** — finished arenas are stored as complete
>    JSON members scored by `endTime`, so the completed list needs no follow-up record lookup.
>    The archive is capped at 20 and trimmed by `tidyFinishedArenas()` when it grows beyond that.

---

## 1. Architecture Overview [DONE]

| Collection | Key | Type | Contains |
|---|---|---|---|
| **Active** | `arena:active` | HASH (`id` → arena JSON) | The handful of currently running arenas. Gives `GET /api/arena` everything in 1 call. |
| **Archived** | `arena:archived` | ZSET (score = `endTime`, member = complete arena JSON) | Finished arena snapshots, capped at the 20 most recent. |
| **Winners** | `arena:winners` | LIST (winner names, newest first) | Bounded mirror of the archive: winner names only, no-winner arenas skipped, trimmed to the last 20 (`LPUSH`+`LTRIM` at archive time). Serves `GET /api/arena/winners` as a plain `LRANGE` with zero compute. Not backfilled from existing snapshots. |
| **Records** | `arena:<id>`, `arena:<id>:scores`, `arena:<id>:scored` | — | Full arena data & score hashes; no `EX` ttl, cleaned only by `tidyFinishedArenas()`. |

Why a HASH for active:
- Active arenas are very small (typically 1 hourly arena, at most 2–3 with custom games).
- The arena object (~300 bytes: id, name, ruleType, options, duration, start/end times, status, player list) contains everything the lobby needs to display icons, participant count, countdown, and Join buttons.
- `HGETALL arena:active` returns all active arenas in **one single round-trip HTTP call** to Upstash.
- Individual updates (`HSET`, `HDEL`) are atomic and concurrent-safe across nginx workers.

---

## 2. The Maintenance Operation (`tidyFinishedArenas`) [DONE]

`tidyFinishedArenas()` moves expired arenas out of `arena:active` and into
`arena:archived`, then trims the archive to the 20 most recent entries. It is
called when clients fetch the completed list (`GET /api/arena/results`), not on
arena creation. This keeps the create path minimal and shifts housekeeping to the
client-driven read path.

1. `HGETALL arena:active`. If empty, exit tidy immediately.
2. Inspect entries (pairs of `[id, jsonString]`):
   - Parse each arena object.
   - Treat `endTime` as authoritative (`status === "finished"` is also accepted).
   - Count entrants from `players.length`; a player who leaves remains an entrant.
   - For an eligible arena, build the final leaderboard, set `status: "finished"`,
     and store the complete JSON snapshot as the sorted-set member scored by `endTime`.
3. Batch writes:
   - If eligible snapshots exist: `ZADD arena:archived NX <...endTime-json-pairs>`.
   - Remove processed entries from `arena:active` with one `HDEL`.
4. When a new snapshot was added, trim to the 20 newest:
   - `count = ZCARD arena:archived`
   - If `count > 20`: `ZREMRANGEBYRANK arena:archived 0 (count - 21)`.
   *(Rank 0 is the oldest because members are scored by end time.)*

Rules:
- **Best-effort**: wrapped in try/catch + `logApi` — housekeeping failure must never fail a results request.
- **Idempotent**: safe under concurrent calls (`ZADD NX`, `HDEL`).
- **Bounded**: tidy uses a single active scan, batched archive writes/removal, and one trim check when needed; it remains off the fast lobby `GET` read path.

---

## 3. Active Hash Sync & TTL Fix [DONE]

1. **`arenaJoin` and `arenaLeave`**:
   When players join or leave an active arena, update both the permanent record and the active hash:
   - `SET arena:<id> <json>` (no ttl)
   - `HSET arena:active <id> <json>`
   This keeps the lobby's participant count (`👥 N`) accurate in the active row without separate lookups.
2. **`loadArena` TTL Fix**:
   Not applicable — arena records have no ttl, so `loadArena`'s status transition write does not
   need to preserve any expiration.

---

## 4. Endpoint Behavior After the Change [DONE]

| Endpoint | Change | Redis Commands | Status |
|---|---|---|---|
| `GET /api/arena` | **Ultra-fast single GET**: calls `HGETALL arena:active`. Parses active arena JSONs, applies in-memory `transition()` if just expired, sorts by `createdAt`. Zero write-back, zero second fetches. | **1 call** (`HGETALL`) | [x] Implemented |
| `POST /api/arena` | Writes new arena to `SET arena:<id> ... EX 2h` and `HSET arena:active <id> <json>`. No tidy on create. | **2 calls** (incurred only on seed/create) | [x] Implemented |
| `GET /api/arena/results` | Runs `tidyFinishedArenas()`, then reads the top 20 complete snapshots from `arena:archived` (`ZREVRANGE 0 19`) and parses them directly. | **2–3 calls** (tidy + ZREVRANGE, plus archive trim when needed) | [x] Implemented |

---

## 5. Code Touch Points [DONE]

- [x] **`docker/api.njs`**
   - Changed `arenaList` to do a single `HGETALL K_ACTIVE` and parse the results in-memory.

   - In `arenaCreate`: `HSET K_ACTIVE id JSON.stringify(arena)`.
   - In `arenaJoin` / `arenaLeave`: sync updated arena to `HSET K_ACTIVE id JSON.stringify(arena)`.
   - Repointed `arenaResultsGet` at complete snapshots in `arena:archived` (`ZREVRANGE 0 19`, no `MGET`).
   - Replaced the 48 h `WORKING_TTL_SECONDS` with `ARENA_ACTIVE_TTL_SECONDS` (2 h) on
     every arena record write (`SET`/`EXPIRE`).
   - Removed `tidyFinishedArenas()` from the arena creation path and added it to
     `arenaResultsGet()` so the active→archive maintenance only runs when clients
     fetch the completed list (`GET /api/arena/results`).
- [x] **`src/client/tournament/arena.js`** (arena.html only)
   - "Completed Arenas" list fetches `GET /api/arena/results` instead of relying on active-list payload.
- [x] **`src/client/active-arenas.js` / lobby** — **zero changes**.

---

## 6. Verification [DONE]

- [x] `npm run lint` — passed with 0 errors and 0 warnings.
- [ ] Manual verification / container deployment.

---

## 7. Explicitly Out of Scope & Accepted Caveats

- **No TTL wipeout for active arenas**: A finished arena stays in `arena:active` until a client
  fetches `/api/arena/results` (or its 2 h TTL expires and Redis drops the record). The lobby
  already hides finished arenas via `endTime`/`status` filtering, and the hourly seed will
  eventually trigger a tidy on the next create.
- **Archive is best-effort, no fallbacks**: If a client never visits the results page, expired
  arenas are not moved to the archive. This is intentional — the archive exists for the arena
  management page only. Lobby correctness does not depend on it.
- **No record TTL**: Arena records (`arena:<id>`, `arena:<id>:scores`,
  `arena:<id>:scored`) are written without an `EX` ttl. They are only removed when
  `tidyFinishedArenas()` moves finished arenas out of `arena:active` and the archive. If no client
  ever fetches `/api/arena/results`, finished arenas remain in `arena:active` indefinitely; the lobby
  already hides them via `endTime`/`status` filtering, and the next player going online triggers
  the tidy.
- **Archive TTL fade**: Completed snapshots in `arena:archived` do not carry a ttl either. The
  archive is capped at 20 entries and trimmed by `tidyFinishedArenas()`. Old entries leave when a
  newer snapshot pushes them past the 20-entry window.
- **Zero background timers**: No server timers. Arena records expire via TTL; archive rotation
  happens only when a client triggers `tidyFinishedArenas()`.
