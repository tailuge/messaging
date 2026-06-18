# Phase 2 Integration Spec — UserSlotManager

> Derived from `user-slot-manager-spec.md` + 4 rounds of stakeholder interview.
> Phase 1 (class + unit tests) is complete. This covers integration into `online-panel.js`.

---

## 1. Core Principle: Slot Manager is a Sidecar

The `UserSlotManager` is a **rendering transform layer** — it takes the same raw user list already flowing through the system and produces stable slots for the `<user-list>` Lit component. Nothing else in `OnlinePanel` changes.

All existing:
- `#visibleUsers` getter
- `dispatch({ type: 'USERS_UPDATE', ... })`
- `#challenge()` / `#acceptChallenge()` / event handlers
- `#info()` debug dump
- `#state.users` in the reducer

...remain **exactly as they are today**. The slot manager is a sidecar.

## 2. Changes to `src/client/online-panel.js`

### 2.1 Add import (top of file)

```js
import { UserSlotManager } from './user-slot-manager.js';
```

### 2.2 Add field to `OnlinePanel`

```js
class OnlinePanel extends LitElement {
  // ... existing fields ...
  #slotManager = new UserSlotManager();
```

### 2.3 Add slot feeding in `_connect()`

Inside `_connect()`, add one line to the existing `onUsersChange` callback:

```js
// BEFORE:
this.#lobby.onUsersChange(users => this.dispatch({ type: 'USERS_UPDATE', payload: users }));

// AFTER:
this.#lobby.onUsersChange(users => {
  const allVisible = [...users, ...BOTS].filter(u => u.userId !== this.#myId);
  this.#slotManager.update(allVisible);
  this.dispatch({ type: 'USERS_UPDATE', payload: users });  // still dispatches raw users
});
```

Note: `dispatch` still receives raw `users` (no bots, no self-filter) — `#visibleUsers` and reducer state are unchanged.

### 2.4 Add `#slots` getter

```js
get #slots() { return this.#slotManager.getSlots(); }
```

### 2.5 Update panel header count

The header count stays based on raw users (decision: keep raw count):

```html
<!-- UNCHANGED -->
<span class="panel-title">Play Online (${this.#visibleUsers.filter(u => u.userId !== this.#myId).length})</span>
```

### 2.6 Update `<user-list>` binding

```html
<!-- BEFORE -->
<user-list
  .users=${this.#visibleUsers}
  myId=${this.#myId}
  ...

<!-- AFTER -->
<user-list
  .slots=${this.#slots}
  myId=${this.#myId}
  ...
```

### 2.7 Update `#info()` — dump slots too

```js
#info() {
  // Existing raw user dump (unchanged)
  const data = [...this.#visibleUsers]
    .filter(u => u.meta?.country !== 'BOT')
    .map(u => { ... });
  console.log('=== USERS ===');
  console.log(JSON.stringify(data, null, 2));
  console.log('=== MY INFO ===');
  console.log(JSON.stringify({ myId: this.#myId, myName: this.#myName }));

  // NEW: slot dump
  console.log('=== SLOTS ===');
  console.table(this.#slots.map(s => ({
    userId: s.userId,
    status: s.status,
    offlineSince: s.offlineSince,
    online: s.status === 'online' ? '✓' : '✗',
  })));
}
```

---

## 3. Changes to `UserList` Lit Component (same file)

### 3.1 Add `slots` property

```js
static properties = {
  slots: { type: Array },   // NEW
  myId: { type: String },
  myName: { type: String },
  tableId: { type: String },
  isChallengePending: { type: Boolean },
  challenges: { type: Object },
  pendingChats: { type: Object },
};
```

Note: `users` property is **removed** since nothing uses it anymore.

### 3.2 Update `render()`

```js
// BEFORE:
render() {
  const others = (this.users || []).filter(u => u.userId !== this.myId);
  if (others.length === 0) return html`<div class="empty">No other players online yet...</div>`;
  return html`<ul>${repeat(others, u => u.userId, u => this._row(u))}</ul>`;
}

// AFTER:
render() {
  const slots = this.slots || [];
  const onlineSlots = slots.filter(s => s.status === 'online');
  if (onlineSlots.length === 0) return html`<div class="empty">No other players online yet. Invite a friend!</div>`;
  return html`<ul aria-label="Online players">${repeat(slots, (_, i) => i, (slot, i) => this._rowSlot(slot, i))}</ul>`;
}
```

Key: `repeat` uses slot **index** as the key — positions never change.

### 3.3 New method `_rowSlot(slot, index)` — delegates to `_row()` for online

To minimize line growth, the existing `_row(u)` method is **kept unchanged**.
`_rowSlot()` only adds the offline branch (~10 lines) and delegates to `_row()` for online users:

```js
_rowSlot(slot, index) {
  if (slot.status === 'offline') {
    const u = slot.user;  // snapshot from departure
    const status = getEmoji(u.meta?.origin ?? '', u.ruleType ?? '', userStatus(u));
    return html`
      <li class="is-offline" aria-label="${u.userName}">
        <div class="user-info">
          <span class="user-name">
            <span title="${flag(u.meta?.country).title}">${flag(u.meta?.country).emoji}</span>
            ${u.userName}
            <span aria-label="${status.title}" role="img">${status.emoji}</span>
          </span>
        </div>
      </li>`;
  }
  // Online — delegate to existing _row()
  return this._row(slot.user);
}
```

Net growth: ~10 lines. `_row()` stays untouched — zero duplication.

---

## 4. Changes to `src/client/styles.js`

Add to `USER_LIST_STYLES`:

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

## 5. What Does NOT Change

| Component | Status |
|-----------|--------|
| `OnlinePanel.#visibleUsers` getter | **Kept** — used by lookups, header count, #info(), #challenge() |
| `OnlinePanel.dispatch()` | **Kept** — dispatches raw users unchanged |
| `OnlinePanel._connect()` other callbacks | **Kept** — onChallenge, notification unchanged |
| `OnlinePanel.#challenge()` | **Kept** — still uses #visibleUsers for user lookup |
| `OnlinePanel.render()` event handlers | **Kept** — @challenge, @spectate, @open-chat unchanged |
| `OnlinePanel.#info()` | **Enhanced** — adds slot dump |
| `OnlinePanel.#autoChallenge` logic | **Kept** |
| `ChallengeModal` | **Kept** |
| `BOTS` array | **Kept** |
| `src/lobby.ts` | **Unchanged** |
| `src/types.ts` | **Unchanged** |
| `src/nchanclient.ts` | **Unchanged** |

---

## 6. Explicit Non-Goals (for this phase)

- ❌ No reconnect reset — `slotManager.reset()` not called on reconnect (decision: skip for now)
- ❌ No off-switch / URL param toggle (decision: no off switch)
- ❌ No special bot offline handling (decision: ignore)
- ❌ No sub-phase splitting (decision: one integration step)
- ❌ No slot transition animation beyond existing fadeIn (decision: just fadeIn)

---

## 7. Test Strategy

### 7.1 Skip existing failing test

The `MessagingClient - Phase 1 › should attach version to metadata when setVersion is used` test is pre-existing failure. Skip it:

```bash
npm run test -- --testPathPattern='user-slot-manager|presence-dedupe|lobby-logic|lifecycle|chat|heartbeat|unsub|replay|messagingclient|nchanclient|simultaneous|challenge-dedup'
```

Or add `test.skip` to that test to silence it permanently.

### 7.2 Integration test plan

1. **`npm run lint`** — type-check after all changes
2. **`npm run test`** — all existing Jest tests pass (minus the pre-existing skip)
3. **`npm run test:debug`** — Playwright E2E tests pass with updated selectors
4. **Manual smoke test** — 2+ browser tabs

### 7.3 Expected Playwright selector updates

The Playwright tests use selectors like:
- `online-panel` → `user-list` → `li` elements
- Challenge button selectors within user rows

After migration, `li` elements still exist but may have different aria-labels or classes. Run Playwright to identify needed fixes.

---

## 8. Success Criteria

- [ ] `npm run lint` passes (zero TypeScript errors)
- [ ] `npm run test` passes all suites except pre-existing setVersion failure
- [ ] `npm run test:debug` Playwright tests pass after selector updates
- [ ] Manual test: open lobby, verify bots appear at stable positions
- [ ] Manual test: 2nd tab joins — appears at a stable position, doesn't shift bots
- [ ] Manual test: 2nd tab leaves — greyed out with flag + name visible
- [ ] Manual test: 2nd tab returns within 30s — reclaims same slot
- [ ] Manual test: challenge button appears for online users, not for grey rows
- [ ] Manual test: spectate button appears for playing users
- [ ] Manual test: chat button (💬) appears when unread messages exist
