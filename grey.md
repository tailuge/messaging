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
