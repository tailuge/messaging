# Fix suggestion: out-of-order auto-leave after rejoin

## Scenario

The failing scenario is valid and the client library should tolerate it:

1. A player is on the game page with an active Nchan subscription.
2. They click "return to lobby", causing navigation away from the game page.
3. Nchan notices the old websocket/subscriber is gone and starts producing an internal auto-`leave`.
4. The player reaches the lobby page quickly and publishes a fresh `join`.
5. The delayed internal auto-`leave` from the old connection is delivered after the fresh `join`.

In the fixture, the fresh `join` has `meta.ts = 1781717349142` and the internal auto-`leave` has `meta.ts = 1781717349143`, only 1 ms later. Treating the last delivered message as authoritative removes a player who is actually online.

## Root cause

`MessageDeduplicator.dedupePresence()` currently uses "last message per userId wins". That works for normal FIFO replay, but it is too weak for Nchan-generated internal leaves because those leaves are about subscriber lifecycle, not necessarily about the user's latest logical presence.

The auto-`leave` is missing `clientTs`, `userName`, and session identity. When it arrives immediately after a real `join`, the client cannot prove that it belongs to the new session. Given the product requirement, the safer interpretation is:

> An internal Nchan auto-`leave` that arrives shortly after a user `join` should be treated as stale cleanup for the previous connection, not as proof that the new presence is gone.

## Recommended fix

Add stale-auto-leave suppression to the presence state reducer, not only to the replay deduper.

The rule should be:

```text
When handling a leave:
  if the leave is an internal Nchan auto-leave
  and the current stored state for that user is join/heartbeat
  and the current stored state was published very recently
  and the leave has no clientTs or has an older/equal logical session timestamp
  then ignore the leave.
```

Use a small grace window, for example 250 ms. Consider making it a named constant such as `AUTO_LEAVE_REJOIN_GRACE_MS = 250`.

An internal auto-leave can be identified by:

```typescript
msg.type === "leave" &&
msg.meta?.origin === "internal"
```

The recent join time should come from the stored user's `meta.ts` when available, falling back to `clientTs` only if necessary. For the fixture:

```text
existing join meta.ts = 1781717349142
auto leave meta.ts     = 1781717349143
delta                  = 1 ms
```

Since `1 <= 500`, ignore the auto-leave and keep the user online.

## Where to implement it

Implement this in `Lobby.applyPresence()` before deleting a user on `leave`.

That catches both paths:

- settled realtime messages handled directly by `applyPresence()`
- replayed unsettled messages after `fireSettled()`

Do not put the rule only in `MessageDeduplicator.dedupePresence()`. The race can happen after the lobby has settled too, so the reducer that mutates `users` needs to enforce the invariant.

`MessageDeduplicator.dedupePresence()` can also be improved, but it should not be the only protection.

## Suggested helper shape

Add a helper near `applyPresence()`:

```typescript
private shouldIgnoreAutoLeave(msg: PresenceMessage, existing?: PresenceMessage): boolean {
  if (!existing) return false;
  if (msg.type !== "leave") return false;
  if (msg.meta?.ua !== "nchan-auto-leave" || msg.meta?.origin !== "internal") return false;
  if (existing.type === "leave") return false;

  const leaveTs = msg.meta?.ts;
  const existingTs = existing.meta?.ts ?? existing.clientTs;
  if (leaveTs === undefined || existingTs === undefined) return false;

  return leaveTs >= existingTs && leaveTs - existingTs <= AUTO_LEAVE_REJOIN_GRACE_MS;
}
```

Then use it at the start of the leave branch:

```typescript
if (msg.type === "leave") {
  if (this.shouldIgnoreAutoLeave(msg, existing)) return;
  ...
}
```

This keeps explicit user-originated leaves working normally because they do not have `ua: "nchan-auto-leave"` and `origin: "internal"`.

## Optional stronger fix (do not do this fix)

The most robust design is to add a per-presence-session id.

For every `joinLobby()` session, generate a `presenceSessionId` and include it on every `join`, `heartbeat`, `updatePresence`, and explicit `leave`. If Nchan can include the subscriber/session id in its auto-leave payload, the client can ignore a leave whose session id does not match the currently stored session.

That is cleaner than a grace window, but it requires protocol/server changes. The 500 ms suppression rule is the pragmatic client-only fix for the current message shape.

## Test note

Add at least one negative test too:

- `join`, then internal auto-`leave` after more than 500 ms should remove the user.
