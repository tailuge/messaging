# Out-of-order presence messages due to network latency

## Environment

- **Pub/sub transport**: Nchan (Nginx module) with an NJS script (`nchan_meta.js`) that enriches messages with server-side `meta.ts` timestamps via `Date.now()` at publish time.
- **Auto-leave**: When a subscriber disconnects, Nchan fires an `nchan_unsubscribe_request` → the NJS `presence_unsub` handler calls `publish_leave(userId)`, which publishes a `leave` message stamped with the server's current `Date.now()`.
- **Client library** (`src/lobby.ts`): Processes presence messages in arrival order. A `join` adds the user to the map; a `leave` removes them. No timestamp comparison is done.

## The bug

Two presence messages arrive at the server nearly simultaneously:

```json
[
  {
    "messageType": "presence",
    "type": "join",
    "userId": "AnOn-cr36t",
    "userName": "AnOniMouse2",
    "clientTs": 1781717348840,
    "meta": {
      "ts": 1781717349142,
      "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "RO",
      "city": "Iași",
      "since": 1781716114597,
      "version": "v4.37"
    }
  },
  {
    "messageType": "presence",
    "type": "leave",
    "userId": "AnOn-cr36t",
    "meta": {
      "ts": 1781717349143,
      "ua": "nchan-auto-leave",
      "origin": "internal"
    }
  }
]
```

**What actually happened** (the real causal order):
1. User AnOniMouse2 was connected in a previous session
2. That previous session disconnected → NJS published an auto-leave
3. User reconnected → client published a fresh `join`
4. Due to network latency, the `join` reached the server *before* the stale auto-leave from step 2

**What the timestamps show**:
- `join` stamped at `1781717349142`
- `leave` (auto-leave) stamped at `1781717349143` — only 1ms later, because both were processed by the server at nearly the same instant

**What the lobby code does**:
- Processes `join` → adds AnOniMouse2 to the users map ✅
- Processes `leave` → removes AnOniMouse2 from the users map ❌

**Result**: Other users in the lobby do NOT see AnOniMouse2 as online, even though they are actually present and connected.

## The evidence from the full dataset

Looking at the complete message sequence (`full` in `test/replay.spec.ts`), there were heartbeats from AnOniMouse2 *before* this join, and the auto-leave was from the *previous* connection being cleaned up. The fresh `join` at `1781717349142` represents the user's actual current state — they are online and should be visible.

## Key challenge

The server (NJS/Nchan) stamps each message with a monotonically increasing `meta.ts` at the moment it's published. Messages that arrive at the server at nearly the same time get nearly identical timestamps. The causal ordering (which session the leave actually belongs to) is lost.

The **client-side `clientTs`** tells us when the client *sent* the message, but the leave message (`nchan-auto-leave`) is generated server-side by NJS and has no `clientTs` — only `meta.ts`.

## Question

What approaches could the lobby client (`src/lobby.ts`) use to correctly determine that AnOniMouse2 is online, even when a stale auto-leave arrives just after a fresh join? Specifically:

- Should the lobby compare `meta.ts` timestamps and ignore a `leave` if there's a more recent `join`?
- Should the NJS auto-leave include additional metadata (e.g., the connection's `since` or a session token) so the client can tell it's a stale leave?
- Are there other patterns from real-time systems that handle this kind of out-of-order pub/sub message delivery?
