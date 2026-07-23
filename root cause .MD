# Root Cause Analysis: Spurious Table Leave Notification on Player 2 Join

## 1. Bug Description
Game clients (especially Player 1, the challenger) see a false `table:leave` notification for Player 2 on the game page just as Player 2 joins.

---

## 2. Step-by-Step Flow & Root Cause

1. **Accepting the Challenge (Lobby Context)**:
   - When Player 2 clicks "Accept" in the Lobby, the browser triggers `Lobby.acceptChallenge(...)` in `src/lobby.ts`.
   - `Lobby.acceptChallenge` performs three consecutive operations:
     1. Publishes the `"accept"` challenge message to Nchan.
     2. Updates Lobby presence to show they have joined the table.
     3. Instantiates a `Table` class and calls `await table.join()`.
   - `table.join()` subscribes to the table channel by opening a WebSocket connection to:
     `ws://<host>/subscribe/table/<tableId>?uid=Player2`

2. **Redirecting to Game Page**:
   - In the same rendering loop cycle, the `OnlinePanel` component detects the match transition via the `currentMatch` state and redirects the browser using `window.location.href = url` to go to the game page.

3. **Lobby Page Unload & WebSocket Disconnection**:
   - Because of the redirection, the lobby page is unloaded.
   - The browser automatically aborts and closes the active WebSocket connection to the table subscription (`subscribe/table/<tableId>`) created in the lobby context.

4. **Nchan Unsubscribe Hook Triggered**:
   - The Nchan server detects that the WebSocket connection has been terminated.
   - Since `nchan_unsubscribe_request /internal/table/unsub$is_args$args;` is configured for the `/subscribe/table/` location, Nchan triggers this HTTP subrequest with Player 2's query parameters (including `uid=Player2`).

5. **Spurious `table:leave` Broadcast**:
   - The `/internal/table/unsub` subrequest maps to `table_unsub` in `docker/nchan_meta.js`.
   - `table_unsub` retrieves Player 2's `userId` from the headers (`X-User-Id` derived from `uid` parameter) and publishes an automated `"table:leave"` message to the table channel.

6. **Notification Display on Game Page**:
   - Player 1 has already loaded the game page and successfully subscribed to `/subscribe/table/<tableId>`.
   - Player 1's table client receives the `"table:leave"` message for Player 2 (sent by Nchan's unsubscribe hook due to the lobby page unload) and shows a leave notification, even though Player 2 is actually in the middle of loading/joining the game page.

---

## 3. Recommended Fixes (For Future Implementation)

While no client-side code changes are applied in this pass, the following solutions can resolve this bug:

- **Option A (Do not join table in Lobby)**:
  - Remove `await table.join()` from `Lobby.acceptChallenge()` in `src/lobby.ts` since the lobby context is about to be completely replaced by the game page navigation anyway. Only join the table when the game page itself loads.
- **Option B (Implement connection counting in NJS)**:
  - Configure `nchan_subscribe_request` for the table subscription and maintain an active connection counter per `userId:tableId` in Nginx shared memory (`ngx.shared.online_users` or similar). Only publish the `"table:leave"` message when the connection counter for that user drops to zero.
