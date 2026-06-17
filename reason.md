# Presence Replay Issue Analysis

## Symptom
Users joining the lobby do not see other online users immediately, even though Nchan is configured to replay the last 2000 messages (up to 90 seconds old). Users only appear once they publish a fresh heartbeat or join message.

## Root Cause
The issue is caused by a conflict between **Client-Side Pruning** and **Server-Side Replay** combined with **Clock Skew**.

### 1. Clock Desynchronization
The `Lobby` class in `src/lobby.ts` performs staleness pruning using the following logic:
```typescript
const lastSeen = user.meta?.ts || 0;
if (Date.now() - lastSeen > this.staleTtl) {
    this.users.delete(userId);
}
```
Here, `Date.now()` is the **client's local system time**, while `user.meta.ts` is the **server's publish time**. If the client's clock is ahead of the server's clock by even a few seconds, replayed messages (which are already "old") may appear to exceed the `staleTtl` (90s) immediately upon receipt.

### 2. Tight TTL Window
Both Nchan's message timeout (`nchan_message_timeout`) and the library's `staleTtl` are set to 90 seconds.
- Nchan replays messages up to 90s old.
- If a client receives a replayed message that was published 85 seconds ago, and the client's clock is 6 seconds ahead of the server, the message is instantly seen as 91 seconds old (`Date.now() - 85s = 91s`).
- The pruner, which runs every 30 seconds, will immediately delete these "stale" users from the local state before the UI can even render them reliably.

### 3. Initial State Emptying
When the `Lobby` first connects, it receives the backlog. The very first run of `startPruning` (or even the receipt logic if it were to check immediately) kills these replayed users because they are too close to the expiration limit relative to the client's clock.

## Solution
Transition from using absolute system time (`Date.now()`) to **Logical Stream Time**.

The `Lobby` will track the maximum `meta.ts` seen from the server (`maxSeenServerTs`). Pruning will be calculated relative to this "watermark". This ensures that replayed messages are evaluated within the same timeline they were created, making the system immune to client-server clock drift.
