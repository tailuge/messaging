# Turning off one bad actor origin

A minimal plan for blocking a single origin (e.g. `http://127.0.0.1:8200`) from
publishing to, or subscribing to, the Nchan backend — without touching the
protocol, the client, or the lobby logic.

Fork-friendly by design: an **origin blocklist**, not an allowlist. Everyone
else keeps working; one entry turns one actor off.

---

## 1. Pick the key: the exact origin string

Block the literal origin from the request's `Origin` header, host **and port**:

```
http://127.0.0.1:8200
```

Not "localhost", not loopback in general, not a country, not an IP. Exact
strings mean zero collateral damage and no maintenance of ranges.

Why this actor is a safe target: a browser page served from
`62.234.154.2x:8094` (or a `github.io` page) cannot send `Origin:
http://127.0.0.1:8200`. That origin only exists if something on the machine is
re-serving the page through a local relay on port 8200. No legitimate user of
the lobby produces it.

## 2. Enforce at two places, in this order of importance

| Location | Directive today | What a block must do |
|---|---|---|
| `/subscribe/presence/lobby` | `nchan_subscribe_request /internal/presence/sub` → `presence_sub` | reject the subscription |
| `/subscribe/table/…` | `nchan_subscribe_request /internal/table/sub` → `table_sub` | reject the subscription |
| `/publish/presence/lobby` | `js_content nchan_meta.publish` | `403` before `buildMeta` runs |
| `/publish/table/…` | `js_content nchan_meta.publish` | `403` before `buildMeta` runs |

**Subscribe first.** Egress is `subscribers × messages` plus buffer replay on
every connect, so refusing the socket saves the bytes. A publish-only block
leaves the actor holding open sockets, still receiving everyone else's traffic.

## 3. Shape of the change

One shared list, two enforcement points:

1. A `map` in `nginx.conf` from `$http_origin` to a flag, listing blocked
   origins verbatim.
2. In each of the four locations above, an early `return 403` when the flag is
   set. In the two `js_content` locations a guard in the JS handler is
   equivalent and easier to unit-test.
3. Keep the list in its own small file (`blocklist.conf`) so adding an entry is
   a one-line diff, not an edit inside the main config.

Do **not** try to do this with `deny`/`allow`: there is no `real_ip_header` /
`set_real_ip_from` configured, so `$remote_addr` is Render's edge — a `deny`
entry would ban the proxy, not the actor.

Do **not** try to do this by tightening CORS: publishes are fire-and-forget
POSTs, and `Access-Control-Allow-Origin` only stops the browser reading the
response. The request still arrives and still runs the full enrich path.

## 4. Decisions to settle before writing it

- **Missing `Origin` header.** Browsers always send one for a cross-origin
  POST and for a WebSocket handshake; `curl` does not. Recommended: allow
  missing in the first pass (so nothing of yours breaks), and rely on rate
  limits for header-less scripts. Reversing this later is a separate call.
- **Loopback as a class vs this one origin.** Blocking all loopback origins is
  tempting but would also block `docker/testnchan.sh`, the Playwright suites
  (they send `Origin: http://localhost`), `npm run example`, and possibly a
  Tauri build. Start with the exact string; if the actor rotates ports, add the
  loopback rule **only on the production instance**, gated on an env var such
  as `RENDER=true` so the local compose and the test image keep working.

## 5. Make the block actually take effect

A deploy or reload does **not** close established WebSockets. Old workers keep
serving them until the client disconnects, and
`nchan_subscriber_timeout 7200s` allows up to two hours of that.

- Add `worker_shutdown_timeout` (10s is plenty) so a reload or deploy severs
  the sockets the block is meant to cut.
- Without it, the dashboard will show the origin gone from new traffic while
  the existing sockets keep draining bytes — the block looks applied and is not.

## 6. Verify, in this order

1. `curl -X POST -H "Origin: http://127.0.0.1:8200" … /publish/presence/lobby`
   → expect `403`.
2. Same request with a good origin (`http://localhost`) → expect `200`.
3. WebSocket handshake with the blocked origin → expect rejection, not a
   stream. With a good origin → expect the normal buffered replay.
4. Dashboard: online user count drops by the expected number; the blocked
   origin stops appearing in the per-IP origins column (`ip_cache`, 24h TTL, so
   allow a day for the column to go quiet).
5. `npm run test` and `docker/testnchan.sh` still pass — this is what catches a
   loopback rule that was too broad.

Note that `/publish/...` and `/subscribe/...` are `access_log off` today, so
you have no request-level evidence of what was blocked. Turn logging back on
with the existing `if=$loggable` guard while confirming the block, then decide
whether to keep it.

## 7. Running it afterwards

- To block someone new: add one line, redeploy.
- To unblock: delete the line, redeploy.
- Keep entries with a date comment (`# 2026-10-20 127.0.0.1:8200 – local relay
  harness, 611 hits, 127.0.0.1 origin`) so a five-year-old line can be judged
  and removed.
- Expect the actor to change the origin string if they care enough. That is the
  boundary of this approach: `Origin` is client-controlled, so this is a
  hygiene filter for the honest copier, not a security control. Anything that
  survives a rotation needs rate limits or credentials, which is a separate
  plan.

## Non-goals

No change to the wire protocol, no client changes, no allowlist, no country
blocking, no IP bans, no new endpoints. One list, four early returns, and a
shutdown timeout.
