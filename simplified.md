# Reduce presence fanout

Status: implementation complete; runtime verification and rollout remain. The HTTP handler
validates heartbeat requests, refreshes `presence_live`, and returns an empty `204` response.
If the user is new or a user-visible presence field changed, it also publishes the enriched
heartbeat to Nchan so current subscribers receive the update. Unchanged heartbeats only
refresh the registry and TTL. The library now sends heartbeat messages through this endpoint,
and the legacy Nchan publish handler suppresses old-client heartbeat frames after refreshing
the registry. Legacy joins, leaves, and status updates continue to fan out normally.

## Goal

Presence heartbeats currently publish to the shared lobby channel. Every subscriber receives
them even though they usually carry no change. Keep Nchan for events that peers need live:
presence join/leave, challenges, and chat. Move heartbeat refreshes to the existing HTTP
presence snapshot service.

## Simplest design

The HTTP endpoint, `POST /api/presence/heartbeat`, accepts the current user's full presence
payload and refreshes that user's entry and TTL in `presence_live`. It returns an empty
success response. When the user is new or meaningful presence fields differ from the stored
frame, it publishes the enriched heartbeat internally to Nchan; otherwise it avoids a
channel publish. The snapshot API continues to expose the stored current presence.

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

During rollout, accept legacy heartbeat publishes from older clients and refresh the
registry. The legacy publish path currently still forwards those heartbeat frames to Nchan;
add suppression after registry update while continuing to forward join, leave, and
meaningful presence updates. This lets the server deploy first, then removes fanout for old
clients when that compatibility step lands.

Do not fall back to publishing a heartbeat when the HTTP endpoint fails. Log the failure and
retry at the next timer tick; a publish fallback would reintroduce fanout. The next join or
meaningful presence update can refresh the registry in the meantime.

## Implementation steps

1. **Done:** Add the heartbeat HTTP handler, reuse the presence registry update logic,
   validate the user ID and reject malformed requests. Publish to Nchan only for a new user
   or meaningful presence change.
2. **Done:** Suppress legacy heartbeat frames in the publish handler after updating the
   registry.
3. **Done:** Add the exact-match Nginx route, CORS and rate limit.
4. **Done:** Add a library method for the HTTP request and route heartbeat-typed presence
   messages through it.
5. **Remaining:** Verify the server behavior, then deploy server first and library/client
   afterward.

## Checks

- An unchanged HTTP heartbeat refreshes the snapshot entry and produces no
  presence-channel frame.
- A new or meaningfully changed HTTP heartbeat refreshes the snapshot and publishes a frame
  to current presence-channel subscribers.
- A legacy published heartbeat refreshes the entry but produces no channel frame.
- Join, leave, meaningful status updates, challenges, and chat still publish as expected.
- Snapshot data reflects the latest heartbeat and status update.
- Compare `presence.out` before and after rollout to measure the fanout reduction.
