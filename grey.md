# Leaving State

Add a 5-second grace period when a user leaves, so the UI shows them as "leaving" instead of immediately removing them. This prevents flicker when users briefly navigate away and rejoin.

## Changes

### 1. Types (`src/types.ts`)

Add `isLeaving?: boolean` to `PresenceMessage`.

### 2. Lobby (`src/lobby.ts`)

- Add `leaveTimers: Map<string, ReturnType<typeof setTimeout>>` to `Lobby`.
- **On `leave` message:** Don't delete the user. Set `isLeaving = true`, start a 5-second timer that deletes the user and notifies listeners when it expires. Notify listeners immediately so the UI can grey them out.
- **On `join` or `heartbeat`:** If a leave timer exists for this user, cancel it. Clear `isLeaving`. Process normally.
- **In `leave()` (own user teardown):** Cancel all leave timers.

### 3. Styles (`src/client/styles.js`)

Add to `USER_LIST_STYLES`:

```css
.is-leaving { filter: grayscale(1); opacity: 0.6; pointer-events: none; }
```

### 4. Online Panel (`src/client/online-panel.js`)

In `_row(u)`, apply `is-leaving` class to the `<li>` when `u.isLeaving` is true.

## Summary

- **One field**: `isLeaving` on `PresenceMessage` — library-only state, not sent over the wire.
- **One timer**: Per-user 5s timer in the lobby, cancelled on rejoin.
- **One CSS class**: `.is-leaving` greys out the row and disables interaction.
