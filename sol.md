# Ghost User Analysis and Solutions

## Why it's not reliable

Ghost users occur when a player appears to be online even after they have navigated away from the application. This happens for two main reasons:

1.  **Unreliable Teardown**: The current implementation of `leave` is `async` and involves multiple layers of method calls and promises (`MessagingClient.stop` -> `Lobby.leave` -> `NchanClient.publishPresence`). In many browsers, especially on mobile, when a `pagehide` or `visibilitychange` event fires, the browser may terminate the process before these asynchronous tasks complete, even if `navigator.sendBeacon` is used at the end of the chain.
2.  **Clock Skew in Pruning**: The pruning logic in `Lobby.ts` uses the `meta.ts` timestamp from the received message to determine if a user is stale. This timestamp is generated on the server (or by the Nchan metadata script). If there is a clock skew between the client's local clock and the server's clock (specifically, if the client's clock is behind), the calculated "age" of the message (`Date.now() - lastSeen`) will be smaller than reality, delaying the removal of ghost users.

## Suggested Solutions

### 1. Local Arrival Time for Pruning (Recommended)
Instead of relying on the server-provided `meta.ts` for staleness checks, the client should record the local time when a message is received. Pruning should then be calculated based on the elapsed time since that local arrival. This eliminates sensitivity to clock skew between clients and servers.

### 2. Synchronous Teardown Path
Implement a dedicated, non-async teardown path specifically for the `pagehide` event. This path should skip all internal state management and promise awaiting, and immediately call `navigator.sendBeacon` with the `leave` message. This increases the probability that the message is successfully queued before the browser kills the page execution context.

### 3. Server-Side Presence (Nchan)
Leverage Nchan's built-in presence tracking capabilities (e.g., `nchan_subscriber_presence_updates` or `nchan_stub_status`). By letting the server track active WebSocket connections and broadcast "quit" messages when a connection is dropped, the system becomes independent of the client's ability to send a final `leave` message. This is the most robust solution as it handles crashes and sudden network loss.
