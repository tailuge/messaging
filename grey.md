# Leaving State

Add a 5-second grace period when a user leaves, so the UI shows them as "leaving" instead of immediately removing them. This prevents flicker when users briefly navigate away and rejoin.

## Context

- **Library** (`src/*.ts`): TypeScript — lobby, types, transport
- **Client UI** (`src/client/*.js`): Plain JavaScript — Lit web components, styles
- **Tests** (`test/*.spec.ts`): TypeScript — run with `npx jest --config test/jest.config.cjs`
- All timer/presence logic lives in `Lobby` (`src/lobby.ts`). `MessagingClient` only orchestrates lobby instances — no changes needed there.

## Changes

### 1. Types (`src/types.ts`)

Add to `PresenceMessage`:
```ts
isLeaving?: boolean; // True when user has sent 'leave' but grace period has not expired
```

### 2. Lobby (`src/lobby.ts`)

Add fields:
```ts
private leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
private readonly leaveGracePeriod = 5000;
```

Modify `handlePresenceUpdate(msg)`:
- **On `leave`:** Guard with `existing && !existing.isLeaving` (prevents duplicate timers on repeated leave messages). Set `existing.isLeaving = true`, clear cache, notify. Start a 5s timer that deletes the user when it fires. Guard the timer callback with `this.users.has(msg.userId)` since the pruner may have already removed the user.
- **On `join` or `heartbeat`:** Cancel any pending leave timer for this userId. Set `msg.isLeaving = false`. Then handle normally.

Modify `hasMeaningfulChange(oldMsg, nextMsg)`:
- Add `oldMsg.isLeaving !== nextMsg.isLeaving` — **critical**, otherwise a heartbeat that clears `isLeaving` won't trigger `notifyListeners()` and the UI stays grey.

Modify `leave()` (own user teardown):
- Clear all leave timers before clearing users.

Modify `startPruning()`:
- When the pruner deletes a stale user, also clear their leave timer if one exists. This prevents orphaned timers from firing after the user is already gone.

### 3. Styles (`src/client/styles.js`) — plain JS

Add to `USER_LIST_STYLES`:
```css
.is-leaving { filter: grayscale(1); opacity: 0.6; pointer-events: none; }
```

### 4. Online Panel (`src/client/online-panel.js`) — plain JS

In `_row(u)`, add class to the `<li>`:
```js
<li aria-label="${u.userName}" class="${u.isLeaving ? 'is-leaving' : ''}">
```

### 5. Test (`test/leaving-state.spec.ts`)

Run with: `npx jest --config test/jest.config.cjs test/leaving-state.spec.ts --no-coverage`

Four tests using `jest.useFakeTimers()` inside `beforeEach`/`afterEach`:
1. Leave → user stays in list with `isLeaving=true` → removed after 5s
2. Leave → rejoin within 5s → timer cancelled, user stays
3. Leave → heartbeat → timer cancelled, `isLeaving` cleared
4. Leave → `lobby.leave()` → all timers cleaned up

Note: On join, `isLeaving` is explicitly set to `false` (not `undefined`). Assert with `.toBe(false)`, not `.toBeUndefined()`.

## Gotchas (from first attempt)

1. **`hasMeaningfulChange` must include `isLeaving`** — Without this, a heartbeat clearing `isLeaving` gets silently dropped and the UI never updates.
2. **Guard duplicate leave messages** — `if (existing && !existing.isLeaving)` prevents re-starting timers and re-notifying.
3. **Guard timer callback with `users.has()`** — The pruner runs independently and may delete the user before the timer fires.
4. **Clear orphaned timers in pruner** — When the pruner removes a user, also `clearTimeout` and delete their leave timer.
5. **Jest needs `--config test/jest.config.cjs`** — Without it, ts-jest won't transform `.ts` test files.
6. **`jest.useFakeTimers()` goes in `beforeEach`** — Not at module top level, to avoid ts-jest parsing issues.

## Nchan Message Replay Bug (current issue)

### Background: Nchan buffered replay

The presence channel is configured with:
- `nchan_message_buffer_length 2000` — stores up to 2000 messages
- `nchan_message_timeout 90s` — messages persist in buffer for 90 seconds
- `nchan_subscriber_first_message oldest` — new subscribers receive ALL buffered messages oldest-first

When a user refreshes or reconnects, Nchan replays every message from the last 90 seconds.

### Core problems with the `setTimeout` approach

1. **`setTimeout` uses receipt time, not publish time.** During replay, a `leave` message from 80 seconds ago starts a *fresh* 5-second timer as if the user just left. Even though a subsequent `join` in the replay clears it, this is fragile — if the buffer contains a `leave` as the last message for a user (e.g. their heartbeat fell outside the 90s window but the auto-leave is within it), the user gets incorrectly greyed and removed.

2. **Dual leave messages per disconnect.** Every WebSocket disconnect generates TWO `leave` messages:
   - One from the client's `lobby.leave()` (HTTP POST / sendBeacon)
   - One from `nchan_meta.js` `presence_unsub` (auto-leave via internal subrequest)
   Both go into the buffer. While the second is a no-op in `handlePresenceUpdate`, it doubles buffer consumption and adds noise that complicates replay. The auto-leave also lacks `userName` — handled correctly now (it mutates the existing object in-place), but another fragility point.

3. **No timestamp-based deduplication.** The code comment says *"Nchan guarantees ordered delivery, so we don't need to check meta.ts for ordering"* — this is true for live messages, but during replay the client has no way to distinguish a fresh `leave` from a stale one. The `meta.ts` field (server-side publish timestamp) is on every message but unused in leave processing.

4. **`handlePresenceUpdate` mutates `existing` in-place on leave.** When a `leave` arrives, it sets `existing.isLeaving = true` on the object already in the Map. `existing.meta.ts` still reflects the *previous* heartbeat/join timestamp, not the leave's timestamp. So the prune cycle (which checks `meta.ts`) can't use leave timing for staleness decisions.

5. **Heartbeat interval vs buffer window race.** Heartbeats are every 60s, buffer timeout is 90s. There's a 30s window where a user's most recent heartbeat may be evicted from the buffer while an older auto-leave is still present. This creates an edge case where a currently-online user appears as leaving during replay.

### Recommended fix: timestamp-based approach

Replace `setTimeout` with logic driven by `meta.ts` (the server-side publish timestamp):

1. **On `leave`:** Store `msg.meta?.ts` as `lastLeaveTs` on the user record. Mark `isLeaving = true`. No timer.

2. **On non-leave (join/heartbeat):** If `isLeaving`, compare the new message's `meta.ts` to `lastLeaveTs`. Only clear the grey state if the new message is *newer* than the leave. If older, it's a stale replay — ignore it.

3. **Removal via prune cycle:** The existing prune (every 30s) also handles leave expiry: if `isLeaving && Date.now() - lastLeaveTs > leaveGracePeriod`, remove the user.

This is replay-safe because all decisions are based on absolute publish timestamps, not when the client received the message. An 80-second-old leave is recognized as stale immediately on receipt.
