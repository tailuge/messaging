# Ghost User Analysis and Solutions

## Why it's not reliable

Ghost users occur when a player appears to be online even after they have navigated away from the application. This typically happens due to **Unreliable Teardown**:

The current implementation of `leave` is `async` and involves multiple layers of method calls and promises (`MessagingClient.stop` -> `Lobby.leave` -> `NchanClient.publishPresence`). In many browsers, especially on mobile, when a `pagehide` or `visibilitychange` event fires, the browser may terminate the process before these asynchronous tasks complete. Even if `navigator.sendBeacon` is used at the very end of the chain, the preceding logic (awaiting state updates, stopping timers, etc.) can delay the final network call beyond the browser's termination window.

## Suggested Solutions

### 1. Synchronous Teardown Path
Implement a dedicated, non-async teardown path specifically for the `pagehide` event. This path should skip all internal state management and promise awaiting, and immediately call `navigator.sendBeacon` (or `fetch` with `keepalive: true`) with the `leave` message. This increases the probability that the message is successfully queued before the browser kills the page execution context.

### 2. Native Nchan Presence Tracking (Recommended)
The most robust solution is to move the responsibility of "leaving" from the client to the server. Nchan can be configured to automatically broadcast presence updates when a subscriber's connection is closed.

By enabling `nchan_subscriber_presence_updates`, Nchan will publish a message to the channel whenever a WebSocket connection is established or terminated. This handles not only graceful navigation but also browser crashes, tab kills, and network losses.

**Configuration Example for `nchan.conf`:**

```nginx
location = /subscribe/presence/lobby {
    nchan_subscriber;
    nchan_channel_id "presence/lobby";

    # Enable native presence updates
    nchan_subscriber_presence_updates on;

    # Optional: Customize the presence message format if needed
    # nchan_presence_data_prefix '{"type": "nchan_presence", "action": "';
    # nchan_presence_data_suffix '"}';

    include /etc/nginx/metadata_headers.conf;
    include /etc/nginx/cors.conf;
}
```

When this is enabled, Nchan will send messages like `connection` and `disconnection` to all other subscribers on that channel. The client-side `Lobby` class can then listen for these native Nchan messages to instantly remove users who have disconnected, without waiting for a manual `leave` message or a timeout.

### 3. Server-Side Heartbeat Monitoring
Leverage Nchan's `stub_status` or a dedicated monitoring service to track active connections. If the server detects that a specific user's connection has been dead for a certain period, it can proactively publish a `leave` message on their behalf. This provides a definitive source of truth that doesn't depend on the client's ability to execute code during teardown.
