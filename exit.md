# Table Auto-Leave Implementation Plan

Currently, the server automatically broadcasts a "leave" message when a user disconnects from the **lobby** channel. This is achieved via Nchan's `nchan_unsubscribe_request` hook. However, this functionality is **not** yet implemented for **table** channels.

## 1. Client-Side: Passing User ID to Table Subscriptions

To identify which user is leaving a table, the server needs the `userId`. We should update `NchanClient` to append the `uid` query parameter to table subscription URLs.

### Changes in `src/nchanclient.ts`:
Modify `subscribeTable` to accept `userId`:
```typescript
subscribeTable(tableId: string, userId: string, onMessage: (data: string) => void): Subscription {
  const path = `${PATHS.TABLE_SUBSCRIBE(tableId)}?uid=${encodeURIComponent(userId)}`;
  return this.subscribe(path, onMessage);
}
```

### Changes in `src/table.ts`:
Pass `this.userId` when calling `subscribeTable`:
```typescript
this.subscription = this.nchan.subscribeTable(this.tableId, this.userId, (data) => {
  this.handleIncomingMessage(data);
});
```

---

## 2. Server-Side: Nchan Configuration

We need to add the unsubscription hook to the table subscription location and define internal routes to handle it.

### Changes in `docker/nchan.conf`:
1.  **Update Table Subscriber Location**:
    ```nginx
    location ~ ^/subscribe/table/(?<tableId>[\w-]+)$ {
        # ... existing config ...
        nchan_unsubscribe_request /internal/table/unsub$is_args$args;
        # ...
    }
    ```

2.  **Add Internal Table Unsub Locations**:
    ```nginx
    location ^~ /internal/table/unsub {
        internal;
        proxy_pass http://127.0.0.1:8080/internal/njs/table_unsub$is_args$args;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Nchan-Channel-Id $nchan_channel_id;
        proxy_set_header X-User-Id $arg_uid;
    }

    location ^~ /internal/njs/table_unsub {
        js_content nchan_meta.table_unsub;
    }
    ```

---

## 3. Server-Side: NJS Logic

We need a new function in `nchan_meta.js` to handle the table unsubscription event and publish the `table:leave` message.

### Changes in `docker/nchan_meta.js`:
```javascript
async function table_unsub(r) {
  try {
    const userId = r.headersIn['X-User-Id'] || 'unknown';
    const tableId = r.headersIn['X-Nchan-Channel-Id'];

    if (userId !== 'unknown' && tableId) {
      const body = JSON.stringify({
        type: "table:leave",
        senderId: userId,
        data: {},
        meta: {
          ts: Date.now(),
          ua: "nchan-auto-table-leave",
          origin: "internal",
        },
      });

      await r.subrequest(`/internal/publish/table/${tableId}`, {
        method: "POST",
        body: body,
      });
    }

    r.return(204);
  } catch (e) {
    r.error(`table_unsub error: ${e.message}`);
    r.return(500);
  }
}
```

---

## 4. Considerations for Multi-Tab Scenarios

Currently, every time a WebSocket connection is closed, Nchan triggers the `unsubscribe` request. If a user has two tabs open for the same table and closes one, a "leave" message will be broadcast even though they are still present in the other tab.

### Proposed Solution: Connection Counting
Use a NJS shared dictionary (`js_shared_dict_zone`) to track the number of active connections per `userId` (and potentially per `tableId`).

1.  **On Subscribe (`presence_sub` / `table_sub`)**: Increment a counter for `userId` (or `userId:tableId`).
2.  **On Unsubscribe (`presence_unsub` / `table_unsub`)**: Decrement the counter. Only publish the "leave" message if the counter reaches zero.

**Example for Table Counting:**
```javascript
// In nchan_meta.js
function table_sub(r) {
  const key = `${r.headersIn['X-User-Id']}:${r.headersIn['X-Nchan-Channel-Id']}`;
  // Increment counter in a shared dict...
  r.return(200);
}

async function table_unsub(r) {
  const key = `${r.headersIn['X-User-Id']}:${r.headersIn['X-Nchan-Channel-Id']}`;
  // Decrement counter...
  // if (count === 0) await publish_table_leave(r, ...);
  r.return(204);
}
```
Note: This requires adding `nchan_subscribe_request` to the table locations as well.
