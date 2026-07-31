# Proposal: Table Rejoin & Presence Detection (Lobby-Independent)

This document proposes design options to detect when a player rejoins a table after leaving or disconnecting, specifically focusing on solutions that operate **entirely over the table's specific channel**, completely independent of the main lobby.

---

## 1. Context & The Problem

Currently, when a player leaves a table, Nchan's unsubscribe hook (`nchan_unsubscribe_request` mapped to `table_unsub` in `docker/nchan_meta.js`) automatically publishes a system message of type `table:leave`:

```json
{
  "type": "table:leave",
  "senderId": "alice-123",
  "data": {}
}
```

When the remaining player's client receives this message, the `Table` class triggers its `onOpponentLeft` callback and sets `this.opponentLeft = true`.

However, detecting when that player **rejoins** the table channel is currently not possible or reliable due to the following limitations:
1. **Ignored/Filtered "joined" Messages**: Although a joining client publishes a `"joined"` message on connect, the `Table` class currently filters this message out of generic `onMessage` listeners. Once the table state resolves `bothJoined` (when it sees two unique IDs), any subsequent `"joined"` messages are ignored.
2. **Sticky Left State**: Once `this.opponentLeft` becomes `true`, there is no mechanism in `Table` to reset it back to `false` when the opponent returns.
3. **No Rejoin Event**: There is no `onOpponentRejoined` hook or event exposed to the consuming game client.

---

## 2. Proposed Options for Rejoin & Presence Detection

To solve this, we propose three distinct architectural options, ordered by where the core logic resides:

---

### Option A: SDK-Level Rejoin Detection (Client-Driven `"joined"` Handling)

In this approach, the client continues to publish a `"joined"` message when establishing or re-establishing its subscription. We update the SDK's `Table` class to recognize subsequent `"joined"` messages, reset the internal state, and notify consumers.

#### Implementation Concept

1. **Expose a Rejoin Callback**: Add `onOpponentRejoined(callback: () => void)` to the `Table` class.
2. **Update Incoming Message Logic**: Modify `handleIncomingMessage` to watch for `"joined"` messages from the opponent *after* `bothJoined` has resolved. If we receive a `"joined"` message from an opponent and `this.opponentLeft` is currently `true`:
   - Reset `this.opponentLeft = false`.
   - Fire registered `onOpponentRejoined` callbacks.

#### Code Snippet (Client-Side SDK Change)

```typescript
export class Table<T = any> {
  // ... existing properties ...
  private opponentRejoinedListeners: (() => void)[] = [];

  /**
   * Subscribe to opponent rejoin.
   */
  onOpponentRejoined(callback: () => void): void {
    this.opponentRejoinedListeners.push(callback);
  }

  private handleIncomingMessage(data: string): void {
    const msg = parseMessage<TableMessage<T>>(data);
    if (!msg || !msg.type) return;

    // Handle system leave messages
    if (msg.type === "table:leave" && msg.senderId !== this.userId && !isSpectatorTableLeave(msg)) {
      this.notifyOpponentLeft();
    }

    if (msg.type === "joined") {
      const joinData = msg.data as any;
      const joinedId = joinData?.id || msg.senderId;
      if (joinedId) {
        this.seenIds.add(joinedId);

        // 1. Initial connection resolution
        if (this.seenIds.size >= 2 && !this.bothJoinedResolved) {
          this.resolveBothJoined();
        }

        // 2. Rejoin detection (only if it's the opponent and we knew they had left)
        if (this.bothJoinedResolved && joinedId !== this.userId && this.opponentLeft) {
          this.opponentLeft = false;
          this.opponentRejoinedListeners.forEach((cb) => cb());
        }
      }
      return; // Still filter "joined" messages from generic app-level listeners
    }

    // ... rest of handleIncomingMessage ...
  }
}
```

#### Pros
- **Zero changes required on Nchan/Nginx**: Pure client-side JS/TS SDK logic.
- **Efficient**: Relies on the already-implemented and established client-to-client `"joined"` message sent on subscription ready.
- **Direct**: Explicitly signals intentional reconnection by the other machine's SDK.

#### Cons
- **Relies on Client Delivery**: If the rejoining client fails to publish `"joined"` (e.g., publish fails but subscription succeeded), the presence update is missed.

---

### Option B: Nchan-Driven Symmetrical Join/Rejoin Messages (`table:join` via `table_sub`)

Just as Nchan automatically publishes a `table:leave` message on disconnect via NJS, we can update the NJS `table_sub` hook to automatically publish a `table:join` message on connection.

#### Implementation Concept

1. **Update `docker/nchan_meta.js`**: Update the Nginx Javascript (NJS) `table_sub` function to publish a unified, server-generated event whenever a subscription starts.

```javascript
async function table_sub(r) {
  try {
    const userId = r.headersIn['X-User-Id'] || 'unknown';
    const tableId = r.headersIn['X-Nchan-Channel-Id'];
    ngx.log(ngx.WARN, `table_sub ${userId} to table ${tableId}`);

    if (userId !== 'unknown' && tableId) {
      const isSpectator = r.args.spectator === "1";
      const payload = {
        type: "table:join",
        senderId: userId,
        data: isSpectator ? { isSpectator: true } : {},
      };
      // Symmetrical auto-publish to table subscribers
      await publish_auto_leave(r, `/internal/publish/table/${tableId}`, payload, "nchan-auto-table-join");
    }

    r.return(200);
  } catch (e) {
    r.error(`table_sub error: ${e.message}`);
    r.return(500);
  }
}
```

2. **Handle `table:join` in SDK**: The `Table` class listens for `table:join` and updates state symmetrically.

```typescript
if (msg.type === "table:join" && msg.senderId !== this.userId && !isSpectatorTableLeave(msg)) {
  if (this.opponentLeft) {
    this.opponentLeft = false;
    this.opponentRejoinedListeners.forEach((cb) => cb());
  }
}
```

#### Pros
- **Symmetric Architecture**: Highly elegant since join/leave are handled identically by Nchan's NJS module.
- **Robust**: Guaranteed to fire when the physical WebSocket connection is successfully established on the server, removing client-side publication races.
- **Server-Side Source of Truth**: Handled cleanly at the network boundary.

#### Cons
- **Requires Server Re-deployment**: Requires modifying the Docker-side `nchan_meta.js` and reloading Nginx configuration.
- **Spurious Join Triggers on Start**: On initial page load, both players subscribing would trigger `table:join` messages, which need to be ignored or handled gracefully relative to the `bothJoined` state.

---

### Option C: Symmetrical Table Heartbeat / Ping-Pong (Peer-to-Peer)

Rather than relying on discrete state events (join/leave), the two clients can maintain presence directly using a low-frequency client-to-client heartbeat exchange over the table channel.

#### Implementation Concept

1. **Periodic Ping**: Every player client publishes a periodic `table:ping` (e.g., every 5 seconds) when active.
2. **Receive and Track Activity**: The client tracks the last seen timestamp of pings/messages from the opponent.
3. **Timeout / Return Detection**:
   - If no ping/message is received from the opponent for 12 seconds (approx. 2 pings + jitter), mark them as offline (`opponentLeft = true`).
   - As soon as any ping or message is received again, mark them as online (`opponentLeft = false` / trigger `onOpponentRejoined`).

#### Code Snippet (Client-Side SDK Change)

```typescript
export class Table<T = any> {
  private pingIntervalId: any = null;
  private lastOpponentActivity = Date.now();
  private checkIntervalId: any = null;

  startHeartbeat() {
    this.pingIntervalId = setInterval(() => {
      this.publish("table:ping", {} as any);
    }, 5000);

    this.checkIntervalId = setInterval(() => {
      const idleTime = Date.now() - this.lastOpponentActivity;
      if (idleTime > 12000 && !this.opponentLeft) {
        this.notifyOpponentLeft();
      }
    }, 3000);
  }

  private handleIncomingMessage(data: string): void {
    const msg = parseMessage<TableMessage<T>>(data);
    if (!msg || !msg.type) return;

    if (msg.senderId !== this.userId) {
      this.lastOpponentActivity = Date.now();
      if (this.opponentLeft && msg.type !== "table:leave") {
        this.opponentLeft = false;
        this.opponentRejoinedListeners.forEach((cb) => cb());
      }
    }

    if (msg.type === "table:ping") {
      return; // Filter out ping messages from generic listeners
    }
    // ... handle other messages ...
  }
}
```

#### Pros
- **Extremely Resilient**: Works regardless of whether Nchan's unsubscribe webhook fails or experiences delayed execution. It is fully autonomous and peer-to-peer.
- **Detects Silent Drops**: Instantly detects half-open connections or silent browser freezes that don't trigger immediate WebSocket close events.

#### Cons
- **Increased Message Overhead**: Generates continuous background publications on the table channel (though negligible in size and rate).
- **Power Consumption**: Periodic timers on mobile web pages can be throttled or wake up the CPU.

---

## 3. Recommended Approach

We recommend **Option A (SDK-Level Rejoin Detection)** as the primary and most immediate solution.

### Why Option A is Preferred:
1. **Lobby-Independent & Highly Decoupled**: It fulfills the goal of avoiding any dependency on the lobby channel, relying entirely on the local table channel subscriptions.
2. **Zero Server Overhead**: Requires no modifications or redeployments of the Nchan/NJS Docker environment, which is highly beneficial for local and containerized deployment parity.
3. **Consistency**: It leverages the existing `"joined"` message, which is already part of the protocol, but integrates it into a proper state-machine cycle where `opponentLeft` can be cleared and a new `onOpponentRejoined` hook is exposed.

If absolute robustness against silent network drops or page freezing is needed in the future, **Option C (P2P Heartbeats)** can be layered on top as an optional fallback mechanism.
