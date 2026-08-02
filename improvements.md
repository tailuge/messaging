# Table Messaging Improvements Plan

## Purpose

Remove connection-lifecycle work from consumer wrappers and make table messaging
reliable at startup. The external game client (`MessagingMessageRelay`) currently
compensates for library gaps with `pendingCallbacks`, `pendingPublishes`,
`lastProcessedTimestamp` dedup, a `table:leave` filter, and an
`awaitBothJoined(8000)` timeout. After this plan, the relay collapses to a thin
pass-through and "impossible to send a message that would not be received" holds
within the documented buffer window.

## Status (2026-08-02)

All five work items (A–E) are implemented. The current source, generated bundle,
Nchan image, and test suite have been validated with `npm run lint`,
`npm run build:all`, and `npm run test`.

The server is authoritative for message identity: normal JSON publishes receive a
UUID-shaped `meta.msgId` during metadata enrichment, and Nchan-generated table and
presence auto-leaves receive one in their direct publish path. The client does not
generate message IDs or apply a timestamp fallback. `Table` uses the server ID only
to suppress a replay of a message already delivered by the same table session;
`meta.ts` remains the event timestamp.

| Item | Status | Tests |
|---|---|---|
| A. Idempotent join + single creation path | ✅ done | test/table-join-idempotent.spec.ts (14) |
| B. One bounded outbox in `Table.publish()` | ✅ done | test/table-outbox.spec.ts (7) |
| C. Reconnect re-announces `joined` | ✅ done | test/table-reconnect.spec.ts (6) |
| D. Internal replay dedup | ✅ done (msgId-keyed, not ts-only) | test/table-dedup.spec.ts (7) |
| E. `bothJoined` stays simple (no timeout) | ✅ kept as-is; hang-proofing via B + C | existing both-joined / slow-party / rejoin suites |

## Consumer context: how the game client uses the library today

The primary consumer is the external billiards game, a separate project consuming
this package as `@tailuge/messaging`. Its flow:

1. **Lobby page** (this repo's `src/client/`) runs the challenge handshake over
   presence — `lobby.challenge()` / `lobby.acceptChallenge()` — then redirects to
   the external game page URL carrying the `tableId`.
2. **Game page** creates its own `MessagingClient` and joins the table through a
   `MessageRelay` adapter (`MessagingMessageRelay`), which registers callbacks in
   the `joinTable()` options (constructor registration) and hooks `onOpponentLeft`
   / `onOpponentRejoined` post-join.

The relay implements `connect / subscribe / publish / awaitBothJoined` and is
concrete evidence of the library's rough edges — every workaround in it maps to a
library gap:

| Relay workaround | Library gap it compensates for |
|---|---|
| `pendingCallbacks` + "register before join" + version comments (≥ 1.36 / 1.37) | `Table` only accepts `onMessage` / `onBothJoined` at construction; no post-join registration |
| `pendingPublishes` + flush after connect — "the WebSocket is live before this.table is assigned" | `joinTable()` returns the table session before the subscription handshake completes; `Table.publish()` now owns the bounded queue, ordering, and retry behavior |
| `lastProcessedTimestamp` dedup | On reconnect Nchan replays the channel buffer from `oldest`; `Table` now suppresses already-processed server `msgId`s before application delivery |
| `msg.type !== "table:leave"` filter | `Table` handles `table:leave` and `joined` internally and exposes lifecycle callbacks instead |
| `awaitBothJoined(8000)` timeout wrapper | `joined` is retried and re-announced by the library; await `table.bothJoined` directly and provide application-level cancel UX for a player who never joins |

`Lobby.acceptChallenge()` no longer constructs a `Table` — it only publishes the
accept message and updates presence. The table is joined via
`MessagingClient.joinTable()` with the same `tableId` (a client-generated channel
id, not a server entity), keeping a single table-creation path.

## Target API

```ts
// join — resolves as soon as the session exists; the handshake continues in the
// background (subscription ready + joined publish + presence update)
const table = await client.joinTable(tableId, userId, {
  isSpectator,
  onMessage: (msg: TableMessage<T>) => { ... },  // constructor/options registration kept
  onBothJoined: () => { ... },                   // the no-loss guarantee comes from the
});                                              // inbound buffer, not from registration timing

// more hooks may be added post-join (these already work today)
table.onOpponentLeft(cb);
table.onOpponentRejoined(cb);

// pub — safe at any time; queued, serialized, retried until the server accepts
await table.publish("BeginEvent", { ... });   // (type, data) signature kept

// signal — resolves once both players' `joined` handshakes have been seen.
// No timeout, no boolean: a never-arriving opponent is the app's waiting/quit UX.
await table.bothJoined;
```

## Design decisions (recorded)

1. **`joinTable()` resolves as soon as the session exists**, not after the full
   handshake. The handshake continues in the background and `publish()` queues
   until the subscription is live. This is what actually removes the consumer's
   `pendingPublishes` and fixes the startup `WatchEvent` race. `await
   table.bothJoined` remains the "fully joined" signal: it resolves when both
   players' `joined` handshakes have been seen. Hang-proofing comes from the
   outbox retry (B) and the reconnect re-announce (C), not from a timeout.
2. **Keep constructor/options listener registration** as the only supported
   listener path. The no-loss guarantee comes from the inbound buffer; constructor
   placement is its simplest expression.
3. **Keep client-published `joined`; keep disconnect cleanup server-side.** The
   player handshake is published by the client through the reliable control path,
   retried until accepted, and re-published after reconnect. An explicit
   `Table.leave()` publishes `table:leave`; when a WebSocket disappears without
   running application code, the Nchan unsubscribe hook publishes the server-side
   auto-leave. This covers both graceful and abrupt shutdowns.
4. **Failure-driven retry, no disconnect state machine.** Publishes are separate
   HTTP POSTs that keep working during a local reconnect gap (the server buffers
   them; the peer receives them live or via replay). The only real failure is the
   server being down, handled by retry-on-failure with backoff. Therefore no
   `onDisconnect` transport lifecycle is needed; `onReconnect` already exists for
   the one reconnect action we need.

## Work items

### A. Idempotent join + single creation path — ✅ done (test/table-join-idempotent.spec.ts)

- `Table.join()`: shared in-flight promise; concurrent calls return the same
  promise; a call after initial readiness is a no-op; rejects after `closed`.
  Exactly one active subscription and one initial player `joined` handshake per
  join cycle.
- `MessagingClient.joinTable()`: returns the session as soon as it is created
  (per design decision 1). In-flight join map keyed by the logical session
  identity (`tableId`, `userId`, player/spectator role); concurrent calls with the
  same key share one operation; same-`tableId` calls with a different user or role
  reject before creating another session; in-flight entry removed in a `finally`.
- Lifecycle cleanup: `MessagingClient` registers an internal callback when it
  creates a `Table`; `Table.leave()` invokes it after teardown so the closed table
  is removed from `activeTables` and later joins create a fresh session.
- Options supplied on a later existing-table call do not add listeners; consumers
  provide `onMessage` / `onBothJoined` on the initial join/spectate call.

Tests: concurrent `join()` calls share one subscription/handshake; concurrent
`joinTable()` calls share one in-flight promise and one table instance; repeated
`join()` after readiness is a no-op; same-tableId different-role/user rejects;
repeated joins after leave/stop create a fresh session; a consumer no longer needs
a separate initial-connection publish queue.

### B. One bounded outbox in `Table.publish()` — ✅ done (test/table-outbox.spec.ts)

A single mechanism covering initial join, reconnect gaps, and server-down:

- `publish()` enqueues; a serial flusher POSTs in order; on failure, retries with
  exponential backoff until the server accepts (HTTP 200).
- Control messages (`joined`) use a separate control path and must not wait
  behind application publishes (no handshake deadlock).
- The queue is bounded (configurable maximum, safe default); new publishes reject
  with a clear error when full — no unbounded memory growth.
- Explicit `leave()` / `closed` rejects or clears held publishes and prevents
  stale async work from sending them later; every held publish resolves or rejects
  exactly once.
- The queue protects transport readiness / failure only. It is not documented as
  guaranteed remote delivery; applications that need state recovery still use
  acks or a replayable state protocol (see bounded risks below).

Tests: publishes issued during initial join are delivered after readiness;
multiple early publishes settle in order; publish failure triggers retry;
explicit leave during pending retries settles/clears the queue; queue capacity
rejects without disturbing existing holds.

### C. Reconnect re-announces `joined` — ✅ done (test/table-reconnect.spec.ts)

- Wire the table subscription's `onReconnect`: `Table` re-publishes a fresh internal
  `joined` for the replacement
  connection (control path) and flush the outbox.
- Keep the same `Table` object and listeners across reconnect.
- Existing opponent rejoin detection continues to observe the new `joined`.
- Fixes the "server restart → dead table" hang and makes rejoin detection work
  without an explicit re-join.

Tests: reconnect republishes `joined` exactly once; the peer receives the new
handshake after seeing `table:leave`; messages published during the reconnect gap
are not lost (delivered via buffer replay).

### D. Internal replay dedup — ✅ done (test/table-dedup.spec.ts, msgId-keyed)

- Skip replayed messages on reconnect by a server-generated per-message `msgId`,
  FIFO-bounded to the channel buffer size. Server `meta.ts` alone is insufficient:
  it has millisecond granularity, so two DISTINCT messages can share a ts — a
  ts-only dedup drops the second one (observed: the `bothJoined` handshake strand).
- This replaces the relay's `lastProcessedTimestamp` workaround with a
  collision-free server message identity rather than a timestamp.

Tests: reconnect replay does not re-deliver already-processed message IDs;
new message IDs are delivered even when their timestamps are older than a
previously seen message; ordering of genuinely new messages is preserved;
DISTINCT messages sharing the same millisecond ts are all delivered; replay
re-delivering the same msgId is skipped.

### E. Keep `bothJoined` simple — no timeout, no message-based inference — ✅ kept as-is (no code change needed; existing suites verify)

- Keep today's semantics: `bothJoined` resolves when both players' `joined`
  handshakes have been seen (`seenIds >= 2`). Only players publish `joined`, so
  spectators cannot satisfy it — no player/spectator ambiguity.
- Hang-proofing comes from B (the `joined` handshake is retried by the outbox
  until accepted) and C (a fresh `joined` is re-published on reconnect), not from
  a timer or from counting application messages as presence.
- No timeout, no boolean result, no "opponent's first message counts" fallback.
  A never-arriving opponent is an application concern: waiting screen + quit /
  `leave()` UX.
- Do not reset the one-shot promise on transient reconnect; reconnect readiness is
  a distinct lifecycle event (see C).

Tests: existing both-joined and slow-party race tests stay green; an initial
`joined` publish that fails then succeeds via outbox retry still resolves
`bothJoined` (covered by B); a reconnect during the waiting period (re-announced
`joined`) still resolves `bothJoined` (covered by C).

## Not needed (cut from earlier drafts)

- **`Subscription.onDisconnect` lifecycle (old Phase 2)** — failure-driven retry
  covers server-down; `onReconnect` already exists for re-announcing `joined`.
  No timers are used to determine reconnect readiness.
- **Separate initial-join queue vs reconnect queue (old Phases 1 + 4)** — one
  unified outbox (item B) covers both.
- **Explicit Table state machine (`idle/joining/ready/leaving/closed`)** — only
  `closed` is needed (reject after leave); "ready" is not a gate with
  failure-driven publishes.
- **Sentinel-based catch-up rewrite of `preJoinQueue` / `seenIds`** — optional
  cleanup; not needed for correctness once items C and E are in place.

## Already true today (no work)

- Constructor/options-only listener registration (kept by design).
- `joined` control messages filtered from `onMessage`.
- Vestigial `acceptChallenge` `Table` construction — removed.

## Bounded risks (documented honestly)

- Peer absent longer than the buffer window (2000 messages / message expiry) →
  message evicted. The early-send guarantee applies within that retention window.
  Mitigation: state-snapshot resync once `bothJoined` resolves
  (for billiards, the current game state subsumes lost moves).
- Residual `bothJoined` hang: the opponent's `joined` is evicted from the buffer
  window *and* they never reconnect (no re-announce). Effectively unreachable for
  players (both join at game start); for a spectator joining a long-running game
  the informational `bothJoined` promise may stay pending — their messages still
  flow to `onMessage` (the pre-join queue gates players only).
- Server restart wipes in-memory channels. Same mitigation, or Nchan Redis
  persistence (`nchan_use_redis`) — the only path to true durability, out of scope.
- HTTP 200 means "accepted by the server", not "processed by the peer". For a
  turn-based game, at-least-once + snapshot resync is the pragmatic contract.

## Validation plan

Run focused tests first:

```bash
npx jest --config test/jest.config.cjs --runInBand \
  test/early-registration.spec.ts \
  test/both-joined-slow-party.spec.ts \
  test/table-both-joined.spec.ts \
  test/table-rejoin.spec.ts \
  test/messagingclient.spec.ts
```

**Current state (2026-08-02):** the repository has been validated with `npm run lint`,
`npm run build:all`, and `npm run test`. `test/no-loss.spec.ts` is the explicit early-send
acceptance test: A publishes `M1` and `M2`, awaits both server accepts, then B starts joining
and must receive exactly both messages in order from the retained table buffer—without waiting
for `bothJoined`. `test/both-joined-slow-party.spec.ts` additionally covers the slower-party
race around `bothJoined`; replay suppression is keyed by server-generated `meta.msgId`.

Then, after each work item's tests are added:

```bash
npm run lint
npm test -- --runInBand
```

If reconnect behavior is covered at browser level rather than by a deterministic
unit mock, add a focused Playwright scenario that forcibly closes the table
WebSocket and verifies: the peer sees the leave/rejoin transition; a message
published during the reconnect gap is delivered; repeated `join()` calls do not
create duplicate subscriptions or handshakes.

Check generated/client artifacts only if the source change requires rebuilding
them; avoid committing generated output (`dist/`, `docker/html/*` are gitignored
and regenerated by `npm run build`).

## Completion criteria

This work is complete when:

- ✅ Reconnecting table sockets republish `joined` exactly once per replacement
  connection.
- ✅ Repeated and concurrent `Table.join()` / `joinTable()` calls do not create
  duplicate subscriptions or handshakes.
- ✅ Public outbound messages are queued, retried, and ordered by one bounded outbox,
  with deterministic Promise settlement; explicit leave rejects/clears them.
- ✅ Reconnect replays are deduplicated internally (no duplicate delivery to the app).
- ✅ `bothJoined` resolves after both players' `joined` handshakes are seen; the
  handshake is retried and re-announced after reconnect. If the opponent never
  joins, the promise remains pending and the consumer owns that UX.
- ✅ Existing early-registration, both-joined, slow-party, spectator, rejoin, and
  no-loss tests pass in the current suite.
- ⏳ The separate consumer project still needs to apply the migration below; this
  repository cannot verify changes made outside this repository.
- ✅ Typecheck/lint passes without new errors.

## Compatibility and rollout notes

- Keep constructor/options listener registration as the only supported table
  listener path.
- Treat `bothJoined` as initial readiness, not a reconnect notification.
- Do not promise that a queued message survives process termination, page unload,
  or permanent network failure.
- Do not use fixed sleeps to determine reconnect readiness (retry backoff is not
  a readiness heuristic).
- Do not silently discard queued application messages.
- Keep internal control messages separate from application traffic so the
  reconnect handshake cannot deadlock behind the public queue.
- All work items A–E are backward compatible: signatures and observable behavior
  of the public API are preserved or tightened only where previously broken
  (e.g. same-tableId different-role join now rejects instead of silently creating
  a second table). Each item is independently releasable after `npm run lint` +
  the focused Jest suites pass and `npm run build` regenerates the artifacts.

## Verification and rollout notes (2026-08-02)

The library implementation is complete and repository checks are green. Remaining
work is consumer migration and production rollout of the matching Nchan image.

## Consumer-project migration guide

Apply these changes in the separate game project that uses `@tailuge/messaging`.

### 1. Simplify the table relay

The relay should delegate table lifecycle behavior to the library rather than
reimplementing transport workarounds:

| Remove from `MessagingMessageRelay` | Replacement |
|---|---|
| `pendingCallbacks` and callback registration races | Pass `onMessage` and `onBothJoined` in the initial `joinTable()` or `spectateTable()` options. |
| `pendingPublishes` and a startup flush | Call `table.publish(type, data)` immediately. The bounded library outbox waits for readiness, sends in order, and retries transient publish failures. |
| `lastProcessedTimestamp` / timestamp replay filtering | Remove it. The library suppresses reconnect buffer replays using server-generated `meta.msgId`; `meta.ts` is only event time and must not be used as message identity. |
| `msg.type !== "table:leave"` or `msg.type !== "joined"` filters | Remove them. `Table` handles `joined` and `table:leave` internally and does not pass them to the generic `onMessage` callback. Use `onOpponentLeft` and `onOpponentRejoined` for those lifecycle events. |
| `awaitBothJoined(timeout)` and its timeout fallback | Await `table.bothJoined` directly. It is a one-shot promise for the two-player handshake. |

A minimal player relay should look like:

```ts
const table = await client.joinTable<GameEvent>(tableId, userId, {
  onMessage: (message) => relay.onMessage(message),
  onBothJoined: () => relay.onBothJoined(),
});

table.onOpponentLeft(() => relay.onOpponentLeft());
table.onOpponentRejoined(() => relay.onOpponentRejoined());

// Safe immediately: joinTable() returns the session before its background
// handshake has necessarily completed.
await table.publish("BeginEvent", beginEvent);
await table.bothJoined;
```

For a spectator:

```ts
const table = await client.spectateTable<GameEvent>(tableId, userId, {
  onMessage: (message) => relay.onMessage(message),
});
```

### 2. Preserve the required listener timing

`onMessage` and `onBothJoined` are construction-time options. Supply them on the
first call that creates the table. A later `joinTable()` call for the same logical
session returns the existing `Table` and does not add or replace listeners.
Repeated/concurrent joins for the same table, user, and role are idempotent; a
same-table conflict with a different user or player/spectator role is rejected.

### 3. Handle the actual application responsibilities

- Treat `bothJoined` as initial two-player readiness, not as a prerequisite for
  sending or receiving events. It remains pending if the other player never joins;
  provide the waiting, cancel, and leave UX in the game. Messages sent before the
  second player joins are replayed within the documented Nchan retention window.
- Handle `table.publish()` rejection for a closed table or a full bounded outbox.
  A successful publish means the server accepted the HTTP request, not that the peer
  has applied the event.
- Keep a game-state snapshot or resynchronization path. The Nchan buffer is bounded
  (currently 2,000 messages / 90 seconds); a peer absent beyond that window cannot
  recover every event from replay alone.
- Keep `onOpponentLeft` and `onOpponentRejoined` handlers idempotent in the game UI.
  The library suppresses reconnect replays, but application state transitions still
  need normal lifecycle handling.
- Do not generate `meta.msgId` in the consumer. The server assigns it during metadata
  enrichment, including direct server-generated auto-leaves. Keep using `meta.ts`
  only for event timing or display.

### 4. Rollout checklist

1. Update the relay and remove the workaround state above.
2. Register table callbacks in the initial join options.
3. Publish immediately after `joinTable()` returns; do not wait for a separate
   “connected” flag or manually flush a queue.
4. Await `table.bothJoined` without an arbitrary timeout, while retaining a separate
   user/application cancel path.
5. Rebuild and deploy the matching Nchan image so `meta.msgId` and the table replay
   retention configuration are present in the deployed server.
6. Test player startup, early publish, reconnect/rejoin, explicit leave, abrupt
   disconnect, and spectator leave in the consumer project.
