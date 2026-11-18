# Reduce presence fanout

Status: proposal. Step 1 (the route, CORS and rate limit) is wired up: `POST
/api/presence/heartbeat` answers `501 Not Implemented`, so the plumbing can be deployed and
verified ahead of the handler. The registry write and the client change are not implemented.

## Goal

Presence heartbeats currently publish to the shared lobby channel. Every subscriber receives
them even though they usually carry no change. Keep Nchan for events that peers need live:
presence join/leave, challenges, and chat. Move heartbeat refreshes to the existing HTTP
presence snapshot service.

## Simplest design

Add one HTTP endpoint, `POST /api/presence/heartbeat`. It accepts the current user's full
presence payload, refreshes that user's entry and TTL in `presence_live`, and returns an
empty success response. It does not publish to Nchan. The snapshot API continues to expose
the stored current presence.

The client uses this endpoint on its existing heartbeat timer instead of publishing a
`heartbeat` message. Keep the current interval and TTL together: the code currently uses a
120 second heartbeat and a 130 second presence TTL. Reuse the existing TTL behavior and
registry format; do not add a fingerprint, reaper, or a second liveness store.

Join and leave remain Nchan events. Join also writes the initial snapshot entry; leave and
the existing disconnect auto-leave remove it. Challenge and chat paths do not change.

Presence changes such as table or arena status should continue to publish immediately using
the current `updatePresence()` path, and update the registry as they do today. They are
user-visible changes, unlike periodic heartbeats. This keeps the implementation small and
avoids making lobby status stale until the next snapshot fetch.

## Compatibility

During rollout, accept legacy heartbeat publishes from older clients, refresh the registry,
and suppress forwarding those heartbeat frames to Nchan. Continue forwarding join, leave,
and meaningful presence updates. This lets the server deploy first and prevents old clients
from retaining the fanout problem.

Do not fall back to publishing a heartbeat when the HTTP endpoint fails. Log the failure and
retry at the next timer tick; a publish fallback would reintroduce fanout. The next join or
meaningful presence update can refresh the registry in the meantime.

## Implementation steps

1. Add the heartbeat HTTP handler, reusing the presence registry update logic. Validate the
   user ID and return an error for malformed requests.
2. Suppress legacy heartbeat frames in the publish handler after updating the registry.
3. Add the exact-match Nginx route and allow the method in CORS.
4. Add a library method for the HTTP request and switch the heartbeat timer to use it.
5. Deploy server first, then library/client.

## Checks

- An HTTP heartbeat refreshes the snapshot entry and produces no presence-channel frame.
- A legacy published heartbeat refreshes the entry but produces no channel frame.
- Join, leave, meaningful status updates, challenges, and chat still publish as expected.
- Snapshot data reflects the latest heartbeat and status update.
- Compare `presence.out` before and after rollout to measure the fanout reduction.
