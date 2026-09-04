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
> 2. **Client-driven tidy, no server timers** — the tidy runs inside `arenaCreate`, so it
>    fires on every arena birth: the lobby's hourly seed **and** the user "Create Arena" form.
> 3. **Minimal operation** — move old active → archived, truncate archived to the 20 most
>    recent. Work is strictly incurred during the seed/create POST.
> 4. **TTL does the record cleanup** — full `arena:<id>` keys keep their 48 h `EX` TTL and
>    are used by `arena.html`'s completed list. A mismatch between archived ids and expired
>    records is tolerated: reads simply skip ids whose record has already expired.
> 5. **`arena:archived` stays a ZSET of IDs** — finished arenas are moved to `arena:archived`
>    (score = `endTime`, member = `id`), keeping the archive collection lightweight.

---

## 1. Architecture Overview

| Collection | Key | Type | Contains |
|---|---|---|---|
| **Active** | `arena:active` | HASH (`id` → arena JSON) | The handful of currently running arenas. Gives `GET /api/arena` everything in 1 call. |
| **Archived** | `arena:archived` | ZSET (score = `endTime`, member = id) | Finished arena ids, capped at the 20 most recent. |
| **Records** | `arena:<id>`, `arena:<id>:scores`, `arena:<id>:scored` | — | Full arena data & score hashes; auto-expired by 48 h `EX` TTL. |

Why a HASH for active:
- Active arenas are very small (typically 1 hourly arena, at most 2–3 with custom games).
- The arena object (~300 bytes: id, name, ruleType, options, duration, start/end times, status, player list) contains everything the lobby needs to display icons, participant count, countdown, and Join buttons.
- `HGETALL arena:active` returns all active arenas in **one single round-trip HTTP call** to Upstash.
- Individual updates (`HSET`, `HDEL`) are atomic and concurrent-safe across nginx workers.

---

## 2. The Maintenance Operation (inside `arenaCreate`)

Called at the top of `arenaCreate`, so **every** create POST (hourly seed from
`active-arenas.js` and user creates on `arena.html`) tidies:

1. `HGETALL arena:active`. If empty, exit tidy immediately.
2. Inspect entries (pairs of `[id, jsonString]`):
   - Parse each arena object.
   - If corrupted or past `endTime` (`now >= arena.endTime` or `status: "finished"`):
     - Mark for removal from active (`staleIds.push(id)`).
     - If `endTime` is valid, mark for archive (`archiveEntries.push(arena.endTime || now, id)`).
3. Batch writes (never N+1 Upstash calls):
   - If `staleIds.length > 0`: `HDEL arena:active <...staleIds>` (single call).
   - If `archiveEntries.length > 0`: `ZADD arena:archived NX <...scoreMemberPairs>` (single call).
4. Safe truncation to 20 newest:
   - `count = ZCARD arena:archived`
   - If `count > 20`: `ZREMRANGEBYRANK arena:archived 0 (count - 21)`.
   *(Avoids the Redis behavior where negative offsets like `0 -21` on small sets delete rank 0).*

Rules:
- **Best-effort**: wrapped in try/catch + `logApi` — housekeeping failure must never fail a create.
- **Idempotent**: safe under concurrent seeds (`ZADD NX`, `HDEL`).
- **Bounded**: tidy takes 2–4 Redis calls total on seeding, completely off the `GET` read path.

---

## 3. Active Hash Sync & TTL Fix

1. **`arenaJoin` and `arenaLeave`**:
   When players join or leave an active arena, update both the permanent record and the active hash:
   - `SET arena:<id> <json> EX WORKING_TTL_SECONDS`
   - If `arena.status !== "finished" && Date.now() < arena.endTime`:
     `HSET arena:active <id> <json>`
   This keeps the lobby's participant count (`👥 N`) accurate in the active row without separate lookups.
2. **`loadArena` TTL Fix**:
   Add `EX WORKING_TTL_SECONDS` to `loadArena`'s status transition write so completed records don't lose their 48 h expiration.
3. **Migration safety**:
   If `arena:active` previously existed as a Redis `SET` in the database, `HGETALL` would return `WRONGTYPE`. Tidy / read should catch `WRONGTYPE` and `DEL arena:active` once to let it initialize as a HASH.

---

## 4. Endpoint Behavior After the Change

| Endpoint | Change | Redis Commands |
|---|---|---|
| `GET /api/arena` | **Ultra-fast single GET**: calls `HGETALL arena:active`. Parses active arena JSONs, applies in-memory `transition()` if just expired, sorts by `createdAt`. Zero write-back, zero second fetches. | **1 call** (`HGETALL`) |
| `POST /api/arena` | Runs tidy (§2) before creating. Writes new arena to `SET arena:<id> ... EX 48h` and `HSET arena:active <id> <json>`. | **3–5 calls** (incurred only on seed/create) |
| `GET /api/arena/results` | Reads top 20 from `arena:archived` (`ZREVRANGE 0 19`), batched `MGET`s their `arena:<id>` records, skips expired ones, returns `{ status: "success", results: [...] }`. | **2 calls** (`ZREVRANGE` + `MGET`) |

---

## 5. Code Touch Points (when implemented)

1. **`docker/api.njs`**
   - Change `arenaList` to do a single `HGETALL K_ACTIVE` and parse the results in-memory.
   - Add `tidyFinishedArenas()` at top of `arenaCreate` (`HGETALL` → `HDEL` stale → `ZADD` archived).
   - In `arenaCreate`: `HSET K_ACTIVE id JSON.stringify(arena)`.
   - In `arenaJoin` / `arenaLeave`: sync updated arena to `HSET K_ACTIVE id JSON.stringify(arena)`.
   - Repoint `arenaResultsGet` at `arena:archived` ZSET (`ZREVRANGE 0 19` + `MGET`).
2. **`src/client/tournament/arena.js`** (arena.html only)
   - "Completed Arenas" list fetches `GET /api/arena/results` instead of relying on active-list payload.
3. **`src/client/active-arenas.js` / lobby** — **zero changes**.

---

## 6. Verification (when implemented)

1. `npm run lint`.
2. Manual / extended `docker/testnchan.sh` assertions:
   - `GET /api/arena` returns active arenas in a single `HGETALL` call.
   - Joining an arena updates player count in `GET /api/arena`.
   - Creating an expired arena then seeding removes it from `GET /api/arena` and places it in `GET /api/arena/results`.
   - Archived list stays capped at 20 without losing items.
   - Concurrent seeds do not duplicate archived entries.
3. Two-tab lobby test: seamless transition when hourly boundary seeds a new arena.

---

## 7. Explicitly Out of Scope & Accepted Caveats

- **Eventual consistency**: A finished arena remains in `arena:active` until the next seed/create POST. The client already filters display by `endTime`/`status` and uses that condition to trigger the seed POST.
- **Archive TTL fade**: Completed arenas in `arena:archived` older than 48 h expire from Redis KV; `GET /api/arena/results` simply omits them.
- **Zero background timers**: Maintenance only executes when an arena is born.
