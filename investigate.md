# Investigation: Forwarding userId to NJS presence_sub / presence_unsub

**Date:** June 12, 2026

## Goal

Pass the `userId` from the WebSocket connection URL (`?uid=`) through to the NJS `presence_sub` and `presence_unsub` callbacks so we can identify *which user* disconnected.

## Changes Made

### Phase 1 — Server-side (nginx + NJS)

**`docker/nchan.conf`** — three changes:

1. Forward `$is_args$args` on the `nchan_unsubscribe_request`:
   ```
   nchan_unsubscribe_request /internal/presence/unsub$is_args$args;
   ```
2. Add `$is_args$args` to `proxy_pass` + `X-User-Id` header on `/internal/presence/sub`
3. Add `$is_args$args` to `proxy_pass` + `X-User-Id` header on `/internal/presence/unsub`

**`docker/nchan_meta.js`** — two functions updated:

```javascript
function presence_sub(r) {
  const userId = r.headersIn['X-User-Id'] || 'unknown';
  logR(r, `presence_sub userId=${userId}`);
  r.return(200);
}

async function presence_unsub(r) {
  const userId = r.headersIn['X-User-Id'] || 'unknown';
  incrementStat("presence_unsubscribe_total");
  logR(r, `presence_unsub userId=${userId}`);
  r.return(204);
}
```

### Phase 2 — Client-side (library)

**`src/nchanclient.ts`** — `subscribePresence` now takes `userId`, appends `?uid=` to path:

```typescript
subscribePresence(userId: string, onMessage: (data: string) => void): Subscription {
    const path = `${PATHS.PRESENCE_SUBSCRIBE}?uid=${encodeURIComponent(userId)}`;
    return this.subscribe(path, onMessage);
}
```

**`src/lobby.ts`** — passes `this.currentUser.userId`:

```typescript
this.subscription = this.nchan.subscribePresence(this.currentUser.userId, (data) => { ... });
```

**`test/lifecycle-unit.spec.ts`** — updated mocked `subscribePresence` signature.

All 68 tests pass. Type checks clean.

## Clean Experiment

Docker was rebuilt and restarted with fresh logs. Two WebSocket connections were made:

| Connection | URL | Result |
|---|---|---|
| With uid | `ws://localhost:80/subscribe/presence/lobby?uid=acmetest` | ✅ HTTP 101 upgrade |
| Without uid | `ws://localhost:80/subscribe/presence/lobby` | ✅ HTTP 101 upgrade |

Commands used:
```bash
node -e "const ws = new WebSocket('ws://localhost:80/subscribe/presence/lobby?uid=acmetest'); ..."
node -e "const ws = new WebSocket('ws://localhost:80/subscribe/presence/lobby'); ..."
```

## Logs After Test

**Docker logs** (access.log symlinked to stdout):

```
"GET /subscribe/presence/lobby?uid=acmetest HTTP/1.1" 101 ...
"GET /subscribe/presence/lobby HTTP/1.1" 101 ...
```

**error_file.log** (NJS callbacks):

```
2026/06/12 18:36:03 [warn] js: presence_sub userId=unknown
2026/06/12 18:36:03 [warn] js: presence_unsub userId=unknown
```

**access_file.log** (internal sub/unsub requests):

```
"GET /internal/njs/presence_sub HTTP/1.0" 200
"GET /internal/njs/presence_unsub HTTP/1.0" 204
```

## Key Findings

1. **Phase 2 works perfectly.** The `?uid=carol` / `?uid=bob` / `?uid=alice` query params are visible in the WebSocket URL in the browser console (`ws://localhost/subscribe/presence/lobby?uid=carol`). Messages flow normally.

2. **Only the no-uid connection triggers NJS callbacks.** Two WebSocket connections were made, but only ONE pair of `presence_sub` / `presence_unsub` log entries appeared — from the connection WITHOUT the `?uid=` query param. The connection WITH `?uid=acmetest` silently produced no NJS callback at all.

3. **The `X-User-Id` header is always empty.** Even the one callback that did fire showed `userId=unknown`, meaning `$arg_uid` in `proxy_set_header X-User-Id $arg_uid;` resolved to empty, or the header wasn't forwarded through proxy_pass.

4. **No config rules block the request.** All presence-related location blocks use exact match (`=`), which matches path regardless of query string. No regex overlap.

## Relevant Nginx & Nchan Configuration

### Docker configuration (`docker/nchan.conf`) — subscriber presence chain

```nginx
# ── Entry point: WebSocket subscriber ──
location = /subscribe/presence/lobby {
    access_log /var/log/nginx/access.log main;
    nchan_subscriber;
    nchan_channel_id "presence/lobby";
    nchan_message_buffer_length 2000;
    nchan_message_timeout 90s;
    nchan_subscriber_first_message oldest;
    nchan_subscriber_timeout 7200s;
    nchan_websocket_ping_interval 20s;
    nchan_subscribe_request /internal/presence/sub$is_args$args;       # sub callback URI
    nchan_unsubscribe_request /internal/presence/unsub$is_args$args;    # unsub callback URI

    include /etc/nginx/metadata_headers.conf;
    include /etc/nginx/cors.conf;
}

# ── Subscribe callback: internal redirect → proxy to NJS ──
location = /internal/presence/sub {
    internal;
    access_log /var/log/nginx/access_file.log main;
    proxy_pass http://127.0.0.1:8080/internal/njs/presence_sub$is_args$args;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Nchan-Channel-Id $nchan_channel_id;
    proxy_set_header X-Nchan-Subscriber-Type $nchan_subscriber_type;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-User-Id $arg_uid;                                # ← extracts uid from query
}

# ── NJS handler for subscribe ──
location = /internal/njs/presence_sub {
    js_content nchan_meta.presence_sub;
}

# ── Unsubscribe callback: internal redirect → proxy to NJS ──
location = /internal/presence/unsub {
    internal;
    proxy_pass http://127.0.0.1:8080/internal/njs/presence_unsub$is_args$args;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Nchan-Channel-Id $nchan_channel_id;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-User-Id $arg_uid;                                # ← extracts uid from query
}

# ── NJS handler for unsubscribe ──
location = /internal/njs/presence_unsub {
    js_content nchan_meta.presence_unsub;
}
```

### NJS handlers (`docker/nchan_meta.js`)

```javascript
function logR(r, tag) {
  const parts = Object.keys(r).map((k) => {
    try {
      return `${k}=${r[k]}`;
    } catch (e) {
      return `${k}=<unstringifiable: ${e.message}>`;
    }
  });
  ngx.log(ngx.WARN, `${tag} r: ${parts.join(" ")}`);
  try {
    ngx.log(ngx.WARN, `${tag} HEADERS: in=${JSON.stringify(r.headersIn)} out=${JSON.stringify(r.headersOut)}`);
  } catch (e) {
    ngx.log(ngx.WARN, `${tag} HEADERS: <unstringifiable: ${e.message}>`);
  }
}

function presence_sub(r) {
  try {
    const userId = r.headersIn['X-User-Id'] || 'unknown';
    logR(r, `presence_sub userId=${userId}`);
    r.return(200);
  } catch (e) {
    r.error(`presence_sub error: ${e.message}`);
    r.return(500);
  }
}

async function presence_unsub(r) {
  try {
    const userId = r.headersIn['X-User-Id'] || 'unknown';
    incrementStat("presence_unsubscribe_total");
    incrementStat("presence_unsubscribe_websocket_total");
    logR(r, `presence_unsub userId=${userId}`);
    r.return(204);
  } catch (e) {
    r.error(`presence_unsub error: ${e.message}`);
    r.return(500);
  }
}
```

### Nginx main config — shared dicts & log paths (`docker/nginx.conf`)

```nginx
js_shared_dict_zone zone=sub_info:1M type=string timeout=1d;
js_shared_dict_zone zone=sub_to_user:1M type=string timeout=1d;
js_shared_dict_zone zone=user_counts:1M type=string timeout=1d;

# Log destinations
access_log  /var/log/nginx/access.log  main if=$loggable;      # symlinked → /dev/stdout
access_log  /var/log/nginx/access_file.log  main if=$loggable;  # file (internal sub/unsub)
error_log   /var/log/nginx/error.log info;                      # symlinked → /dev/stderr
error_log   /var/log/nginx/error_file.log info;                 # file (NJS ngx.log output)
error_log   /var/log/nginx/njs_error.log info;                  # file
```

### Request flow

```
Browser WebSocket
  │
  ├─ ws://localhost:80/subscribe/presence/lobby?uid=bob
  │     │
  │     ├─ nchan_subscriber → nchan_subscribe_request → /internal/presence/sub?uid=bob
  │     │     │
  │     │     └─ proxy_pass → http://127.0.0.1:8080/internal/njs/presence_sub?uid=bob
  │     │           │
  │     │           └─ js_content nchan_meta.presence_sub
  │     │                 expects X-User-Id header ← set via proxy_set_header X-User-Id $arg_uid
  │     │
  │     └─ WebSocket closes → nchan_unsubscribe_request → /internal/presence/unsub?uid=bob
  │           │
  │           └─ proxy_pass → http://127.0.0.1:8080/internal/njs/presence_unsub?uid=bob
  │                 │
  │                 └─ js_content nchan_meta.presence_unsub
  │                       expects X-User-Id header ← set via proxy_set_header X-User-Id $arg_uid
  │
  └─ Problem: subrequest to /internal/presence/sub?uid=bob never reaches NJS
       (no log entry in error_file.log for this connection at all)
```

## Theories

- **Subrequest fails silently with query args.** `nchan_subscribe_request /internal/presence/sub$is_args$args` may not correctly create the internal subrequest when `$args` is non-empty. The subrequest with no args works; the one with `?uid=...` vanishes.

- **`$arg_uid` not populated in internal subrequest context.** Even if the subrequest fires, `$arg_uid` may not be set for subrequests created by nchan's `nchan_subscribe_request` directive.

- **`logR` may be crashing.** `Object.keys(r)` on an NJS request object could throw, but the outer `try/catch` should log via `r.error()`. No such error appears.

## Next Steps

- Try using a `map` directive to extract `uid` from `$args` instead of relying on `$arg_uid`
- Add direct `ngx.log` calls (bypass `logR`) to verify the callback fires
- Test whether nchan's subscribe_request handles `$is_args$args` correctly by checking access logs at the `/internal/presence/sub` level


---------

The issue you are facing stems from how Nchan handles internal authentication/callback subrequests (`nchan_subscribe_request` and `nchan_unsubscribe_request`) combined with strict location matching.

Here is why your setup is breaking and the exact path forward to resolve it.

---

## The Root Causes

### 1. Location Matching Breakage (`location = /internal/presence/sub`)

You configured the internal endpoints using exact match rules:

```nginx
location = /internal/presence/sub { ... }

```

When a connection has no arguments, Nchan requests `/internal/presence/sub`, which matches exactly.
When a connection has a query string (e.g., `?uid=acmetest`), Nchan requests `/internal/presence/sub?uid=acmetest`. **Exact match (`=`) strings do not ignore query parameters during Nginx evaluation.** Because the URI has arguments appended directly to the path mapping in this context, the exact match fails, returning an internal 404 that Nchan swallows silently.

### 2. `$arg_uid` Context Stripping in Unsubscribe

`nchan_unsubscribe_request` fires *after* the client has disconnected. At this stage, the original HTTP request context—including the URL arguments (`$args`)—is already destroyed. Appending `$is_args$args` to the unsubscribe directive evaluates to empty variables.

---

## The Solution: A Resilient Path Forward

To fix both issues, you need to use prefix matching for your internal routes, extract the tracking identifier when the connection *first opens*, and leverage Nchan's native header forwarding features to track the ID through the lifecycle.

### Step 1: Update Nginx Configuration

Modify your `docker/nchan.conf` file to change the location match types and utilize `$request_uri` (via a regular expression map) to reliably extract the UID on connection initialization.

```nginx
# 1. Safely extract UID from the raw request URI (works everywhere)
map $request_uri $extracted_uid {
    default                    "unknown";
    "~[?&]uid=(?<captured_uid>[^&]+)" $captured_uid;
}

# ── Entry point: WebSocket subscriber ──
location = /subscribe/presence/lobby {
    access_log /var/log/nginx/access.log main;
    nchan_subscriber;
    nchan_channel_id "presence/lobby";
    
    # ... your other nchan settings ...

    # Simplify hooks: Nchan passes variables into these targets automatically
    nchan_subscribe_request /internal/presence/sub;
    nchan_unsubscribe_request /internal/presence/unsub;

    include /etc/nginx/metadata_headers.conf;
    include /etc/nginx/cors.conf;
}

# ── Subscribe callback (Changed '=' to prefix match '^~') ──
location ^~ /internal/presence/sub {
    internal;
    access_log /var/log/nginx/access_file.log main;
    
    proxy_pass http://127.0.0.1:8080/internal/njs/presence_sub;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Nchan-Channel-Id $nchan_channel_id;
    proxy_set_header X-User-Id $extracted_uid; 
}

# ── Unsubscribe callback (Changed '=' to prefix match '^~') ──
location ^~ /internal/presence/unsub {
    internal;
    
    proxy_pass http://127.0.0.1:8080/internal/njs/presence_unsub;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Nchan-Channel-Id $nchan_channel_id;
    
    # Nchan natively forwards headers returned from the subscribe hook response
    # to the unsubscribe hook via X-Nchan-Orig-Header-<name>
    proxy_set_header X-User-Id $http_x_nchan_orig_header_x_user_id;
}

# ── NJS Handlers ──
location ^~ /internal/njs/presence_sub {
    js_content nchan_meta.presence_sub;
}

location ^~ /internal/njs/presence_unsub {
    js_content nchan_meta.presence_unsub;
}

```

### Step 2: Tie the Lifecycle together in NJS

When `presence_sub` returns a `200 OK`, any custom header you send back in that response is cached by Nchan for the lifetime of that session. When the client disconnects, Nchan attaches those original headers to the unsubscribe request, prefixed with `X-Nchan-Orig-Header-`.

Update your `presence_sub` function in `docker/nchan_meta.js` to echo back the `X-User-Id` header:

```javascript
function presence_sub(r) {
  try {
    const userId = r.headersIn['X-User-Id'] || 'unknown';
    logR(r, `presence_sub userId=${userId}`);
    
    // Explicitly send the header back so Nchan caches it for unsubscribe tracking
    r.headersOut['X-User-Id'] = userId;
    r.return(200);
  } catch (e) {
    r.error(`presence_sub error: ${e.message}`);
    r.return(500);
  }
}

```

No changes are required for `presence_unsub` or your TypeScript implementation; the `X-User-Id` header will now appear seamlessly in both hooks.