# Efficient lobby presence

Plan only — no code changes in this document. The end goal is to stop using
Nchan's buffered replay of `presence/lobby` to decide who is online, and let the
server keep that list in memory.

**Step one is deliberately tiny and has no user-facing effect.** The server
maintains the registry and exposes it *only* behind a button on the dashboard,
rendered as a simple list. The lobby keeps replaying exactly as it does today:
same `nchan.conf` retention, same client library, same `Lobby.join()` settle
logic. If the registry is wrong, the only thing that looks wrong is a debug list
on the dashboard. Only after that is trusted do the later phases switch the
lobby over.

## 1. Why the replay is the problem

`docker/nchan.conf` stores the lobby channel for late subscribers:

```
location = /internal/publish/presence/lobby {
    nchan_message_buffer_length 2000;
    nchan_message_timeout 90s;
}

location = /subscribe/presence/lobby {
    nchan_message_buffer_length 2000;
    nchan_message_timeout 90s;
    nchan_subscriber_first_message oldest;
    ...
}
```

Every presence heartbeat, join, leave, challenge and chat lands in that buffer.
Every new subscriber — a lobby page load, an arena page (which also calls
`joinLobby`), a game page, or a reconnect after a dropped WebSocket — is replayed
the whole 90-second window frame by frame. The volume is:

```
replay_bytes(join) ≈ frames in the last 90 s × average frame size
```

It scales with activity, not with the 18 users, and it spikes exactly when many
people are joining or reconnecting at once (matchmaking hours, arena start,
redirect waves). The buffer also costs Nchan 2000 retained frames in shared
memory and a fan-out copy per frame per subscriber.

The client depends on this replay twice:

- `src/lobby.ts` buffers replayed presence frames until its own join frame echoes
  back (`joinSentinelTs`), then applies them last-write-wins per user
  (`MessageDeduplicator.dedupePresence`).
- The same settle path replays and de-duplicates challenge offers, which is how
  an offer sent while the recipient was briefly disconnected is still seen.

Everything else is live already: `onUsersChange`, challenges and chat all arrive
on the open WebSocket.

## 2. Target shape

```
                      publish (unchanged path)
 lobby/game/arena  ────────────────────────────►  /publish/presence/lobby
 client                  presence frame            (njs: enrich meta, update registry)
                                                          │
                                                          ▼
                                              ┌───────────────────────────┐
                                              │ presence_live shared dict │
                                              │ u:<userId> -> full frame  │
                                              │ age = frame meta.t        │
                                              └─────┬───────────────┬─────┘
                                                    │               │
   Phase 1: dashboard button  ◄──── GET /api/online/presence        │
                                                    │               │
   Phase 2: new joiner  1. open WS /subscribe/presence/lobby ───────┘ live fan-out
                        2. publish own join
                        3. GET snapshot, apply, then buffered frames
```

The registry is written on the same publish path that already enriches and
forwards each frame, so it always reflects what subscribers would have seen. In
Phase 1 nothing reads it except the dashboard.

## 3. Delivery phases

| Phase | What changes | Client/library | Channel retention |
| --- | --- | --- | --- |
| **1 (this step)** | Registry writes in NJS, snapshot endpoint, dashboard button + simple list | untouched | unchanged (2000 / 90 s) |
| 2 | `Lobby` uses the snapshot for its initial state and on reconnect; replay still on as fallback | `src/lobby.ts`, `src/nchanclient.ts` | unchanged |
| 3 | Turn retention off now that no client depends on it | none | buffer 0 / timeout 0 |
| 4 | Delete replay code paths, decide challenge-inbox follow-up | `src/lobby.ts` | 0 |

Each phase is independently revertible:

- Phase 1 is additive. Publishing still forwards the untouched body to Nchan;
  registry work is wrapped in `try/catch` so a registry bug can never fail or
  delay a publish. Reverting means deleting the endpoint and dashboard button —
  or flipping one NJS constant.
- Phase 2 keeps replay available, so a snapshot problem falls back to today's
  behaviour.
- Phase 3 is a config-only flip.
- Phase 4 only removes dead code.

## 4. Phase 1 — server registry + dashboard list (this step)

Goal: prove the server's idea of "who is online" matches reality, with zero
change to lobby behaviour and zero new client traffic.

### 4.1 What Phase 1 does not change

Hold these fixed so the comparison is meaningful and the risk stays at zero:

- `docker/nchan.conf` presence locations keep `nchan_message_buffer_length 2000`
  and `nchan_message_timeout 90s`. Replay is untouched.
- `src/lobby.ts`, `src/nchanclient.ts`, `src/MessageDeduplicator.ts`: no change.
  No snapshot fetch, no settle change, no challenge-flow change.
- `src/client/lobby.html`, `online-panel.js`, arena/game pages: no change.
- `/api/online` keeps its current response (array of ids) and its current
  `online_users` backfill semantics; the dashboard "Online users" cell keeps
  working as it does now.
- No change to publish URLs, payload shape, or wire encoding.

The only new reader of the registry is the dashboard button.

### 4.2 Storage

Add one `js_shared_dict_zone` entry in `docker/nginx.conf` beside the existing
`online_users` zone:

```nginx
# Last presence frame per user. Value is the same compact wire JSON that was
# published (already meta-enriched), so the snapshot needs no re-encoding.
js_shared_dict_zone zone=presence_live:1M type=string timeout=10m;
```

Sizing: a compact presence frame is roughly 250–800 bytes, so 1 MB holds well
over a thousand users. It is separate from `online_users` so the dashboard's
existing count has exactly the same inputs as before. Phase 1 deliberately has
no connection counter (`presence_conns`); see 4.3 for why the heartbeat is an
adequate recovery path and 8.3 for when that might change.

Per-entry TTL already works on the pinned NJS `1.0.0` (this codebase uses
`cache.set(key, value, 86400000)` and `summary_cache.set(..., USAGE_CACHE_TTL_MS)`
today), so Phase 1 calls
`presence_live.set("u:"+userId, body, PRESENCE_TTL_MS)` with
`PRESENCE_TTL_MS = 600000`. The zone `timeout=10m` and the read-time `meta.t`
check stay as cheap belt and braces.

### 4.3 Write and delete points (`docker/nchan_meta.js`)

`publish()` already parses the payload and builds `meta` before forwarding to
`/internal/publish/presence/lobby`. Add registry maintenance there, for JSON
requests on `/publish/presence/lobby` only:

| Frame | Registry action |
| --- | --- |
| presence `join` / `heartbeat` (`m:"p"`, `t:"j"` / `t:"h"`) | `presence_live.set("u:"+userId, enrichedBody, PRESENCE_TTL_MS)` |
| presence `leave` (`t:"l"`) | `presence_live.delete("u:"+userId)` |
| challenge / chat | no registry write |
| non-JSON body | no registry write |

Details that matter:

- **Store the exact forwarded body.** `injectMetaString(reqText, meta)` produces
  the string that goes to Nchan; store that verbatim, so the snapshot returns
  byte-identical frames and needs no second schema. `src/wire.ts` decodes compact
  keys (`m/t/u/n/T/r/c`, compact `meta`) and passes canonical keys through
  unchanged, covering older publishers.
- **Extract the user id cheaply.** Only presence payloads need a parse; a small
  regex on `"u":"…"` / `"userId":"…"` (or a single `JSON.parse` of the presence
  body) is enough. Guard against a payload with no id.
- **Never let registry code affect the publish.** Wrap it in `try/catch` and log
  at warn level; the subrequest to Nchan and the returned status are unchanged.
- **Delete on leave/unsubscribe; let the heartbeat put it back.** No socket
  counting in Phase 1. `presence_sub()` keeps doing exactly what it does today
  (`online_users[uid] = "1"`) and `presence_unsub()` deletes the registry entry.
  If a second tab is still open, or a late unsubscribe races a fresh join, the
  user drops out briefly and the next heartbeat re-registers them. That is
  bounded by `Lobby.startHeartbeat()`: **3 s** after a join, reconnect or
  visibility resume, **60 s** for a long-lived tab. `Lobby.applyPresence()`
  re-adds a user on a heartbeat when it had none, so the lobby list heals too,
  not just the dashboard.
- **Known limit of the simple version.** The heartbeat is paused while a tab is
  hidden (`handleVisibilityChange` → `pauseHeartbeat`). If the surviving tab of
  a multi-tab user is hidden, the registry entry stays missing until that tab is
  shown again, while `online_users` (sockets) still lists the user. Accepted for
  Phase 1 because it is dashboard-only; decide whether it matters for Phase 2
  (8.3).
- **Auto-leave path.** `publish_auto_leave()` for presence bypasses `publish()`,
  so `presence_unsub()` must delete the registry entry itself. Keep the existing
  behaviour of publishing the leave frame to the channel.
- **Server restart.** The dicts start empty; entries repopulate on the next
  heartbeat (3 s after join, then every 60 s). The dashboard list will be short
  for up to a minute after a deploy — expected, not a fault.

Phase 1 offers no way to fabricate an entry from a subscribe alone (there is no
name or table to show). A user appears in the list once they have published
presence, which every client does on join.

### 4.4 Snapshot endpoint

Add `location = /api/online/presence` in `docker/nchan.conf`, handled by a new
NJS function (`online_presence_api`) next to the existing `online_users_api`:

```nginx
location = /api/online/presence {
    limit_req zone=api burst=10 nodelay;
    js_content nchan_meta.online_presence_api;
    include /etc/nginx/metadata_headers.conf;
    include /etc/nginx/cors.conf;
}
```

Contract (final; Phase 2 consumes the same shape, so it must not change later):

```
GET /api/online/presence
200 Content-Type: application/json
Cache-Control: no-store          (a snapshot is only valid for the instant it is read)

{
  "ts": 1760961600000,           // server time when the snapshot was built
  "ttl": 600000,                 // registry staleness threshold (ms), informational
  "users": [                     // one element per online user; compact wire frames
    { "m":"p","t":"h","u":"alice","n":"Alice","T":"table-3","r":"nineball",
      "c":1760961584123,
      "meta":{"t":1760961584200,"i":"a1b2c3","u":"Mac Chr",
              "o":"https://billiards.tailuge.workers.dev",
              "c":"GB","y":"London","v":"1.44"} },
    ...
  ]
}
```

Design rules:

- **Full details per user**, i.e. everything the published presence carried:
  `userId`, `userName`, `type`, `tableId`, `ruleType`, `arenaId`, `isSpectator`,
  `isLeaving`, `seek`, `options`, `custom`, `opponentId`, `clientTs`, and `meta`
  (`ts`, `msgId`, `ua`, `origin`, `country`, `city`, `version`). That is what the
  online panel, active tables and arena view render.
- **Drop stale entries on read**: skip `u:` values whose frame `meta.t` is older
  than `ttl`. The per-entry TTL normally removes them first; the read check is
  insurance. Normal departures are removed by leave/unsubscribe; this is the
  backstop for a process that died without either.
- **Leave `online_users` and `/api/online` alone.** The new endpoint is additive
  and unlinked. Do not document it as a public API yet.
- **Unauthenticated, same as the channel.** Presence is already public on the
  lobby channel, and `/dashboard.html` is already served publicly; keep the
  existing CORS include.
- Dashboard traffic only in this phase: one request per button click, not a poll.

Expected Phase 1 discrepancy to understand, not fix: `/api/online` is filled from
`presence_sub` and deleted on any unsubscribe, so it counts sockets, while the
registry counts published presence and is rebuilt by heartbeats. The two counts
will differ by users who subscribed but have not published yet, and briefly for
multi-tab users after one tab closes (until the surviving tab heartbeats).

### 4.5 Dashboard button and simple list

Source file is `src/client/dashboard.html` (copied to `docker/html` by
`npm run build:lit`). Add one collapsible card styled like the existing
`ip-cache-card` / `njs-logs-card`, placed after the Nchan Global card:

- Header: "Presence registry" with the usual toggle indicator.
- One button, `Load online users`, which calls
  `fetch("/api/online/presence", { cache: "no-store" })` on demand. Do **not**
  add it to `fetchStats()` and do not auto-refresh; the point is zero extra
  traffic until someone looks.
- Output: a plain list, one line per user, no table chrome:

  ```
  Alice (alice) — heartbeat — nineball @ table-3 — 8s ago — GB
  Bob (bob) — join — available — 41s ago — FR
  ```

  Show count and server `ts` above the list, and `-` until first click.
- Build rows with `textContent` / `createElement`, not `innerHTML`: usernames and
  table ids are user-controlled. The existing dashboard unit test extracts the
  `<script>` from this file (`test/dashboard-unit.spec.ts`), so keep the new code
  in a named function with a null-checked root element and no work on load; that
  keeps the existing mocks working.
- Failure path: show the HTTP status in the card, keep the previous list, log to
  console. A broken endpoint must not break the rest of the dashboard.
- The existing "Online users" cell under Nchan Global stays as the reference
  number to compare against.

### 4.6 Phase 1 verification and exit criteria

Manual (two browsers + one phone):

1. Load the lobby in two clients with different names; open the dashboard and
   click the button. Both users appear with names, rule/table state if any, and a
   fresh age.
2. Accept a challenge in one client; before the redirect, the list shows
   `tableId`; after the redirect, the game page's join re-registers them. The
   list eventually shows the table state without any lobby change.
3. Close one tab: the user disappears within a heartbeat (or immediately when
   the socket unsubscribes).
4. Open the lobby in two tabs as the same user, close one: the user may drop
   from the list and returns on the surviving tab's next heartbeat (within
   60 s, or as soon as it is made visible). This transient is accepted in
   Phase 1; note the delay you see, since Phase 2 will decide whether to add
   connection counting.

Automated:

- `docker/testnchan.sh`: publish a presence join with curl for two ids, GET the
  endpoint, assert both frames and required fields (`u`, `n`, `meta.c`,
  `meta.y`, `meta.v`); publish a leave, assert removal; assert the endpoint's
  `Cache-Control: no-store`.
- New shell assertion that the live channel still replays: open a subscriber,
  publish a frame, open a second subscriber, confirm it receives the buffered
  frame. This is the guard that Phase 1 did not change retention.
- `npm run test`: the existing suite must pass; add a
  `dashboard-unit.spec.ts` case for the new button handler (mock fetch, assert
  rows rendered and status on failure). Phase 1 changes no TypeScript, so any
  other test change is a signal something leaked out of scope.

Exit criteria:

- Dashboard list and a fresh lobby's user list agree for normal single-tab use
  (allowing the deliberate `/api/online` vs registry differences above).
- One hour of normal lobby traffic: `presence_live` entry count stays within a
  few of the lobby count and does not grow monotonically; `nginx` memory and
  `presence_publish_total` are unchanged from baseline; no new NJS errors.
- Endpoint latency stays in the single-digit milliseconds locally.
- Replay behaviour is byte-for-byte as before (the replay assertion above).
- Revert is one commit: remove the location, the dashboard card, and the
  registry calls; no client or channel config to unwind.

## 5. Phase 2 — client uses the snapshot (replay stays on)

Only start once Phase 1 has matched the lobby for a few days.

### 5.1 Join protocol in `Lobby.join()`

Order matters; no server-side cursor is needed:

1. `subscribePresence()` — open the WebSocket first and buffer any live frames
   locally. Nchan still replays the old window at this point, so the buffer is
   the same one that exists today.
2. Publish the current user's `join` presence (the existing sentinel, awaited).
3. `GET /api/online/presence` through a new
   `NchanClient.fetchPresenceSnapshot()` (`cache: "no-store"`, same
   `AbortController` timeout pattern as `publish`).
4. Apply the snapshot: replace the users map, decode each frame with
   `decodeWire`, keep `meta.ts` per user.
5. Replay the buffered frames in order, per user, applying a frame only when it
   is at least as new as the snapshot's entry for that user
   (`msg.meta.ts >= snapshotEntry.meta.ts`, or the user is absent). This covers a
   live frame published after the snapshot was built but delivered before its
   response.
6. `fireSettled()`.

Keep a feature check: on a 404 (rollback to an older server), fall through to
today's replay/sentinel settle unchanged. Keep the existing code path intact
until Phase 4.

`Lobby.settled`, `onSettled()` and `onUsersChange()` keep their semantics, so
`src/client/online-panel.js` and `src/client/tournament/arena-view.js` need no
changes.

### 5.2 Reconnect and visibility

Network reconnects keep replaying for now, so no regression if the snapshot is
skipped. Still refetch the snapshot on reconnect and on
`visibilitychange → visible`: with retention still on it is redundant, but it
exercises the path that Phase 3 depends on, and it removes a leave that replay
might have missed. One GET instead of relying on the 90 s window.

### 5.3 Parity check before Phase 3

Phase 2 is the comparison harness: after settling, derive the user list once
from the snapshot and once from the replayed frames and log a mismatch counter
(dev builds / a debug flag only). Watch it for a few days at quiet and busy
times. When it stays at zero, the snapshot is trusted and Phase 3 can follow.
`meta.v` in the stored frames also gives the adoption split, since the client
version is already in every presence publish.

## 6. Phase 3 — remove replay

Config only, once Phase 2 is settled and adopted:

```
location = /internal/publish/presence/lobby {
    nchan_message_buffer_length 0;
    nchan_message_timeout 0;
    ...
}

location = /subscribe/presence/lobby {
    nchan_message_buffer_length 0;
    nchan_message_timeout 0;
    ...
}
```

Live fan-out, the subscribe/unsubscribe hooks and
`nchan_websocket_ping_interval 20s` stay. `nchan_subscriber_first_message
oldest` becomes inert with an empty buffer and can stay.

Rollout caution: an old client bundle builds its list purely from replay. With
retention 0 it settles with an empty list and fills in as others heartbeat or
publish, i.e. up to a minute. The service worker is pass-through
(`src/client/sw.js`), so a reload always picks up the new bundle, but tabs left
open across the deploy keep the old one. Flip retention after adoption (5.3), or
accept a short, self-healing degradation for those tabs.

## 7. Phase 4 — cleanup and deferred decisions

- Remove `joinSentinelTs` / `unsettledPresenceMessages` replay handling and the
  presence half of `MessageDeduplicator` (`dedupePresence`) from `src/lobby.ts`.
  The sentinel can remain a plain join acknowledgement.
- Remove the replay-specific stats and the 90 s wording in docs/comments.
- Decide the challenge-replay replacement (see 8.1). Suggested later step: store
  the last unresolved offer per challengee in the same shared dict
  (`ch:<uid>`, TTL ~60 s) and return an optional `challenges` array in the
  snapshot. Deliberately deferred so the Phase 1 contract stays small.

## 8. Side effects of the later phases

Most of these only bite when retention goes to 0 (Phase 3); none affect Phase 1.

### 8.1 Challenges are no longer replayed

An offer sent while the recipient's tab was disconnected is lost. Live
accept/decline/cancel is unaffected, and the redirect flow (offer → accept →
`window.location` to the game) still works because both players are connected at
that moment. Options, in increasing cost:

1. Accept it; the challenger's UI already times out a missed offer.
2. Pending-offer dict plus an optional `challenges` array in the snapshot
   (section 7).
3. A full challenge inbox with per-user delivery state. Out of scope.

### 8.2 Challenge redirect (lobby → game page)

`pagehide` sends a leave, then the game page joins with `tableId`. Between those
publishes the user is legitimately absent, so a snapshot taken in that window
omits them; they reappear on the game page's join (or the next heartbeat). The
old replay masked this transient; expect a brief flicker in fresh snapshots.

### 8.3 Multi-tab and multi-connection users

Phase 1 does not count sockets, so closing one of several tabs (or an unsub
racing a fresh join) can remove the entry until the surviving connection
heartbeats — 3 s after a fresh join/resume, 60 s for a long-lived tab, or when a
hidden tab becomes visible and resumes its heartbeat. The user is not lost: the
heartbeat is an unconditional presence publish and the lobby re-adds them.
`online_users` keeps its existing socket-based behaviour, so the dashboard's old
count and the new registry list will disagree in exactly that window.

If Phase 2 parity shows this transient matters (e.g. a hidden second tab keeps a
user out of snapshots indefinitely), add the refcount then: a `presence_conns`
zone, `incr`/decr in `presence_sub`/`presence_unsub`, and delete only at zero.
That is additive to the registry and does not change the endpoint contract, which
is why the simple version ships first.

### 8.4 Hidden tabs pause heartbeats

`MessagingClient.handleVisibilityChange` pauses the heartbeat while a tab is
hidden. The registry backstop must be generous: `ttl = 10 min` keeps a
hidden-but-connected tab in snapshots for 10 minutes, after which it ages out of
new snapshots (it stays in the lists of already-connected clients, which do not
prune). Today's replay window is only 90 s, so this is not a regression, but the
online list stops being a pure function of the replay window. If exact parity
for hidden tabs matters, either slow the hidden heartbeat to every 5 minutes
instead of pausing it, or raise the TTL.

### 8.5 Ghosts after an unclean disconnect

A crashed client that never sends `leave` relies on Nchan firing the unsubscribe
hook when the WebSocket dies. `nchan_websocket_ping_interval 20s` detects a dead
socket quickly, so the TTL is a backstop, not the primary cleanup.

### 8.6 Arena and tournament pages

`src/client/tournament/arena-view.js` also calls `joinLobby`, so arena entrants
fetch a snapshot on entry once Phase 2 lands. That is one GET per entrant
instead of a replay of the 90 s window — the biggest win, since arena start is
the worst burst today.

## 9. Test and verification plan

Phase 1 is covered in 4.6. The rest:

Server (later phases, shell + curl):

- A user whose value is older than `ttl` is filtered on read (test with a short
  TTL override or a pre-seeded dict).
- Two presence sockets for one uid: closing one removes the entry; a following
  heartbeat publish restores it (asserts the recovery path, not refcounting).
- No replay after Phase 3: open a subscriber, publish N frames, open a second
  subscriber and assert it receives nothing until the next publish.

Library (Jest, `test/messagingclient.spec.ts` plus a `lobby` unit test, Phase 2+):

- Snapshot applied before settle; `onSettled` fires once; `onUsersChange` emits
  the full list.
- A live frame published after the snapshot but delivered before its response is
  applied last-write-wins, not overwritten by the snapshot.
- Snapshot failure → retry, then fall back to replay; no unhandled rejection.
- Reconnect refetches the snapshot and removes a user who left while offline.

Browser (Playwright, Phase 3):

- Two clients join and see each other; one closes the tab, the other removes them
  through the leave/unsubscribe path.
- Reconnect repopulates the list without a replay.

Traffic measurement (the acceptance test for "spike gone", after Phase 3):

- With 18 simulated clients, record `/api/stats` → `system.network.tx_bytes` and
  Nginx `bytes_sent` for a fixed window, then trigger 18 concurrent reconnects.
  Measure before and after. Expect outbound during the reconnect burst to drop to
  roughly `reconnects × snapshot_size` (single-digit KB per reconnect at 18
  users) and to stop scaling with channel activity in the previous 90 s. Confirm
  through `nchan_stats` that `presence/lobby` no longer stores frames.

## 10. Full end-state acceptance criteria

These apply after Phase 3/4, not to Phase 1:

- `presence/lobby` is configured with `nchan_message_buffer_length 0` and
  `nchan_message_timeout 0` on both publish and subscribe; a subscriber opened
  mid-conversation receives no historical frames.
- `GET /api/online/presence` returns `{ts, ttl, users[]}` where `users[]` is the
  full enriched presence frame per online user, includes every field listed in
  4.4, and is `Cache-Control: no-store`.
- A new joiner sees all online users after one snapshot request plus its own
  join, with `Lobby.settled` / `onSettled` semantics unchanged for the UI.
- Registry cleanup works on explicit leave, socket unsubscribe, and TTL; a user
  with a second presence socket is never lost, because the next heartbeat
  restores the entry (a brief gap is accepted).
- Reconnect refetches the snapshot, so offline departures are reflected.
- Measured lobby outbound bytes per join/reconnect no longer scale with the last
  90 s of channel activity.

## 11. Open questions

1. **TTL**: 10 minutes (hidden-tab friendly, slow ghost expiry) vs 90 s (parity
   with today's replay window, aggressive cleanup). Recommendation: 10 minutes,
   because unsubscribe is the real cleanup path. Needed for Phase 1's read
   filter.
2. **Pending challenges in the snapshot** (8.1 option 2) — include at Phase 3/4
   or defer indefinitely? Recommendation: defer; keep the Phase 1 contract small
   and stable.
3. **Connection counting** (8.3): revisit in Phase 2 if the heartbeat-recovery
   transient is visible to joiners. The endpoint shape does not change either
   way.
4. **Dashboard access**: `/dashboard.html` is already public and unlinked;
   the endpoint is equally public. Decide separately whether the dashboard
   should be gated — out of scope for this plan.

## 12. Non-goals

- Changing the Nchan transport, channel names or publish paths.
- Any lobby or game behaviour change in Phase 1.
- Reworking challenge delivery beyond the pending-offer question above.
- Presence in the table channels.
- Auth or privacy changes: presence is already public on the lobby channel.
- An NJS version bump. The presence work needs no new njs feature; `NJS_VERSION`
  stays at `1.0.0` and per-entry dict TTL already works there.
