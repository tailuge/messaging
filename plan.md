# Reliability Review: Lobby Matchmaking & Page Transitions

## Analysis of the Issue

The current implementation of the messaging library is highly reliable for terminal sessions (closing a tab), but it is too aggressive for intentional page transitions (e.g., redirecting from a lobby to a specific game URL).

### 1. Root Cause: Aggressive `pagehide` Teardown
In `src/messagingclient.ts`, the `pagehide` event listener calls `this.stop({ isTeardown: true })`. This triggers:
- `Lobby.leave()`: Sends an explicit `type: "leave"` presence message.
- `Table.leave()`: Sends an explicit `type: "SYSTEM_DISCONNECT"` table message.

### 2. Immediate Opponent Notification
When the opponent receives these messages, or when their "watchdog" (`Table.handleLobbyUsersChange`) sees the user disappear from the lobby list (which happens immediately after a "leave" message), they are notified that the player has left.
- In `Table.ts`, the logic `if (this.opponentSeen && !opponent) { this.notifyOpponentLeft(); }` is instantaneous.

## Proposed Approach for Reliable Transitions

To allow players to navigate to a new URL without misleading their opponents, we propose the following changes:

### 1. Add Transitioning State to `MessagingClient`
Introduce an `isTransitioning` flag or a `prepareForTransition()` method.
- When `prepareForTransition()` is called (just before `window.location.href = ...`), the flag is set.
- The `handlePageHide` listener will check this flag. If `isTransitioning` is true, it should skip sending explicit "leave" messages but still stop local timers and close the WebSocket.

### 2. Differentiate Leave Intent
In `Lobby.leave` and `Table.leave`, add an option to suppress the broadcast of the leave message.
- For transitions, we want the server-side presence to eventually time out (via heartbeat TTL) rather than being explicitly terminated immediately. This gives the player time to load the next page and "resume" their presence.

### 3. Implement Watchdog Grace Period in `Table`
Modify `Table.handleLobbyUsersChange` to not immediately trigger `notifyOpponentLeft`.
- Instead of an immediate notification, start a short timer (e.g., 5-10 seconds).
- If the opponent reappears in the lobby (meaning they successfully loaded the game page and rejoined), cancel the timer.
- If the timer expires and the opponent is still gone, then trigger `notifyOpponentLeft`.

### 4. Enhance `NchanClient` for Quick Re-sync
Ensure that when the new page loads and the client re-joins, the `ready` promise and initial presence broadcast happen as quickly as possible to minimize the "gap" seen by the opponent.

## Conclusion
By transitioning from an "immediate-fail" model to a "graceful-recovery" model, the system will become much more resilient to the standard web pattern of redirecting between lobby and game pages.
