# Table Messaging Improvements Plan

## Scope

This plan addresses the following review findings:

1. Automatic WebSocket reconnect does not republish the table `joined` handshake.
2. Outbound table messages can currently be published before the local table is ready or during a reconnect gap.
3. `Table.join()` is not idempotent and can create duplicate subscriptions when called repeatedly or concurrently.

The implementation should preserve the existing early-registration behavior and the current ordering guarantee for player messages:

```text
onBothJoined callback -> queued early onMessage callbacks -> bothJoined Promise continuations
```

No changes should be made to the Nchan server configuration as part of this work unless testing proves that the client-side contract cannot be implemented safely without it.

---

## Desired public contract

### Join lifecycle

A `Table` instance represents one logical table session and owns at most one active `Subscription`.

- The first `join()` creates the subscription, waits for its initial readiness, and publishes one internal `joined` handshake message for a player.
- A second `join()` after a successful join is a no-op and resolves to the same table session.
- Concurrent `join()` calls share one in-flight Promise; they must not create multiple WebSockets or publish duplicate initial handshakes.
- Automatic transport reconnect does not create a new `Table` object. It reuses the same table session and republishes `joined` for the new socket connection.
- A deliberate `leave()` stops the subscription and prevents queued messages from being flushed afterward.

### Outbound messages

`table.publish(type, data)` is application traffic and must not race the local subscription lifecycle.

- During initial join, it waits for the initial subscription and local handshake to be ready rather than publishing against an uninitialized table.
- During a transient reconnect, it is queued FIFO rather than silently sent into a dead connection.
- After the replacement socket is connected and the replacement `joined` handshake has been accepted by the transport, queued messages are flushed in order.
- If the table is explicitly left, queued messages are rejected/cleared and must never be sent by a later reconnect.
- Queueing protects local transport readiness only. It must not be documented as guaranteed remote delivery; applications that require state recovery still need acknowledgements, sequence numbers, or a replayable state protocol.
- Internal control messages such as `joined` must bypass the public-message queue to avoid a handshake deadlock.

The plan should establish a bounded queue policy. Prefer a configurable maximum with a safe default, and reject new publishes with a clear error when the queue is full rather than allowing unbounded memory growth.

### Incoming messages and listeners

Listeners are registered only through the options passed to `joinTable()` or
`spectateTable()`. Those options are forwarded to the `Table` constructor so the
callback is active before subscription setup can deliver messages:

```ts
await client.joinTable(tableId, userId, {
  onMessage: handler,
  onBothJoined: onBothJoined,
});
```

- `onMessage` callbacks receive eligible application messages, including messages drained from `preJoinQueue`.
- `joined` control messages remain filtered from application `onMessage` callbacks.

---

## Phase 1: Define the table state machine

Before editing code, document and implement explicit internal states rather than inferring them from one Boolean:

- `idle`: no active subscription and no join in progress.
- `joining`: initial subscription/join Promise is in flight.
- `ready`: local subscription is connected and the initial `joined` handshake has been published.
- `reconnecting`: the existing subscription is recovering; public messages are queued.
- `leaving`: explicit teardown is in progress; reconnect and queue flushing are disabled.
- `closed`: the table has been deliberately left and cannot send until a clearly defined new join cycle.

At minimum, introduce state equivalent to:

- `joinPromise` / `joiningPromise` for concurrent-call deduplication.
- A transport readiness flag or generation number.
- An outbound FIFO queue containing message payloads and their Promise resolve/reject functions.
- A deliberate-leave flag or lifecycle generation to invalidate stale asynchronous work.

Do not expose these internal fields as public API.

### Invariants

1. At most one active `Subscription` exists per `Table` instance.
2. At most one initial `joined` publish is made per join cycle.
3. Every automatic reconnect publishes a fresh `joined` control message exactly once for that connection generation.
4. A public `publish()` never calls `nchan.publishTable()` while the local subscription is known to be disconnected or before initial join readiness.
5. Queued publishes preserve FIFO order.
6. Queued publishes are either flushed once or rejected once; no Promise remains pending after leave or terminal failure.
7. A stale reconnect callback from an old subscription cannot mutate the state of a newer join cycle.
8. The internal `joined` publish cannot wait on the public outbound queue.

---

## Phase 2: Make transport lifecycle observable

The current `Subscription` exposes `ready`, `stop()`, and `onReconnect`, but no explicit disconnect/connection state. The table cannot reliably gate public publishes during the interval between socket close and reconnect using only `onReconnect`.

Extend the internal transport lifecycle contract minimally, for example with callbacks equivalent to:

```ts
export type Subscription = {
  stop: () => void;
  ready: Promise<void>;
  onReconnect?: () => void;
  onDisconnect?: () => void;
};
```

Preferred behavior:

- Invoke `onDisconnect` when an established socket closes unexpectedly.
- Do not invoke it for an intentional `stop()`.
- Invoke `onReconnect` after the replacement socket opens and before or around the table's replacement `joined` publish according to the chosen ordering contract.
- Preserve existing lobby behavior and tests.
- Ensure callbacks are associated with the current socket/connection generation so an old socket's close event cannot mark a newer socket disconnected.

If changing `Subscription` directly is undesirable, provide an equivalent readiness callback/state abstraction, but do not use arbitrary timers as the reconnect gate.

Update `NchanClient` unit tests for:

- Initial open resolving `ready`.
- Unexpected close invoking disconnect exactly once.
- Reconnect invoking reconnect after a new open.
- Intentional `stop()` not scheduling reconnect or invoking the unexpected-disconnect path.
- Old socket events not corrupting the current connection state.

---

## Phase 3: Implement idempotent `Table.join()` and reconnect handshake

### Initial join

Refactor `Table.join()` so all callers share one operation:

1. If already `ready`, return immediately.
2. If `joining`, return the existing `joinPromise`.
3. If `reconnecting`, wait for the current reconnect readiness as appropriate rather than opening another subscription.
4. If `idle`/reusable, create exactly one subscription and attach the message handler before awaiting readiness.
5. Attach transport lifecycle callbacks immediately after creating the subscription.
6. Await initial `subscription.ready`.
7. Mark local transport ready.
8. For players, publish internal `joined` exactly once for the initial connection.
9. Mark the table ready and flush any public messages queued during initial join.
10. On failure, reject the join and all queued publishes that cannot be completed; reset to a retryable state if that is supported.

The internal handshake should use a dedicated private method such as `publishJoined()` rather than calling the public `publish()` method.

### Automatic reconnect

When the existing subscription reconnects:

1. Mark public transport readiness false as soon as disconnect is reported.
2. Keep the same `Table` object and listeners.
3. Publish a fresh internal `joined` message for the new connection if this is a player.
4. Mark public transport readiness true only after that control publish succeeds.
5. Flush queued public messages FIFO.
6. If the handshake publish fails, keep the queue pending and allow the transport's reconnect/error policy to determine the next attempt; do not silently drop messages.

The existing opponent rejoin detection should continue to observe the new `joined` message. Add tests for both sides of the reconnect where possible, including the case where the peer receives the new handshake after seeing `table:leave`.

Do not reset the one-shot `bothJoined` Promise during a transient reconnect unless the API is deliberately changed to expose a separate reconnect-ready signal. `bothJoined` describes the initial table readiness; reconnect readiness is a distinct lifecycle event.

---

## Phase 4: Gate and queue `Table.publish()`

Split publishing into two paths:

### Internal control path

Used for `joined` and future transport-control messages.

- Requires only a connected local subscription/transport.
- Must not wait for `bothJoined`.
- Must not enter the public application-message queue.
- Must be protected from duplicate execution per connection generation.

### Public application path

Used by `table.publish(type, data)`.

- If the table is ready, publish immediately.
- If initial join or reconnect is in progress, enqueue the message and return a Promise tied to its eventual flush.
- If the table is leaving/closed, reject immediately with a documented error.
- If the queue reaches its maximum, reject the new call without disturbing existing queued messages.
- On a publish failure, reject that message and define whether later messages remain queued or are also rejected. Prefer preserving order and rejecting the failed item plus the remaining queue if ordering can no longer be trusted.
- Do not flush concurrently: one flush loop must own queue draining, and a second reconnect/join callback must await the existing flush Promise.

Add tests for:

- `publish()` called before `join()` completes is delivered after readiness.
- Multiple early publishes preserve order.
- `publish()` during reconnect is delayed until replacement handshake completion.
- Queue overflow rejects predictably.
- Leave rejects/clears queued messages.
- A failed publish does not leave a hanging Promise.
- Internal `joined` is still sent when no peer has joined yet.

Document that this is transport gating/queueing, not an end-to-end delivery acknowledgement.

---

## Phase 6: Update `MessagingClient` integration

Review `MessagingClient.activeTables` handling alongside the new idempotent table lifecycle.

- Existing-table lookup should return the existing instance without calling `join()` in a way that creates a second subscription.
- Concurrent `joinTable()` calls for the same `tableId` should share the same table/join operation.
- Options supplied on a later existing-table call do not add listeners; consumers must provide `onMessage` and `onBothJoined` on the initial join/spectate call.
- `stop()` must prevent reconnect callbacks and outbound queue flushing after table teardown.
- A later new table session must not inherit stale listeners, queue entries, or connection-generation state.

Add unit tests for concurrent `MessagingClient.joinTable()` calls and repeated joins after leave/stop.

---

## Validation plan

Run focused tests first:

```bash
npx jest --config test/jest.config.cjs --runInBand \
  test/early-registration.spec.ts \
  test/both-joined-slow-party.spec.ts \
  test/table-both-joined.spec.ts \
  test/table-rejoin.spec.ts \
  test/nchanclient.spec.ts
```

Add or update focused test files for the new behavior, then run:

```bash
npm run lint
npm test -- --runInBand
```

If transport reconnect behavior is covered by browser-level behavior rather than a deterministic unit mock, add a focused Playwright or integration scenario that forcibly closes the table WebSocket and verifies:

1. The peer sees the expected leave/rejoin transition.
2. A message published during the reconnect is delivered once, after readiness.
3. No duplicate messages result from repeated `join()` calls.

Check generated/client artifacts only if the source change requires rebuilding them; avoid committing generated output unless this repository's normal workflow requires it.

---

## Compatibility and rollout notes

- Keep constructor/options listener registration as the only supported table-listener path.
- Treat `bothJoined` as initial readiness, not a reconnect notification. If consumers need reconnect awareness, consider a separate documented callback/event rather than changing Promise semantics.
- Do not promise that a queued message survives process termination, page unload, or permanent network failure.
- Do not use fixed sleeps to determine reconnect readiness.
- Do not silently discard queued application messages.
- Keep internal control messages separate from application traffic so reconnect handshake cannot deadlock behind the public queue.

## Completion criteria

This work is complete when:

- Reconnecting table sockets republish `joined` exactly once per replacement connection.
- Repeated and concurrent `Table.join()` calls do not create duplicate subscriptions.
- Public outbound messages are gated/queued across initial join and transient reconnect, with bounded memory and deterministic Promise settlement.
- Explicit leave prevents stale reconnects and queued sends.
- Existing early-registration, both-joined ordering, spectator, and rejoin tests remain green.
- New reconnect, queue, idempotency, and listener-option tests pass.
- Typecheck/lint passes without introducing new errors.
