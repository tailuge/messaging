# Design: One-shot stale-participant refetch from presence (arena-view.js)

## Problem

`arena-view.js` (rendered by `arena.html` via `<arena-app>` when `?tournamentId=` is
present) loads the arena — including its participant list — exactly once via
`_load()` → `GET /api/arena/:id`. Meanwhile `_connectPresence()` joins the lobby and
receives live presence through `_lobby.onUsersChange(...)`. A player whose presence
carries `arenaId === this.arenaId` (set by their client via
`updatePresence({ arenaId })`, see `_syncArenaPresence()`) can therefore be "in this
arena" according to the messaging system while still missing from the on-screen
`_arena.players` list, because the backend snapshot was taken before they joined.

## Goal

When presence shows a player assigned to this arena who is absent from the on-screen
participant list, refetch the arena from the backend — **once only** per stale
detection, so heartbeats arriving every few seconds cannot hammer the server.

## Design (minimal — all changes in `arena-view.js`)

### 1. Detection point

Inside the existing `onUsersChange` handler in `_connectPresence()`, right after
`this._onlineUsers` is updated, call a tiny helper:

```js
this._lobby.onUsersChange(users => {
    this._onlineUsers = [...users, {
        userId: userStore.clientId,
        userName: userStore.userName,
    }];
    this._checkStaleArenaPresence();   // ← new
});
```

### 2. Detection rule

Stale = at least one online user (excluding self) whose presence `arenaId` equals
`this.arenaId` while that user is missing from `this._arena.players`:

```js
_checkStaleArenaPresence() {
    if (!this._arena || !this._lobby) return;
    const stale = this._onlineUsers.some(u =>
        u.userId !== userStore.clientId &&
        u.arenaId === this.arenaId &&
        !this._arena.players?.some(p => p.playerId === u.userId));
    if (stale) this._refetchStaleArenaOnce();
}
```

Notes:
- Exact match on `this.arenaId` (not just truthy) — users sitting in *other* arenas
  must not trigger refetches of this one.
- Self is excluded: our own presence is written by `_syncArenaPresence()` only after
  a successful `_load()`, so it can never be "missing from the list" in a meaningful
  way.

### 3. One-shot guard (the "only once" rule)

One boolean, `this._staleRefetchDone`, set **synchronously before** the fetch. Being
set before the async `_load()` is what makes the guard race-proof: a burst of
`onUsersChange` events arriving while the fetch is in flight can only ever issue one
request.

```js
_refetchStaleArenaOnce() {
    if (this._staleRefetchDone || this._busy) return;
    this._staleRefetchDone = true;   // set BEFORE the fetch → guarantees once-only
    this._load();
}
```

The `_busy` check additionally skips the refetch when a load is already running
(initial load, or the user pressed the manual Refresh button).

### 4. Flag reset — only when the arena context changes

The flag is **not** reset on a timer or on every load. It resets only when the
component starts looking at a different arena, inside `_load()` on success:

```js
// in _load(), after this._arena = data.arena;
if (this.arenaId !== this._lastLoadedArenaId) {
    this._staleRefetchDone = false;
    this._lastLoadedArenaId = this.arenaId;
}
```

Consequences (all intended):
- One stale-detection event → at most one extra fetch for the whole lifetime of the
  page view of that arena.
- If the refetched list *still* lacks the player (e.g. their presence is a lingering
  heartbeat from a disconnected client), we do **not** retry — the flag stays set.
- Navigating to another `arenaId` (component reuse) re-arms the mechanism.

### 5. Wiring summary (3 touch points, all in `arena-view.js`)

| Location | Change |
|---|---|
| `constructor()` | `this._staleRefetchDone = false; this._lastLoadedArenaId = null;` |
| `onUsersChange` handler | call `this._checkStaleArenaPresence()` after updating `_onlineUsers` |
| `_load()` success path | reset `_staleRefetchDone` when `arenaId` changed (see §4) |

Plus the two new methods: `_checkStaleArenaPresence()` (§2) and
`_refetchStaleArenaOnce()` (§3).

## Why this is safe

- **Server load**: worst case is exactly one extra `GET /api/arena/:id` per page view,
  regardless of how many heartbeats arrive.
- **No interference with explicit actions**: Join / Leave / the manual Refresh button
  go through `_mutate()` / `_load()` directly and are not gated by the flag.
- **Cheap check**: O(online users × arena players) on each presence tick — negligible.
- **No new dependencies, no backend changes**: it reuses the existing `_load()`.

## Out of scope (deliberately)

- No retry/backoff when the refetch still doesn't show the player (stale presence).
- No polling or timers — presence ticks already arrive via `onUsersChange`.
- No changes to `arena.js` (list page) or the backend.

## Verification sketch

1. Open `arena.html?tournamentId=X` as player A; note the participant list.
2. As player B (second browser/profile), join arena X via the messaging flow.
3. Within one heartbeat (~seconds), A's participant list should grow by B with
   **exactly one** additional `GET /api/arena/X` in the network tab — subsequent
   heartbeats must not trigger more fetches.
4. Repeat with B joining a *different* arena: A must not refetch.
