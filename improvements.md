# Table Messaging Improvements Plan

## Scope and priority

**Main priority: remove connection-lifecycle work from consumer wrappers.** The current
consumer wrapper must maintain `pendingPublishes` because table messages can arrive
before `joinTable()` / `spectateTable()` resolves, while `Table.publish()` sends
immediately. It also has to guard against repeated joins creating duplicate
subscriptions.

The highest-value sequence is:

1. Make `Table.join()` and `MessagingClient.joinTable()` idempotent so one logical
   table has one shared join operation and one active subscription.
2. Move the initial-join publish queue into `Table.publish()` so application
   publishes wait for table readiness instead of being dropped or reimplemented by
   every consumer.
3. Extend the same queue across reconnect only after transport disconnect/reconnect
   state is observable (Phase 2).

This plan addresses these review findings:

1. Automatic WebSocket reconnect does not republish the table `joined` handshake.
2. Outbound table messages can currently be published before the local table is ready or during a reconnect gap.
3. `Table.join()` is not idempotent and can create duplicate subscriptions when called repeatedly or concurrently.

Phase 1 is limited to join-call idempotency and the initial-join publish queue.
Message deduplication, timestamp/sequence ordering, acknowledgements, and
end-to-end delivery guarantees are explicitly out of scope.

No changes should be made to the Nchan server configuration as part of this work unless testing proves that the client-side contract cannot be implemented safely without it.

---

## Desired public contract

### Join lifecycle

A `Table` instance represents one logical table session and owns at most one active `Subscription`.

- The first `join()` creates the subscription, waits for its initial readiness, and publishes one internal `joined` handshake message for a player.
- A second `join()` after a successful join is a no-op and resolves to the same table session.
- Concurrent `join()` calls share one in-flight Promise; they must not create multiple WebSockets or publish duplicate initial handshakes.
- After the later reconnect phases are implemented, automatic transport reconnect does not create a new `Table` object. It reuses the same table session and republishes `joined` for the new socket connection.
- A deliberate `leave()` stops the subscription and prevents queued messages from being flushed afterward.

### Outbound messages

`table.publish(type, data)` is application traffic and must not race the local subscription lifecycle.

- During initial join, it waits for the initial subscription and local handshake to be ready rather than publishing against an uninitialized table.
- During a transient reconnect, reconnect queueing is deferred until the transport lifecycle work in Phase 2 and the reconnect queue work in Phase 4.
- If the table is explicitly left, queued messages are rejected/cleared and must never be sent by a later reconnect.
- Queueing protects local transport readiness only. It must not be documented as guaranteed remote delivery; applications that require state recovery still need acknowledgements or a replayable state protocol.
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

## Phase 1: Make initial table joins safe and queue publishes in `Table`

**Goal:** eliminate the consumer wrapper's `pendingPublishes` and its defensive
join handling for the initial connection. This phase should establish the smallest
correct lifecycle before adding reconnect behavior.

### 1. Define the initial table states

Use explicit internal state rather than inferring readiness from one Boolean:

- `idle`: no subscription and no join in progress.
- `joining`: the shared initial join Promise is in flight.
- `ready`: the subscription is ready and the player's initial `joined` handshake has completed.
- `leaving`: teardown is in progress; queued publishes cannot be flushed.
- `closed`: the table has been deliberately left and cannot be reused for publishing or joined again.

Do not expose these fields as public API. Reconnect state is deferred to Phase 2.
`Table.join()` must reject after `closed`; only `MessagingClient` may create or
return a fresh replacement table session.

### 2. Make `Table.join()` idempotent

- The first `join()` creates the subscription and stores a shared `joinPromise`.
- Concurrent `join()` calls return the same in-flight Promise.
- A call after initial readiness is a no-op.
- Exactly one active subscription and one initial player `joined` handshake exist per join cycle.
- The message callback supplied through the constructor/options remains attached before subscription readiness, preserving early registration.
- A failed join clears or rejects the shared operation and any publishes waiting on it.

### 3. Move the initial-join publish queue into `Table`

`Table.publish()` must not call `nchan.publishTable()` until the table is ready.
Instead:

- Publishes made during `joining` are held by the `Table` and settle when the initial join becomes ready or fails.
- The internal `joined` handshake uses a separate control path and must not wait behind application publishes.
- Successful readiness flushes the held application publishes.
- Explicit `leave()` rejects or clears held publishes and prevents stale async work from sending them later.
- Queue capacity and publish failure behavior must be explicit; no publish may remain pending forever.
- This queue is transport readiness protection only. It does not provide acknowledgements, deduplication, or message ordering guarantees.

### 4. Make `MessagingClient.joinTable()` share the same operation

- An existing table lookup returns the existing `Table` without invoking a second join operation.
- Add a `MessagingClient`-level in-flight join map keyed by the logical table session identity, including `tableId`, `userId`, and player/spectator role.
- Concurrent `joinTable()` calls with the same key return the same in-flight Promise; they must not each construct a `Table`, open a subscription, or publish a handshake.
- Options supplied after the initial table creation do not add listeners; consumers must provide `onMessage` and `onBothJoined` on the initial join/spectate call.
- Before consulting or creating a session, reject a same-`tableId` call whose user or player/spectator role differs from the active session; do not let a different in-flight key bypass this conflict check.
- Remove the in-flight entry in a `finally` block.
- `MessagingClient` must register an internal lifecycle cleanup callback when it creates a `Table`; `Table.leave()` invokes that callback after teardown so the closed table is removed from `activeTables` and later joins create a fresh session.

### Phase 1 invariants

1. A logical table has at most one active subscription during its initial join cycle.
2. Concurrent/repeated join calls do not create duplicate initial handshakes.
3. An application publish issued before readiness is owned by `Table`, not by the consumer.
4. Every held publish is eventually settled or explicitly rejected/cleared on teardown.
5. The internal `joined` handshake cannot deadlock behind the application queue.

### Phase 1 tests

Add focused tests for:

- Concurrent `Table.join()` calls sharing one subscription and one initial handshake.
- Concurrent `MessagingClient.joinTable()` calls sharing one in-flight Promise and one table instance.
- Repeated `Table.join()` after readiness being a no-op.
- `Table.publish()` during initial join being delivered after readiness.
- Multiple early publishes settling when the join succeeds.
- Join failure and explicit leave settling/clearing held publishes.
- A consumer no longer needing a separate initial-connection publish queue.

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
- Invoke `onReconnect` after the replacement socket opens and define whether the table's replacement `joined` publish occurs before application publishing is reopened.
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

## Phase 3: Implement the reconnect handshake

Phase 1 owns the initial join Promise, idempotent join calls, and initial-join
publish queue. This phase handles only the transition after an established table
subscription disconnects.

### Automatic reconnect

When the existing subscription reconnects:

1. Mark public transport readiness false as soon as disconnect is reported.
2. Keep the same `Table` object and listeners.
3. Publish a fresh internal `joined` message for the new connection if this is a player.
4. Mark transport readiness true only after that control publish succeeds.
5. Leave application publishes held during reconnect to the queue behavior defined in Phase 4.

The existing opponent rejoin detection should continue to observe the new `joined` message. Add tests for both sides of the reconnect where possible, including the case where the peer receives the new handshake after seeing `table:leave`.

Do not reset the one-shot `bothJoined` Promise during a transient reconnect unless the API is deliberately changed to expose a separate reconnect-ready signal. `bothJoined` describes the initial table readiness; reconnect readiness is a distinct lifecycle event.

---

## Phase 4: Extend the publish queue across reconnect

Phase 1 establishes queue ownership during initial join. After Phase 2 exposes
transport disconnect/reconnect state, extend the same `Table.publish()` queue to
cover reconnecting sessions.

### Internal control path

Used for `joined` and future transport-control messages.

- Requires only a connected local subscription/transport.
- Must not wait for `bothJoined`.
- Must not enter the public application-message queue.
- Must be protected from duplicate execution per connection generation.

### Public application path

Used by `table.publish(type, data)`.

- If the table is ready, publish immediately.
- If reconnecting, hold the publish until replacement readiness is established.
- If the table is leaving/closed, reject immediately with a documented error.
- If the queue reaches its maximum, reject the new call without disturbing existing held publishes.
- Every held publish must resolve or reject exactly once; no silent drops or permanently pending Promises.

Do not add message deduplication, timestamp ordering, sequence numbers, or
end-to-end delivery acknowledgements in this phase.

Add focused tests for publishes issued during reconnect, explicit leave during
reconnect, failed replacement handshakes, and queue capacity behavior.
---

## Phase 5: Update `MessagingClient` integration

Review `MessagingClient.activeTables` handling alongside the new idempotent table lifecycle.

- Existing-table lookup should return the existing instance without calling `join()` in a way that creates a second subscription.
- Concurrent `joinTable()` calls for the same logical table session should share the same client-level in-flight join operation.
- A same-`tableId` call with a different user or player/spectator role must reject before creating another session.
- Options supplied on a later existing-table call do not add listeners; consumers must provide `onMessage` and `onBothJoined` on the initial join/spectate call.
- `MessagingClient` must register an internal cleanup callback on each created `Table`; direct `Table.leave()` invokes it after teardown so the closed table is removed from `activeTables`.
- Failed joins must remove their in-flight map entry, and `Table.join()` after `closed` must reject.
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
2. A message published during the reconnect is held until the documented reconnect-ready state.
3. Repeated `join()` calls do not create duplicate subscriptions or handshakes.

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
- Existing early-registration, both-joined, spectator, and rejoin tests remain green.
- New reconnect, queue, idempotent-join, and listener-option tests pass.
- Message deduplication and ordering are not required for this work.
- Typecheck/lint passes without introducing new errors.
