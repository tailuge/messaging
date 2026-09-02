# Arena Chat Plan

Use Nchan pub/sub directly. No server-side storage, no API endpoints, no NJS changes.

## Channels

Each arena gets its own Nchan channel:

```
/publish/arena/:arenaId   — send a message
/subscribe/arena/:arenaId — receive messages (WebSocket or EventSource)
```

Nchan's message buffer serves as the chat history. Clients subscribing late receive buffered messages immediately.

## Nginx routes

Add to `docker/nchan.conf`:

```nginx
location ~ ^/publish/arena/(?<arenaId>[\w-]+)$ {
    include /etc/nginx/cors.conf;
    js_content nchan_meta.publish;
}

location ~ ^/internal/publish/arena/(?<arenaId>[\w-]+)$ {
    internal;
    nchan_publisher;
    nchan_channel_id $arenaId;
    nchan_message_buffer_length 20;
    nchan_message_timeout 3600s;
    default_type application/json;
}

location ~ ^/subscribe/arena/(?<arenaId>[\w-]+)$ {
    nchan_subscriber;
    nchan_channel_id $arenaId;
    nchan_message_buffer_length 20;
    nchan_message_timeout 3600s;
    nchan_subscriber_first_message oldest;
    nchan_websocket_ping_interval 20s;
    include /etc/nginx/cors.conf;
}
```

## Client usage

**Send a message:**

```text
POST /publish/arena/arena-123
Content-Type: application/json

{ "message": "Hello" }
```

The existing `nchan_meta.publish` handler enriches it with `meta` (timestamp, userId, etc.) automatically.

**Receive messages** — subscribe once on page load:

```js
const ws = new WebSocket("wss://example.com/subscribe/arena/arena-123");
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  // msg.message, msg.meta.ts, msg.meta.ua, etc.
};
```

On connect, Nchan replays the last 20 buffered messages before delivering live ones.

## Behavior

- History limit is controlled by `nchan_message_buffer_length` (set to 20).
- History TTL is controlled by `nchan_message_timeout` (set to 1 hour).
- Late subscribers receive buffered history automatically on connect.
- Chat is in-memory and disappears when Nginx restarts.
- No server-side code changes required.
