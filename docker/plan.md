
### The Clean Solution: Query Parameters

The standard pattern for Nchan presence tracking is to pass a unique identifier (like a User ID) via the connection URL query string.

#### 1. Client-Side Connection

```javascript
const userId = "user_98765";
const socket = new WebSocket(`ws://localhost:8080/subscribe/presence/lobby?uid=${userId}`);

```

#### 2. Update Nginx Configuration

Forward the query arguments to both the subscribe and unsubscribe internal locations by appending `$is_args$args`:

```nginx
    # Subscriber endpoint presence
    location = /subscribe/presence/lobby {
        ...
        nchan_subscribe_request /internal/presence/sub$is_args$args;
        nchan_unsubscribe_request /internal/presence/unsub$is_args$args; # <-- Add here
        ...
    }

    location = /internal/presence/sub {
        internal;
        proxy_pass http://127.0.0.1:8080/internal/njs/presence_sub$is_args$args; # <-- Pass to NJS proxy
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-User-Id $arg_uid; # <-- Extract directly via Nginx variable
    }

    location = /internal/presence/unsub {
        internal;
        proxy_pass http://127.0.0.1:8080/internal/njs/presence_unsub$is_args$args; # <-- Pass to NJS proxy
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-User-Id $arg_uid; # <-- Extract directly via Nginx variable
    }

```

#### 3. Read in NJS

Inside both `presence_sub` and `presence_unsub`, you can now reliably pull the identifier from the headers you mapped:

```javascript
function presence_sub(r) {
    const userId = r.headersIn['X-User-Id'];
    r.log(`User connected: ${userId}`);
    r.return(200);
}

```

This guarantees you can accurately pair every connect event with its corresponding disconnect event.