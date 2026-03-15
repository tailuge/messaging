# AGENTS.md

## Commands

```bash
npm run test           # Run Jest unit & integration tests
npm run test:debug     # Run Playwright browser tests
npm run lint           # Type check + lint
npm run format         # Prettier format
npm run build:example  # Bundle the example client
npm run example        # Start local http-server for example
npm run docker:nchan   # Build and start Nchan in Docker
npm run docker:stop    # Stop the Nchan Docker container
npm run docker:restart # Rebuild and restart the container
npm run docker:build   # Build the Nchan Docker image
```

## System Setup & Deployment

The project is a stateful messaging library designed to handle presence and real-time synchronization using Nchan as the transport layer.

### Local Development
- **Transport**: Requires a running Nchan instance. Use `npm run docker:nchan` to start one locally.
- **Example**: The example client in `example/` demonstrates presence and challenge flows. Run it with `npm run example`.

### Nchan Configuration
The library interacts with the following Nchan endpoints:
- `/subscribe/presence/lobby`: Presence and challenge tracking.
- `/publish/presence/lobby`: Heartbeats, join/leave, and challenge events.
- `/subscribe/table/:tableId`: Table-specific messaging.
- `/publish/table/:tableId`: Game moves and table events.

## Project Structure

```
src/
  messagingclient.ts # Main entry point & lifecycle management
  lobby.ts           # Presence, pruning, and challenges
  table.ts           # Table-specific messaging logic
  nchanclient.ts     # Low-level Nchan pub/sub transport
  types.ts           # Shared TypeScript interfaces
  utils/             # Internal utilities (UID generation, etc.)
test/
  messagingclient.spec.ts # Integration tests for the full flow
  nchanclient.spec.ts     # Tests for the transport layer
playwright/
  debug-connection.spec.ts # Browser-level connection tests
docker/
  Dockerfile         # Nginx + Nchan + NJS image
  nginx.conf         # Nchan channel configurations
  nchan_meta.js      # NJS script for message enrichment
```

## Testing Strategy

- **Integration (Jest)**: Uses `testcontainers` to spin up a real Nchan instance for every test run. Focuses on state management (pruning, heartbeats, table joining).
- **Browser (Playwright)**: Verifies WebSocket connectivity and event handling within a real browser environment.
- **Protocol (Shell)**: `docker/testnchan.sh` verifies Nchan endpoint behavior and metadata enrichment via `curl`.

## Nchan Message Enrichment

The Docker container uses Nginx with the Nchan module and an NJS script (`nchan_meta.js`) to enrich published messages with metadata (`meta`).

**How it works:**
1. All `/publish/*` endpoints route through `js_content nchan_meta.publish`
2. The NJS script parses the JSON payload and builds a `meta` object containing:
   - `ts`: ISO timestamp of the request (Source of Truth for timing)
   - `ua`, `origin`, `ip`, `country`, `city`: Request metadata
3. The original payload is merged with `meta` and forwarded to the internal Nchan publisher

**Verification:**
- `npm run test` verifies that `meta` is correctly received and parsed by the client.
- `./docker/testnchan.sh` provides specific assertions for metadata enrichment.

## Nchan Message Retention

The Nchan server is configured with message retention:
- `nchan_message_timeout`: 90 seconds
- `nchan_message_buffer_length`: 2000 messages

This ensures late subscribers receive buffered presence messages, making the system resilient to brief network interruptions and allowing reconnecting clients to see active users immediately.

## Joining with TableId for External Games

When a user is redirected from the lobby to an external game page (e.g., billiards game), the game page can still update the user's presence to show they're "in a table". This provides a consistent view for other users in the lobby.

**Use case:** Players challenge each other in the lobby, then redirect to an external game. The game page starts a new MessagingClient and joins the lobby with the tableId already set, so other lobby users see them as "in game".

**How it works:**

Pass `tableId` in the PresenceMessage when calling `joinLobby()`:

```typescript
// In the game page (e.g., billiards.game.com?id=player1&tableId=table123)
const client = new MessagingClient({ baseUrl: nchanUrl });

// Join lobby with tableId already set - other users will see this player as "at table-123"
const lobby = await client.joinLobby({
  messageType: "presence",
  type: "join",
  userId: urlParams.get("id"),
  userName: urlParams.get("name"),
  tableId: urlParams.get("tableId"),  // This marks the user as "in game"
});
```

**Key points:**
- The `tableId` field in `PresenceMessage` is optional
- When provided on join, other lobby users will see this user as "at table" via `user.tableId`
- This works alongside the normal challenge/accept flow - both set `tableId` in presence
- The presence continues to update via heartbeat, maintaining the "in table" status
- When the user leaves the table or logs out, call `lobby.updatePresence({ tableId: undefined })` to clear the table status

**Page unload behavior:**
When the lobby page is unloaded (navigate away), the library sends a `leave` message to clear the user's presence. This is intentional - it removes the user from the lobby view. The game page is expected to then call `joinLobby()` with `tableId` to re-establish presence as "in game". This ensures:
- No ghost users if redirect fails
- Clean state transition from lobby to game context

This enables lobby users to see which players are currently in games, even when those games are on external pages.

### Game Apps with Presence

For games that want to show online user count (presence) without requiring full lobby functionality:

**Minimal approach - presence only (no tableId):**
```typescript
// Single player or any game that just wants to show online count
const client = new MessagingClient({ baseUrl: nchanUrl });
await client.joinLobby({
  messageType: "presence",
  type: "join",
  userId: "player1",
  userName: "Player One",
  // No tableId - user appears as "available" in lobby
});
```

**Multiplayer - include tableId when playing a game:**
```typescript
// When user starts a multiplayer game
await lobby.updatePresence({ tableId: "table-123" });

// When game ends
await lobby.updatePresence({ tableId: undefined });
```

The `tableId` is optional. Without it, users appear in the lobby as "available" (not at a table). With it, they appear as "in game" at that table. This works for any game - external pages, same-origin apps, or single-player modes that want presence tracking.
