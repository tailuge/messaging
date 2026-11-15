# Simplified presence: state changes on the channel, heartbeats over HTTP

Status: plan, nothing implemented.

## 1. Target architecture

Today every presence beat is a **publish**, so the server pays fan-out for a frame that
carries no information: ~620 publishes/h × ~110 B × 13 subscribers ≈ 1.9 MB/h of egress,
about half of everything the container sends.

Proposed split:

```
              join / leave / state change              (rare, meaningful)
  client ────────────────────────────────────────────▶ /publish/presence/lobby ──▶ channel ──▶ peers
     │
     └─ every 120 s: full compact state ─────────────▶ PUT /api/presence/heartbeat
                                                       └─▶ presence_live dict (TTL refresh)
                                                       └─▶ diff vs last state
                                                             └─▶ channel, ONLY if changed
```

The channel becomes a **state-transition log**: it carries only join, leave and genuine
state changes. Liveness becomes an HTTP concern that never touches the channel. The beat
body is ingress (unbilled on Render) and buys two repair properties for free: a state
frame lost in transit is re-sent by the next beat, and an idle tab costs one small request
instead of a fan-out.

## 2. Baseline (measured, one production hour, pre-change)

| metric | value |
| --- | --- |
| presence.in | 68.6 KB/h (~620 publishes × ~110 B) |
| presence.out | 1,911 KB/h ≈ 51% of hourly egress |
| subscribers | 13 (28 average earlier, so fan-out is traffic-dependent) |
| egress per beat today | 13 × 110 B fan-out + 282 B publish response ≈ 1.7 KB |
| egress per beat after | ~300 B (204 + metadata/CORS headers, empty body) |

At ~30 beats/h/tab that is ~50 KB/h/tab today vs ~9 KB/h/tab after, and the win grows
with subscriber count while the new cost stays flat. Expected: 1.9 MB/h → roughly
0.6–0.9 MB/h, the remainder being challenges, joins and real changes.

## 3. Protocol

### 3.1 Heartbeat (new)

```
PUT /api/presence/heartbeat
{"m":"p","t":"h","u":"<userId>","n":"Name","T":"table-1","A":"arena-3","r":"nineball","s":{...},"o":{...}}
→ 204, no body
```

Same compact keys as a publish frame (`src/wire.ts`), minus `meta` — the server stamps it.
Body ≈ 110 B, so the beat is a state upload, not a bare ping. Consequences:

- The server can diff and publish on change, so a frame lost in transit heals at the next
  beat without any client-side retry logic.
- The stored snapshot keeps fresh `meta` for late joiners (`/api/online/presence`).
- `updatePresence()` still publishes immediately for latency: a table change must appear
  in <100 ms, not within 120 s. The beat is the repair path, not the primary one.

### 3.2 Registry entry grows a field

`presence_live` values become `{f: firstSeen, l: lastHeartbeatMs, k: fingerprint, b: body}`
where `k` is the projection of the seven meaningful fields already compared by
`hasMeaningfulChange` (`src/lobby.ts:569`): `userName`, `tableId`, `arenaId`, `ruleType`,
`opponentId`, `seek`, `options`.

Cost: ~50 B/user. The zone is `128K` sized for ~240 users at 300–500 B (`docker/nginx.conf:134`);
that drops to ~180 users. Either accept it or raise to 192K and update the comment.

### 3.3 Leave is unchanged

`leave` stays on the channel (explicit `Lobby.leave()` on unload, and the `presence_unsub`
auto-leave at `docker/nchan_meta.js:827` which fires when the WebSocket closes). Both are
the fast path and must keep working: they are the only thing that removes a user from
*peers'* maps within seconds.

## 4. Leavers who never publish: the reaper

`applyPresence` has no time-based pruning (`src/lobby.ts:472`): a user disappears from
another client's list only when a `leave` frame arrives or a snapshot is re-fetched. So a
half-open socket — phone asleep, tab killed by the OS, laptop lid shut, no FIN — leaves a
ghost that can be challenged and never answers. That gap exists today; this plan closes it.

Add a periodic sweep in `docker/nchan_meta.js`:

```nginx
# docker/nginx.conf, http block next to js_import
js_periodic nchan_meta.presence_reaper interval=60s jitter=5s;
```

- Requires nginx ≥ 1.25.2 + njs ≥ 0.8; the image builds 1.30.6 and njs 1.0.2 (`docker/Dockerfile`), so it is available.
- For each `u:*` entry whose `l` is older than `PRESENCE_EXPIRY_MS`, delete it and publish
  `{"m":"p","t":"l","u":<id>,"meta":{...}}` through the same internal publisher that
  `publish_auto_leave` (`docker/nchan_meta.js:764`) already uses.
- `js_periodic` runs in every worker (`worker_processes 2`). Guard with a `last_reap` key
  in `system_stats` and skip when a sibling worker just ran; a duplicate `leave` is
  harmless anyway (idempotent delete, peers ignore an unknown user).
- It has no request context, so it cannot `r.subrequest`. Either `ngx.fetch` an
  `allow 127.0.0.1; deny all;` location whose `js_content` does the subrequest, or POST
  the public `/publish/presence/lobby` and let `publish()` handle it (which also keeps the
  byte/counter accounting honest).

Timing: heartbeat 120 s, `PRESENCE_EXPIRY_MS` 300 s (tolerates two missed beats and
background-tab throttling), reaper 60 s → a ghost lingers 5–6 min at worst, normally the
`presence_unsub` path removes it in seconds. A 60 s heartbeat with a 150 s expiry is the
fresher alternative at 2× the request count.

Note the coupling: `PRESENCE_TTL_MS` (130 s today) and the 120 s interval have only 10 s of
margin. Any change to one must move the other, and the reaper's expiry is now a third knob.

### 4.1 Known limitation to accept

A client whose WebSocket is dead but whose HTTP beats still succeed stays "online" and
unreachable for challenges. Today the same socket would also stop delivering its beats, so
this is not a regression, and the reaper only fires when beats stop.

## 5. Server changes by file

| file | change |
| --- | --- |
| `docker/nchan_meta.js` | extract `touchPresence(userId, payload, meta)` from `updatePresenceRegistry` (~345) so the beat and the publish share one writer; add `presenceHeartbeat(r)` (validate `u`, 400 on missing, stamp `meta`, diff `k`, publish on change, `recordPresenceCount()`); add `presence_reaper()`; publish only on change inside `publish()` for `t:"h"` frames from old clients; counters `presence_heartbeat_total`, `presence_reaped_total`, `presence_suppressed_total` added to the list at line ~1181 so the win is visible in `/api/stats`; add `/api/presence/heartbeat` to `API_SLUGS` (~553) for byte accounting |
| `docker/nchan.conf` | `location = /api/presence/heartbeat { limit_req zone=api burst=20 nodelay; js_content nchan_meta.presenceHeartbeat; ... }` — the exact match wins over the `/api/` prefix (line 233); reaper's loopback-only location if that route is used; PUT must be allowed through `docker/cors.conf` |
| `docker/nginx.conf` | `js_periodic nchan_meta.presence_reaper interval=60s;` in the http block; `presence_live` size/comment if the fingerprint does not fit |
| `docker/html/*` | rebuild only (`npm run build:all` bumps `CLIENTVERSION`) |

`publish()` keeps doing exactly what it does for join/leave/state-change frames: enrich,
registry, counters, forward. The only new branch is the suppression of unchanged
heartbeats, which is what protects peers during the old-client window.

## 6. Client / library changes

- `src/nchanclient.ts`: `touchPresence(userId, payload)` — a `fetch` PUT to
  `/api/presence/heartbeat` on the same `baseUrl`, modelled on `fetchPresenceSnapshot` (~179).
- `src/lobby.ts`: `startHeartbeat()` (~196) calls `touchPresence` instead of
  `syncPresence({type:"heartbeat"})`; `syncPresence()` keeps its `presenceMessageCount`
  cap (self-leave after ~60 beats) so an abandoned tab still removes itself; on a
  non-`ok` response, fall back to publishing once (covers a server without the route).
- `src/client/topbar.js`, `src/client/tournament/arena-view.js`: no change. They already
  call `updatePresence` / `syncPresence`, which still publish.
- Optional hardening: `updatePresence()` skips the publish when `hasMeaningfulChange` is
  false for the keys in §3.2, so repeated identical calls cost nothing.

## 7. Rollout

1. **Server first.** It must accept both shapes: old tabs keep publishing heartbeat frames
   (suppressed when unchanged, so they already gain most of the saving), new tabs use the
   endpoint. No client-version gate needed.
2. **Library + bundle.** `npm run build:all` bumps `CLIENTVERSION`; the lobby is served from
   this container, so the switch is immediate for new page loads.
3. **Old clients in the field** (game pages importing `tailuge/billiards` from npm) keep
   publishing heartbeats. They are suppressed server-side, so they cost ingress and CPU,
   not egress. Supported indefinitely; no forced migration.

## 8. Risks

| risk | mitigation |
| --- | --- |
| Reaper kills a live user (frozen tab, throttled timer) → leave/join churn | expiry 300 s vs 120 s beat; `visibilitychange` already pauses/resumes; churn is one frame pair |
| `js_periodic` runs twice (2 workers) | `last_reap` guard; duplicate leaves are benign |
| Ghost ballots linger up to ~6 min | fast path (WS unsub) unchanged; tune by shortening the interval if the lobby gets busier |
| Fingerprint drift between server and client definitions of "meaningful" | one shared list, documented in `MESSAGING_SPEC.md`; server-side list is authoritative for suppression |
| `presence_live` full → users silently missing | size the zone for the extra field; already the one zone whose exhaustion is user-visible |
| Everyone's `meta.ts` in a peer's view is frozen at their last state change | harmless: nothing in the UI reads presence `ts`; snapshots stay fresh |
| Heartbeats no longer prove the WebSocket works | pre-existing; a dead socket already means no challenges arrive |

## 9. Tests

- `docker/testnchan.sh`: heartbeat PUT refreshes the snapshot without publishing
  (subscribe, beat twice, expect nothing); changed state in a beat publishes exactly one
  frame; unknown `u` → 400; reaper (interval shortened for a test build, or call the
  function through a test-only route) publishes a leave and drops the entry; unchanged
  published `t:"h"` frames increment `presence_suppressed_total` and do not fan out.
- `test/*.spec.ts`: `Lobby` heartbeat uses `touchPresence` and falls back to publish on
  failure; the 60-frame self-leave still fires.
- `docker/autoleave-check.mjs` must still pass unchanged — it is the fast-path regression
  guard.
- Review `/api/net/history` before/after for an hour and compare `presence.out` and
  `presence.in`; that is the only honest measurement of the saving.

## 10. Phases

1. Counters + suppression of unchanged `t:"h"` frames in `publish()`. Ships alone, saves
   most of the fan-out for old clients, proves the split with `presence_suppressed_total`.
2. `PUT /api/presence/heartbeat` + library switch. Removes the channel traffic for beats.
3. Reaper + expiry field. Closes the leaver hole.
4. Optional: client-side dedupe in `updatePresence()`, and a snapshot refresh on
   `visibilitychange` so peers' maps self-heal without a reconnect.

## 11. Open questions

- Heartbeat interval: keep 120 s (no extra requests) or drop to 60 s (ghosts expire in
  ~2–3 min instead of 5–6, doubles the beat count to ~0.2 r/s for 13 users)?
- Should the reaper publish through the public publish route (counts bytes, no new
  location) or a loopback-only one (cleaner, one more location)?
- Do we want peers to poll `/api/online/presence` periodically as a last-resort repair?
  It is 8–20 KB per call and would replace the need for a perfectly reliable leave path.
- Is a `t:"l"` leave from an old client for a user who has already rejoined on a new
  connection (the `AUTO_LEAVE_REJOIN_GRACE_MS` case in `src/lobby.ts`) still correctly
  ignored once beats no longer refresh the frame's `meta.ts`?
