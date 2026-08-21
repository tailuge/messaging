# Usage Tracking API (Docker Port)

Spec for porting the usage endpoint from the scoreboard Vercel app (`scoreboard/src/pages/api/usage/[metric].ts` + `src/services/usageservice.ts`) to this project's Nginx/NJS Docker image, so counts are recorded locally instead of hitting `scoreboard-tailuge.vercel.app`.

## Motivation

- The client (`src/client/logusage.js`) currently fire-and-forgets a `PUT` to the Vercel app.
- Server-side counting via `/api/summary` undercounts lobby visits because of CDN caching (`s-maxage=120`). See discussion in repo history.
- This Docker image already has proven outbound connectivity from NJS (`ngx.fetch` in `docker/nchan_meta.js:132`) and Upstash credentials configured via ENV on render.com.

## Storage Model (unchanged, shared with scoreboard)

Data lives in Upstash Redis (same instance backing Vercel KV), so both apps read/write the same counters and the existing `usage.html` dashboard keeps working:

| Item | Value |
|---|---|
| Structure | Sorted set per metric |
| Key | `<metric>Usage` (e.g. `lobbyUsage`, `createTableUsage`) |
| Member | `{"date":"YYYY-MM-DD"}` (UTC day of the event) |
| Score | Running count for that day |

- Increment: `ZINCRBY <key> 1 <member>` — single roundtrip, creates the member if absent.
- Read all: `ZRANGE <key> 0 -1 WITHSCORES`.

## Environment

Already declared in `docker/nginx.conf:5-7` (NJS requires `env` declarations to see variables):

```
UPSTASH_REDIS_REST_URL    # e.g. https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN  # Bearer token
```

Access from NJS via `process.env`.

## Endpoints

Routed through the existing handler at `location /api/` (`docker/nchan.conf:165`, CORS headers already included) by extending `docker/api.njs`.

### `PUT /api/usage/{metric}`

Records one occurrence of `metric` today.

1. Validate metric against `^[a-zA-Z0-9_-]+$` → else `400 {"error":"Invalid metric name"}`.
2. Compute UTC day: `new Date().toISOString().split("T")[0]`.
3. Call Upstash REST:

```
POST {UPSTASH_REDIS_REST_URL}/zincrby/{metric}Usage/1/{encodeURIComponent('{"date":"YYYY-MM-DD"}')}
Authorization: Bearer {UPSTASH_REDIS_REST_TOKEN}
```

4. Respond `200 {"status":"success","message":"usage recorded","key":metric,"ts":<ms>}`.

Errors from Upstash → `502 {"error":"Upstream error", ...}`; never block longer than ~5s (`ngx.fetch` rejects on its own; wrap with a timeout signal like the existing publish code).

### `GET /api/usage/{metric}`

Returns all daily counts.

1. Same validation.
2. Call Upstash REST:

```
POST {UPSTASH_REDIS_REST_URL}/zrange/{metric}Usage/0/-1/withscores
Authorization: Bearer {UPSTASH_REDIS_REST_TOKEN}
```

3. Respond `200` with the raw result — an array alternating member/score:
   `[["{\"date\":\"2026-08-21\"}", "42"], ...]`

This mirrors what Vercel KV's `zrange(..., { withScores: true })` returns, so existing readers keep working. Optionally decode members to `{date, count}` pairs as a follow-up — coordinate with consumers first.

Unknown metric (empty sorted set) returns `[]`, not an error — matches scoreboard behavior.

### Unsupported methods

Anything except `GET`/`PUT` on `/api/usage/*` → `405`. Other `/api/*` paths keep the existing `404` router fallback.

## Client Change (follow-up)

Point `src/client/logusage.js` at this deployment (relative URL when hosted here, absolute otherwise) so counts no longer depend on the Vercel app. Keep skipping localhost.

The Render free tier can be slow to wake/respond, so the client `PUT` should use a ~10s timeout:

```js
fetch(url, { method: "PUT", mode: "cors", signal: AbortSignal.timeout(10_000) })
```

Failure handling stays fire-and-forget and **noiseless**: no unhandled rejections, no user-visible toasts; at most a single `console.error` (consider dropping even that in production — analytics must never create console noise for players). Never await the call in any caller path. Until then, both endpoints can run side-by-side; counters are shared so double-counting is only a risk if both server-side summary tracking and client PUTs fire for the same event — audit callers before enabling both.

## Testing

Manual verification once Docker is up:

```bash
./docker/testnchan.sh          # existing assertions must still pass

curl -X PUT https://<host>/api/usage/lobby
curl -X PUT https://<host>/api/usage/lobby
curl https://<host>/api/usage/lobby
# expect two increments for today's date; compare with
curl https://scoreboard-tailuge.vercel.app/api/usage/lobby
curl -X PUT https://<host>/api/usage/bad~name!   # expect 400
```

Also verify cross-compatibility: an increment made here must appear in the scoreboard's usage dashboard and vice versa.
