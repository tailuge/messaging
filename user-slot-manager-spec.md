# UserSlotManager Specification

> Derived from `stablelobby.md` and 3 rounds of stakeholder interview.
> This spec is implementation-ready. All design decisions are resolved.

---

## 1. Problem

The `OnlinePanel` / `UserList` in `src/client/online-panel.js` renders online users from a raw array that changes every time a user joins or leaves. When many people join and leave in quick succession, the list shifts rapidly — items reorder (alphabetical sort in `Lobby.getUsersList()`), making it hard to click on a specific user before they move.

## 2. Goals

1. Every user who joins gets a **stable position** in the list.
2. When a user leaves, their slot remains but renders **greyed out** (OFFLINE).
3. If the same user returns within a grace period (30s), they **reclaim** their slot.
4. After the grace period, a slot can be **reused** by the next new user (evict oldest expired).
5. **No fixed cap** — slots grow as needed.
6. **No timers** — everything is event-driven via `update()` calls.
7. The class is **independently testable** before any integration work.

## 3. Design Decisions (from interview)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Grey-out display data | **Full snapshot** | Cache the entire last `PresenceMessage` on departure. Grey row shows flags, status, ruleType as they were. Simplifies the slot model: `slot.user` is never set to null, it always holds the last known data. |
| 2 | Reconnect behavior | **Fresh slate** | `reset()` is called on lobby reconnect. All slots are cleared, then the full user batch is fed via `update()`. No grey slots survive a reconnect. |
| 3 | Bot permanence | **Treat like users** | Bots are fed into `update()` alongside human users every call. They can theoretically be marked offline (though in practice they never disappear). No special pre-seeding. |
| 4 | Online count header | **Online slots only** | `OnlinePanel` panel header shows count of slots where `status === 'online'`. Offline users don't count. |
| 5 | Time in tests | **Inject clock** | `constructor(gracePeriodMs, clock?)` — `clock` defaults to `() => Date.now()`. Tests inject a fake clock for deterministic, instant tests. |
| 6 | Test file format | **TypeScript** | `test/user-slot-manager.spec.ts` imports the JS module. Consistent with existing tests (`testMatch: **/*.spec.ts`). No Jest config change needed. |
| 7 | Migration order | **Isolate first** | Phase 1: build `UserSlotManager` + write all unit tests. Phase 2: integrate into `OnlinePanel` + `UserList`. No existing code touched until Phase 2. |
| 8 | Slot array bloat | **No limit** | Let the array grow. In practice the lobby never has enough churn for this to matter. CSS `height: 160px` + `overflow: hidden` hides excess. |
| 9 | Heartbeat/field updates | **Join/leave only** | The slot manager only reacts to userIds appearing/disappearing. If a user changes userName/tableId while online, the slot keeps the old data until they leave and rejoin. Tradeoff accepted for simplicity. |
| 10 | Bot seeding | **Include in users** | Bots are passed in every `update()` call just like human users. No pre-population or special handling. |
| 11 | Slot eviction transition | **Simple replace** | When an expired slot is evicted and overwritten, no special transition. The existing Lit `fadeIn` animation handles the visual change. |
| 12 | Test file location | **New dedicated file** | `test/user-slot-manager.spec.ts`. Clean separation from lobby/integration tests. No Docker container needed. |

---

## 4. File: `src/client/user-slot-manager.js`

A pure-logic class. **Zero dependencies** — no Lit, no DOM, no Nchan. Just plain JavaScript.

### 4.1 Data Structures

```js
/**
 * @typedef {Object} Slot
 * @property {string}      userId        - Always set (never null)
 * @property {'online'|'offline'} status - Current state
 * @property {number|null} offlineSince  - Date.now() when departed (null if online)
 * @property {Object|null} user          - Full PresenceMessage snapshot; always populated
 *                                         (set on placement, retained on departure as snapshot)
 */
```

### 4.2 Constructor

```js
/**
 * @param {number}   gracePeriodMs - Grace period in ms (default 30000)
 * @param {Function} clock         - () => number, defaults to () => Date.now()
 */
constructor(gracePeriodMs = 30000, clock = () => Date.now())
```

The `clock` parameter enables deterministic testing.

### 4.3 Public API

```js
/**
 * Feed the manager with the latest full user list.
 * This is the ONLY mutation point.
 * @param {PresenceMessage[]} users - all current online users (excluding self)
 * @returns {Slot[]} the updated slots array
 */
update(users) → Slot[]

/**
 * Returns current slots (for rendering). Does NOT mutate.
 * @returns {Slot[]}
 */
getSlots() → Slot[]

/**
 * Immediately clear all slots. Called on disconnect/reconnect.
 */
reset() → void
```

### 4.4 Algorithm: `update(users)`

```
1. incomingIds = new Set(users.map(u => u.userId))

2. PHASE 1 — Process departures
   For each slot where status === 'online':
     if slot.userId NOT IN incomingIds:
       slot.status = 'offline'
       slot.offlineSince = this.clock()
       // slot.user RETAINED as snapshot for grey-out display

3. PHASE 2 — Process arrivals
   For each user in users where user.userId is NOT in any 'online' slot:
     this._placeUser(user)

4. Return this.getSlots()
```

**Note:** Phase 2 only processes users whose userId is not already online. This means:
- Field changes (userName, tableId, etc.) for online users are **ignored** (decision #9).
- Returning users (offline → reclaim) go through `_placeUser` and get fresh data.

### 4.5 Algorithm: `_placeUser(user)`

```
1. RESERVATION CHECK
   Scan slots for slot.userId === user.userId (any status).
   If found:
     slot.status = 'online'
     slot.offlineSince = null
     slot.user = user        // fresh data from lobby
     RETURN

2. EVICT OLDEST EXPIRED
   Scan slots for status === 'offline' where
     (this.clock() - slot.offlineSince) > gracePeriodMs.
   If any exist:
     Pick the one with the LARGEST elapsed (oldest expired).
     Overwrite it:
       slot.userId = user.userId
       slot.status = 'online'
       slot.offlineSince = null
       slot.user = user
     RETURN

3. PUSH NEW SLOT
   Push to end of array:
     { userId: user.userId, status: 'online', offlineSince: null, user: user }
```

**Key properties:**
- Every slot always has a `userId` (never null — decision #8).
- Every slot always has a `user` object (never null — decision #1).
- Slots grow only in step 3. No trimming, no shrinking.
- Slots are reused in-place in step 2 (overwrite). Array length does not change during eviction.

### 4.6 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty user list | All online slots → marked offline. No arrivals. List may grow large with offline slots. |
| All users leave then same users return within grace period | Each reclaims their original slot via reservation check. Positions preserved. |
| All users leave, grace period expires, new users join | Oldest expired slots evicted one by one. Slots stay in same positions but get new userIds. |
| Same userId appears twice in `users` | Phase 2 only processes first occurrence (subsequent ones are already in an 'online' slot). |
| `reset()` then `update()` | Clean start. All users get new slots via step 1 or step 3 of `_placeUser`. |
| 1000 users join over time | 1000 slots. Array grows linearly. CSS overflow hides excess. No memory leak (slots hold small objects). |

---

## 5. Testing: `test/user-slot-manager.spec.ts`

### 5.1 Setup

- Import `UserSlotManager` from `../src/client/user-slot-manager.js`
- Tests use injected fake clock for deterministic timing
- No testcontainers / Docker needed
- No Lit or DOM dependencies

### 5.2 Test Cases

| # | Test | Description |
|---|------|-------------|
| 1 | Basic join | `update([alice])` → 1 slot, status 'online', user is alice |
| 2 | Basic leave | join alice → `update([])` → 1 slot, status 'offline', user snapshot is alice |
| 3 | Reclaim within grace | join alice → leave → `update([alice])` within 30s → same slot, status 'online', index preserved |
| 4 | Reclaim after grace | join alice → leave → advance clock 31s → `update([alice])` → alice reclaims slot (reservation check doesn't check expiry) |
| 5 | Evict oldest expired | join alice, bob → both leave → advance clock 31s → `update([charlie])` → charlie takes alice's slot (oldest expired), bob's slot remains offline |
| 6 | Evict: largest elapsed | join alice (leave at t=0), bob (leave at t=10) → advance to t=41 → `update([charlie])` → charlie takes alice's slot (older), bob's slot remains |
| 7 | Push when no expired | join alice → leave → advance 10s (within grace) → `update([bob])` → bob gets NEW slot (push). Alice's slot still offline. 2 slots total. |
| 8 | Multiple joins | `update([alice, bob, charlie])` → 3 slots, all online, stable order |
| 9 | Partial departures | join alice, bob, charlie → `update([charlie])` → alice+bob offline, charlie still online at original index |
| 10 | Bots don't leave | bots always in user list → they stay online forever, never greyed out |
| 11 | Reset clears all | join alice, bob → `reset()` → `getSlots()` returns [] |
| 12 | Reset then update | `reset()` → `update([charlie])` → 1 fresh slot for charlie |
| 13 | Empty updates | `update([])` on empty → no slots. `update([])` on populated → all offline. |
| 14 | Self-exclusion | UserId `me` filtered before `update()`. Slot manager never sees it. |
| 15 | Stable indices | join alice, bob → leave bob → join charlie → alice at index 0, charlie takes expired bob's slot at index 1 (or pushes to index 2 if within grace) |
| 16 | Grace period boundary | Leave at t=0. At t=29999, slot is within grace (will be reclaimed, not evicted). At t=30001, slot is expired (evictable). |

### 5.3 Clock Injection Pattern

```ts
let fakeNow = 0;
const clock = () => fakeNow;
const manager = new UserSlotManager(30000, clock);

// Advance time
fakeNow += 31000;
```

---

## 6. Integration: `src/client/online-panel.js` (Phase 2)

### 6.1 `OnlinePanel` Changes

```js
import { UserSlotManager } from './user-slot-manager.js';

class OnlinePanel extends LitElement {
  #slotManager = new UserSlotManager();

  // Replace #visibleUsers with computed #slots
  get #slots() { return this.#slotManager.getSlots(); }

  // get #onlineCount() { return this.#slots.filter(s => s.status === 'online').length; }
  // Used in panel header: "Play Online (${this.#onlineCount})"
}
```

**In `_connect()`:**
```js
this.#lobby.onUsersChange(users => {
  const allVisible = [...users, ...BOTS].filter(u => u.userId !== this.#myId);
  this.#slotManager.update(allVisible);
  this.dispatch({ type: 'USERS_UPDATE', payload: allVisible });
});
```

**On reconnect:** Call `this.#slotManager.reset()` before the batch update. The trigger mechanism needs discovery during implementation — likely via the lobby's `onReconnect` callback or a custom event.

### 6.2 `UserList` Changes

```js
class UserList extends LitElement {
  static properties = {
    // ADD:
    slots: { type: Array },
    // KEEP: myId, myName, tableId, isChallengePending, challenges, pendingChats
  };

  render() {
    const slots = this.slots || [];
    return html`<ul>${repeat(slots, (_, i) => i, (slot, i) => this._rowSlot(slot, i))}</ul>`;
  }

  _rowSlot(slot, index) {
    const isOffline = slot.status === 'offline';

    if (isOffline) {
      const u = slot.user; // Full snapshot from departure
      return html`
        <li class="is-offline" aria-label="${u.userName}">
          <div class="user-info">
            <span class="user-name">
              <span title="${flag(u.meta?.country).title}">${flag(u.meta?.country).emoji}</span>
              ${u.userName}
            </span>
          </div>
        </li>`;
    }

    const u = slot.user;
    // ... identical to current _row() logic (challenge/spectate/chat buttons) ...
  }
}
```

**`<user-list>` binding in `OnlinePanel.render()`:**
```html
<user-list
  .slots=${this.#slots}
  myId=${this.#myId}
  ...
>
```

### 6.3 Reconnect Hook

`OnlinePanel` needs to detect lobby reconnection to call `this.#slotManager.reset()`. Options:
- Pass `onReconnect` to `MessagingClient.joinLobby()` if the API supports `LobbyOptions`
- Listen for a custom event emitted by the lobby
- Or: the `onUsersChange` callback fires on reconnect with the full batch — detect this (non-trivial)

This is a Phase 2 implementation detail to resolve during integration.

### 6.4 Styles

In `src/client/styles.js`, add to `USER_LIST_STYLES`:
```css
.is-offline {
  filter: grayscale(1);
  opacity: 0.35;
  transition: opacity 0.3s ease-out;
  animation: none;
  pointer-events: none;
}
```

---

## 7. Open Questions / Known Tradeoffs

| # | Item | Status |
|---|------|--------|
| 1 | Field-change staleness | If a user changes userName while online, the slot shows the old name until they leave and rejoin (decision #9). Acceptable — presence field changes are rare and short-lived. |
| 2 | Reconnect reset trigger | Mechanism for calling `reset()` on reconnect needs discovery in Phase 2. Could be a trivial one-liner if the joinLobby API already supports `onReconnect`. |
| 3 | Bot userIds | Bots have hardcoded userIds (`bot-clawbreak`, `bot-thefarjaw`). If a human ever uses these IDs, the slot manager would conflate them. Extremely unlikely in practice. |
| 4 | Lit `repeat` with index keys | Using index as the repeat key means DOM nodes are recycled. When a slot is evicted and overwritten, the DOM node stays but content changes. The `fadeIn` animation on `<li>` handles visual transition. |

---

## 8. Implementation Phases

### Phase 1: Isolated (no existing code changes)
1. Create `src/client/user-slot-manager.js`
2. Create `test/user-slot-manager.spec.ts` with all 16 test cases
3. Run `npx jest test/user-slot-manager.spec.ts` — all pass

### Phase 2: Integration
4. Update `src/client/online-panel.js` — import, field, `_connect()`, `render()`, `UserList`
5. Update `src/client/styles.js` — add `.is-offline`
6. Run `npm run lint` (type-check)
7. Run `npm run test` (all existing tests still pass)
8. Run `npm run test:debug` (Playwright E2E tests still pass)
9. Manual smoke test — open lobby in 2+ tabs, join/leave, verify stable positions

---

## 9. What Does NOT Change

- `src/lobby.ts` — presence tracking, challenge logic, heartbeat are unchanged
- `src/types.ts` — no new types needed
- `src/nchanclient.ts` — transport layer unchanged
- `src/messagingclient.ts` — unchanged (unless reconnect hook needs a small tweak)
- Bots — still defined in `online-panel.js`, appended before feeding the slot manager
- Challenge/spectate/chat buttons — same logic, rendered from `slot.user` instead of `u`

---

## 10. Success Criteria

- [ ] `UserSlotManager` exists as a standalone class with no dependencies
- [ ] 16 unit tests pass with fake clock, under 100ms total
- [ ] Zero changes to `online-panel.js` during Phase 1
- [ ] After Phase 2, all existing Jest + Playwright tests pass
- [ ] Manual test: join with 3 tabs, verify positions are stable when 4th user joins/leaves
- [ ] Manual test: leave a tab, verify user shows greyed out for 30s, then gets evicted by next joiner
- [ ] Manual test: reconnect (BFCache restore or network toggle), verify clean slate
