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
>    `tidyFinishedArenas()`: finished arenas are moved out of `arena:active` and into
>    `arena:archived` when a client fetches `/api/arena/results`. The toss-up is that if no client
>    ever hits that endpoint, finished arenas remain in `arena:active` until a player next goes
>    online and triggers the tidy; the lobby already hides them via `endTime`/`status` filtering
>    in the meantime. The 20-entry archive cap keeps the archive set small once populated.
> 5. **`arena:archived` stays a ZSET of IDs** — finished arenas are moved to `arena:archived`
>    (score = `0` for finished-at-archive-time, member = `id`), keeping the archive collection
>    lightweight. The archive is capped at 20 and trimmed by `tidyFinishedArenas()` when it grows
>    beyond that.

---

## 1. Architecture Overview [DONE]

| Collection | Key | Type | Contains |
|---|---|---|---|
| **Active** | `arena:active` | HASH (`id` → arena JSON) | The handful of currently running arenas. Gives `GET /api/arena` everything in 1 call. |
| **Archived** | `arena:archived` | ZSET (score = `endTime`, member = id) | Finished arena ids, capped at the 20 most recent. |
| **Records** | `arena:<id>`, `arena:<id>:scores`, `arena:<id>:scored` | — | Full arena data & score hashes; no `EX` ttl, cleaned only by `tidyFinishedArenas()`. |

Why a HASH for active:
- Active arenas are very small (typically 1 hourly arena, at most 2–3 with custom games).
- The arena object (~300 bytes: id, name, ruleType, options, duration, start/end times, status, player list) contains everything the lobby needs to display icons, participant count, countdown, and Join buttons.
- `HGETALL arena:active` returns all active arenas in **one single round-trip HTTP call** to Upstash.
- Individual updates (`HSET`, `HDEL`) are atomic and concurrent-safe across nginx workers.

---

## 2. The Maintenance Operation (`tidyFinishedArenas`) [DONE]

`tidyFinishedArenas()` moves finished arenas out of `arena:active` and into
`arena:archived`, then trims the archive to the 20 most recent entries. It is
called when clients fetch the completed list (`GET /api/arena/results`), not on
arena creation. This keeps the create path minimal and shifts housekeeping to the
client-driven read path.

1. `HGETALL arena:active`. If empty, exit tidy immediately.
2. Inspect entries (pairs of `[id, jsonString]`):
   - Parse each arena object.
   - If `status === "finished"`:
     - Mark for removal from active (`staleIds.push(id)`).
     - Build the leaderboard and either set `winner`/`winnerId` or delete them.
     - Add `archiveArgs.push("0", id)` (score `0` so the arena is placed at the
       bottom of the archive with a stable sort).
3. Batch writes (never N+1 Upstash calls):
   - If `staleIds.length > 0`: `HDEL arena:active <...staleIds>` (single call).
   - If `archiveArgs.length > 0`: `ZADD arena:archived NX <...scoreMemberPairs>` (single call).
4. Safe truncation to 20 newest:
   - `count = ZCARD arena:archived`
   - If `count > 20`: `ZREMRANGEBYRANK arena:archived 0 (count - 21)`.
   *(Avoids the Redis behavior where negative offsets like `0 -21` on small sets delete rank 0).*

Rules:
- **Best-effort**: wrapped in try/catch + `logApi` — housekeeping failure must never fail a results request.
- **Idempotent**: safe under concurrent calls (`ZADD NX`, `HDEL`).
- **Bounded**: tidy takes 2–4 Redis calls total on a results request, off the fast lobby `GET` read path.

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
| `GET /api/arena/results` | Reads top 20 from `arena:archived` (`ZREVRANGE 0 19`), runs `tidyFinishedArenas()`, batched `MGET`s their `arena:<id>` records, skips expired ones, returns `{ status: "success", results: [...] }`. | **3–4 calls** (tidy + ZREVRANGE + MGET) | [x] Implemented |

---

## 5. Code Touch Points [DONE]

- [x] **`docker/api.njs`**
   - Changed `arenaList` to do a single `HGETALL K_ACTIVE` and parse the results in-memory.

   - In `arenaCreate`: `HSET K_ACTIVE id JSON.stringify(arena)`.
   - In `arenaJoin` / `arenaLeave`: sync updated arena to `HSET K_ACTIVE id JSON.stringify(arena)`.
   - Repointed `arenaResultsGet` at `arena:archived` ZSET (`ZREVRANGE 0 19` + `MGET`).
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
- **Archive is best-effort, no fallbacks**: If a client never visits the results page, finished
  arenas are not moved to the archive. This is intentional — the archive exists for the arena
  management page only. Lobby correctness does not depend on it.
- **No record TTL**: Arena records (`arena:<id>`, `arena:<id>:scores`,
  `arena:<id>:scored`) are written without an `EX` ttl. They are only removed when
  `tidyFinishedArenas()` moves finished arenas out of `arena:active` and the archive. If no client
  ever fetches `/api/arena/results`, finished arenas remain in `arena:active` indefinitely; the lobby
  already hides them via `endTime`/`status` filtering, and the next player going online triggers
  the tidy.
- **Archive TTL fade**: Completed arenas in `arena:archived` do not carry a ttl either. The archive
  is capped at 20 entries and trimmed by `tidyFinishedArenas()`. Old entries only leave when a newer
  finished arena pushes them past the 20-entry window.
- **Zero background timers**: No server timers. Arena records expire via TTL; archive rotation
  happens only when a client triggers `tidyFinishedArenas()`.
