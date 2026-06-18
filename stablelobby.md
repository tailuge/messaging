# Stable Lobby — Slot Allocation Plan

## Problem

The `OnlinePanel` / `UserList` in `src/client/online-panel.js` renders online users from a raw array that changes every time a user joins or leaves. When many people join and leave in quick succession, the list shifts rapidly — items reorder (alphabetical sort in `Lobby.getUsersList()`), making it hard to click on a specific user before they move.

## Goal

Maintain a **stable view** of online users so that:
1. Every user who joins gets a stable position in the list.
2. When a user leaves, their slot remains but renders greyed out (OFFLINE).
3. If the same user returns within a grace period (30s), they reclaim their slot.
4. After the grace period, a slot can be reused by the next new user.
5. No fixed cap — the list grows as needed.
6. No timers. Expired slots just sit there until a new user needs one.

---

## New File: `src/client/user-slot-manager.js`

A pure-logic class (no DOM/Lit dependency) that implements the stable slot algorithm.

### Data Structures

```js
// Configuration — only the grace period
const GRACE_PERIOD_MS = 30000; // 30 seconds

// Slot object — every slot always has a userId (never null)
// {
//   userId: string,               // the user in this slot
//   status: 'online' | 'offline',
//   offlineSince: number | null,  // Date.now() when user left (null if online)
//   user: PresenceMessage | null, // full user data; null while offline (kept for grey-out display)
// }
```

### API

```js
class UserSlotManager {
  /**
   * @param {number} gracePeriodMs - Grace period in ms (default 30000)
   */
  constructor(gracePeriodMs = 30000)

  /**
   * Feed the manager with the latest full user list from the lobby.
   * This is the ONLY mutation point — it diffs against current state.
   * @param {PresenceMessage[]} users - all current online users
   * @returns {Slot[]} the updated slots array
   */
  update(users) → Slot[]

  /**
   * Returns current slots (for rendering). Does NOT mutate.
   * @returns {Slot[]}
   */
  getSlots() → Slot[]

  /**
   * Immediately clear all slots (e.g. on disconnect).
   */
  reset()
}
```

### Algorithm: `update(users)`

This is called every time `Lobby.onUsersChange` fires. It receives the **full** current user list.

```
1. Build a Set of incoming userIds: incomingIds = Set(users.map(u => u.userId))

2. PHASE 1 — Process departures (users who left)
   For each slot where status === 'online':
     if slot.userId ∉ incomingIds:
       slot.status = 'offline'
       slot.offlineSince = Date.now()
       slot.user = null  // clear data; userId stays for reservation matching

3. PHASE 2 — Process arrivals (new or returning users)
   For each user in users where user.userId not already in an 'online' slot:
     _placeUser(user)

4. Return getSlots()
```

### Algorithm: `_placeUser(user)`

```
1. RESERVATION CHECK: Scan slots for slot.userId === user.userId
   If found (regardless of status):
     slot.status = 'online'
     slot.offlineSince = null
     slot.user = user
     RETURN

2. EVICT OLDEST EXPIRED: Scan for all slots where status === 'offline'
   and (Date.now() - slot.offlineSince) > GRACE_PERIOD_MS.
   If any exist, pick the one with the LARGEST elapsed (oldest expired).
   Overwrite it:
     slot.userId = user.userId
     slot.status = 'online'
     slot.offlineSince = null
     slot.user = user
     RETURN

3. NO SLOT AVAILABLE: Push a new slot onto the end of the array.
     slot.userId = user.userId
     slot.status = 'online'
     slot.offlineSince = null
     slot.user = user
```

### Why This Is Simple

- **No timers.** Everything happens inside `update()`, triggered by lobby events.
- **No trimming.** Expired offline slots just sit there. They only get evicted when a new user needs one (step 2 of `_placeUser`).
- **No vacant slots.** Every slot always has a `userId`. The `user` payload is null for offline slots (grey-out display uses the cached `userId`/`userName` from the last known presence data).
- **Slots grow lazily.** If no expired slot is available, just push a new one.
- **Slots shrink when evicted.** Old expired slots get overwritten in-place — no array resizing needed.

---

## Changes to `src/client/online-panel.js`

### 1. Import the manager

```js
import { UserSlotManager } from './user-slot-manager.js';
```

### 2. Add a `#slotManager` field to `OnlinePanel`

```js
#slotManager = new UserSlotManager();
```

### 3. Replace the `#visibleUsers` getter

Before:
```js
get #visibleUsers() { return [...this.#users, ...BOTS]; }
```

After:
```js
get #slots() {
  return this.#slotManager.getSlots();
}
```

### 4. Update `_connect()` to feed the slot manager

The `onUsersChange` callback should feed the full list (users + bots, minus self) into the slot manager:

```js
this.#lobby.onUsersChange(users => {
  const allUsers = [...users, ...BOTS].filter(u => u.userId !== this.#myId);
  this.#slotManager.update(allUsers);
  this.dispatch({ type: 'USERS_UPDATE', payload: allUsers });
});
```

Self is excluded before feeding the manager so it never occupies a slot — avoiding the odd case where you'd see yourself greyed out after leaving.

### 5. Update the `<user-list>` binding in `render()`

Before:
```html
<user-list
  .users=${this.#visibleUsers}
  ...
```

After:
```html
<user-list
  .slots=${this.#slots}
  ...
```

### 6. Update `#info()` to use raw users for debugging

The `#info()` dumps users — keep using `this.#users` (raw lobby data) for accuracy.

---

## Changes to `UserList` Lit component (same file)

### 1. Add `slots` property

Add `slots: { type: Array }` to `static properties`.

### 2. Update `render()`

Before:
```js
const others = (this.users || []).filter(u => u.userId !== this.myId);
return html`<ul>${repeat(others, u => u.userId, u => this._row(u))}</ul>`;
```

After:
```js
const slots = this.slots || [];
return html`<ul>${repeat(slots, (_, i) => i, (slot, i) => this._rowSlot(slot, i))}</ul>`;
```

The `repeat` key is now the **slot index**, so positions never change.

### 3. New method `_rowSlot(slot, index)`

```js
_rowSlot(slot, index) {
  const isOffline = slot.status === 'offline';

  // Offline slot — render greyed out with last known info
  if (isOffline) {
    // Use slot.userId for the name if slot.user is null (it was cleared on departure)
    // But we need to cache the last userName. See note below.
    return html`
      <li class="is-offline" aria-label="${slot.userId}">
        <div class="user-info">
          <span class="user-name">${slot.lastUserName || slot.userId}</span>
        </div>
      </li>`;
  }

  const u = slot.user;
  // ... same action logic as current _row() ...

  return html`
    <li aria-label="${u.userName}">
      <!-- same content as _row() -->
    </li>`;
}
```

**Important:** Since `slot.user` is set to null on departure (to avoid stale data), we need to cache the `userName` for the grey-out display. Add `lastUserName` to the slot:

```js
// On departure:
slot.lastUserName = slot.user?.userName;
slot.user = null;
```

### 4. Add CSS for offline slots

```css
.is-offline {
  filter: grayscale(1);
  opacity: 0.35;
}

/* No fadeIn animation for offline slots — they're static */
.is-offline {
  animation: none;
}
```

---

## Changes to `src/client/styles.js`

Add a style for offline users in `USER_LIST_STYLES`:

```css
.is-offline { filter: grayscale(1); opacity: 0.35; transition: opacity 0.3s ease-out; }
```

The `transition` on opacity means the grey-out fades in smoothly rather than snapping.

---

## Order of Implementation

1. **Create `src/client/user-slot-manager.js`** — the pure-logic class with the algorithm
2. **Update `src/client/online-panel.js`** — integrate the manager into `OnlinePanel` and update `UserList`
3. **Update `src/client/styles.js`** — add `.is-offline` style
4. **Type-check** — `npm run lint`
5. **Run unit tests** — `npm run test`
6. **Run Playwright tests** — `npm run test:debug`
7. **Manual smoke test** — open lobby, join/leave with multiple browser tabs

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Slot count | Dynamic (no cap) | Grows as users join; old expired slots get overwritten in-place |
| Grace period | 30s | Long enough to survive page reloads, short enough that stale slots don't linger |
| GC strategy | Lazy eviction in `_placeUser()` | No timers, no trimming — expired slots just sit until overwritten |
| Bot handling | Bots get slots too | Consistent behavior; bots are treated like any other user |
| Self-exclusion | Filtered out before feeding the slot manager | Self never enters the slot system; avoids seeing yourself greyed out |
| Vacant slots | None | Every slot always has a userId; no null-slot edge cases |

---

## What Does NOT Change

- `src/lobby.ts` — presence tracking, challenge logic, heartbeat are unchanged
- `src/types.ts` — no new types needed (slot state is internal to the manager)
- `src/nchanclient.ts` — transport layer unchanged
- Bots — still appended to the user list before feeding the slot manager
- Challenge/spectate/chat buttons — same logic, just rendered from `slot.user` instead of `u`
