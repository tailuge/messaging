# Ghost Users: Concrete Recommendation for `docker/nchan.conf`

## Recommendation

For this project, the best Nchan-side improvement is:

1. Keep the existing client heartbeat and `staleTtl` pruning in `src/lobby.ts` as the fallback.
2. Add an **unsubscribe hook** to `/subscribe/presence/lobby` so Nchan emits a synthetic `leave` when a websocket disconnects.
3. Add **server websocket pings** so dead sockets are detected faster and the unsubscribe hook fires sooner.

This is a better fit than relying only on browser `pagehide` teardown. The browser can drop async work during unload, but Nchan still knows when the websocket disappears. Nchan’s official docs support this with `nchan_unsubscribe_request`, and note that the target location must use `proxy_ignore_client_abort on;` or abrupt disconnects may not trigger reliably. Source: https://nchan.io/

## Why this fits this repo

Today ghost-user cleanup is mostly client-side:

- `src/lobby.ts` prunes users after `staleTtl` (default `90000` ms).
- `docker/nchan.conf` retains presence messages for `90s`.
- `/subscribe/presence/lobby` has no disconnect hook, so the system must wait for heartbeat expiry when `leave` is missed.

That works, but it means a crashed tab or broken mobile connection can leave a user visible for up to ~90 seconds.

An unsubscribe hook shortens that path:

- browser/tab closes or network dies
- Nchan notices websocket disconnect
- Nchan calls an internal unsubscribe handler
- handler publishes `{ messageType: "presence", type: "leave", userId, userName }`
- all subscribers remove that user immediately

The existing TTL prune remains important as a backup for cases where disconnect detection is delayed.

## Concrete `docker/nchan.conf` changes

### 1. Add websocket pinging and unsubscribe hook to the presence subscriber

Update the existing `/subscribe/presence/lobby` location in `docker/nchan.conf`:

```nginx
location = /subscribe/presence/lobby {
    access_log /var/log/nginx/access.log main;
    nchan_subscriber;
    nchan_channel_id "presence/lobby";
    nchan_message_buffer_length 2000;
    nchan_message_timeout 90s;
    nchan_subscriber_first_message oldest;
    nchan_subscriber_timeout 7200s;

    # Detect broken websocket clients sooner.
    nchan_websocket_ping_interval 20s;

    # Emit a synthetic leave when the websocket unsubscribes.
    nchan_unsubscribe_request /internal/presence/unsub;

    include /etc/nginx/metadata_headers.conf;
    include /etc/nginx/cors.conf;
}
```

### 2. Add an internal unsubscribe handler

Add a new internal location in `docker/nchan.conf`:

```nginx
location = /internal/presence/unsub {
    internal;

    # Required by Nchan docs for abrupt disconnect reliability.
    proxy_ignore_client_abort on;

    include /etc/nginx/metadata_headers.conf;
    include /etc/nginx/cors.conf;

    js_content nchan_meta.presence_unsub;
}
```

## What the unsubscribe handler should do

The handler should publish a normal presence `leave` message back into the same lobby channel:

```json
{
  "messageType": "presence",
  "type": "leave",
  "userId": "...",
  "userName": "..."
}
```

For this repo, the simplest implementation is an NJS handler in `docker/nchan_meta.js` that:

1. reads `userId` and `userName` from the original subscribe request query string
2. POSTs the synthetic leave to `/internal/publish/presence/lobby`
3. returns `204`

This keeps the whole solution inside the existing Nginx/Nchan container. No separate backend is required.

## Important required client change

The current websocket subscribe URL is just:

```ts
/subscribe/presence/lobby
```

That is not enough for an unsubscribe hook to identify which user left.

So the presence subscriber request must include stable user identity in the query string, for example:

```ts
/subscribe/presence/lobby?userId=alice&userName=Alice
```

Without that, Nchan can detect a disconnect but cannot publish a correct `leave` for the right user.

For this project, `userId` is mandatory. `userName` should also be included so the synthetic leave matches the normal message shape. `tableId` is optional and not required for deletion because `Lobby.handlePresenceUpdate()` removes by `userId`.

## Recommended behavior after this change

- Primary cleanup path: Nchan unsubscribe hook publishes `leave` quickly after disconnect.
- Fallback cleanup path: existing heartbeat + `staleTtl` prune removes users if disconnect detection is slow or missed.
- Keep `nchan_message_timeout 90s` for buffered presence replay; it solves reconnect/state sync, not ghost-user cleanup.

## What not to rely on

- Do not rely only on `pagehide` / `sendBeacon`. It improves graceful exits but is not reliable enough for crashes, mobile tab kills, or network loss.
- Do not treat `nchan_subscriber_timeout 7200s` as ghost-user protection. It is far too long for presence correctness.
- Do not remove client-side pruning after adding the hook. Disconnect hooks improve latency, but TTL pruning is still the safety net.

## Bottom line

If you want the most useful `docker/nchan.conf` change for ghost users in this repo, it is:

- add `nchan_unsubscribe_request /internal/presence/unsub;`
- add `nchan_websocket_ping_interval 20s;`
- implement `/internal/presence/unsub` as an NJS handler that republishes a synthetic presence `leave`
- pass `userId` and `userName` on the presence subscribe URL

That gives this project a fast server-side leave signal while preserving the current TTL-based recovery path.
