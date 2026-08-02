# Table Messaging Improvements Plan

## Purpose

Remove connection-lifecycle work from consumer wrappers and make table messaging
reliable at startup. The external game client (`MessagingMessageRelay`) currently
compensates for library gaps with `pendingCallbacks`, `pendingPublishes`,
`lastProcessedTimestamp` dedup, a `table:leave` filter, and an
`awaitBothJoined(8000)` timeout. After this plan, the relay collapses to a thin
pass-through and "impossible to send a message that would not be received" holds
within the documented buffer window.

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
| `pendingPublishes` + flush after connect — "the WebSocket is live before this.table is assigned" | `joinTable()` resolves late (subscription ready + `joined` publish + lobby `updatePresence`), so there is a window where the client can receive but cannot publish — this drops the `WatchEvent` reply to the opponent's `BeginEvent` at startup |
| `lastProcessedTimestamp` dedup | On reconnect Nchan replays the channel buffer from `oldest` and the library re-delivers old messages to the app |
| `msg.type !== "table:leave"` filter | System messages (`table:leave`, `joined`) leak through `onMessage` |
| `awaitBothJoined(8000)` timeout wrapper | `table.bothJoined` can hang when the opponent's `joined` is lost to a failed publish or server restart — fixed by the outbox retry (B) and the reconnect `joined` re-announce (C), so the app can just await it |

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
3. **Keep client-published `joined`** — no NJS/Nginx change. Leave must be
   server-side (`table_unsub` → `table:leave`) because JS may not run on page
   shutdown; join always has JS running, so a client-published `joined` routed
   through the outbox (retry) and re-published on reconnect is as reliable as a
   server `table:join` hook, without coupling library guarantees to a Docker
   redeploy.
4. **Failure-driven retry, no disconnect state machine.** Publishes are separate
   HTTP POSTs that keep working during a local reconnect gap (the server buffers
   them; the peer receives them live or via replay). The only real failure is the
   server being down, handled by retry-on-failure with backoff. Therefore no
   `onDisconnect` transport lifecycle is needed; `onReconnect` already exists for
   the one reconnect action we need.

## Work items

### A. Idempotent join + single creation path

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

### B. One bounded outbox in `Table.publish()`

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

### C. Reconnect re-announces `joined`

- Wire the table subscription's `onReconnect` (the Lobby already does this; `Table`
  ignores it today): re-publish a fresh internal `joined` for the replacement
  connection (control path) and flush the outbox.
- Keep the same `Table` object and listeners across reconnect.
- Existing opponent rejoin detection continues to observe the new `joined`.
- Fixes the "server restart → dead table" hang and makes rejoin detection work
  without an explicit re-join.

Tests: reconnect republishes `joined` exactly once; the peer receives the new
handshake after seeing `table:leave`; messages published during the reconnect gap
are not lost (delivered via buffer replay).

### D. Internal replay dedup

- Track the highest `meta.ts` seen (or a per-sender sequence number) and skip
  replayed messages that are older on reconnect, so the app never sees duplicates.
- This is the relay's `lastProcessedTimestamp` logic moved into the library.

Tests: reconnect replay does not re-deliver already-processed messages; new
messages after reconnect are delivered normally; ordering of genuinely new
messages is preserved.

### E. Keep `bothJoined` simple — no timeout, no message-based inference

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
  message evicted. Mitigation: state-snapshot resync once `bothJoined` resolves
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

- Reconnecting table sockets republish `joined` exactly once per replacement
  connection.
- Repeated and concurrent `Table.join()` / `joinTable()` calls do not create
  duplicate subscriptions or handshakes.
- Public outbound messages are queued, retried, and ordered by one bounded outbox,
  with deterministic Promise settlement; explicit leave rejects/clears them.
- Reconnect replays are deduplicated internally (no duplicate delivery to the app).
- `bothJoined` cannot hang: it resolves when both players' `joined` handshakes are
  seen, and those handshakes are made reliable by the outbox retry (B) and the
  reconnect re-announce (C).
- Existing early-registration, both-joined, slow-party, spectator, and rejoin
  tests remain green.
- Acceptance driver: the external `MessagingMessageRelay` no longer needs
  `pendingPublishes`, `pendingCallbacks`, `lastProcessedTimestamp`,
  `awaitBothJoined`, or the `table:leave` filter.
- Typecheck/lint passes without new errors.

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
