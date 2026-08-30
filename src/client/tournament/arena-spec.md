# Minimal Arena MVP Specification

## Status

Planning only. This document captures the minimum product and technical requirements before further implementation. No code changes are part of this specification task.

## Goal

Provide a lightweight Arena feature where a user can create a fixed-duration competition using a caller-supplied game configuration, other users can discover and join or leave it, and a bounded history of completed Arena results is retained.

The initial scope is deliberately smaller than the broader Arena plan previously described in `tournament.md`: creation, discovery, joining, leaving, lifecycle display, and result-history storage/display are in scope. Automatic matchmaking, challenge integration, game launch, and Arena scoring hookup are deferred.

## Existing Context

- Knockout tournament UI exists in `src/client/tournament/tournament.js` and `tournament.html`.
- The knockout page currently uses browser `localStorage` as a visual placeholder; its comments identify the intended future KV replacement.
- A separate `src/client/tournament/arena.js` and `arena.html` entry point exists or is being built independently.
- `docker/api.njs` already contains an initial Arena API implementation using Upstash Redis REST through NJS.
- The deployed NJS version is not full JavaScript. Avoid unsupported syntax and validate Docker startup with `npm run build:all`.
- Existing game/challenge conventions use `ruleType` and an `options` object. Existing options include fields such as `tableSize`, `reds`, `raceTo`, and `freeaim`.
- No new database, KV provider, or storage library should be introduced.

## Product Decisions

### Arena creation

- Any identified client may create an Arena.
- No stronger authentication or admin-only restriction is required for the MVP.
- Creation must be available through an API and may be exposed through the Arena UI when practical.
- Each Arena receives a server-generated unique ID and a shareable URL.
- Multiple Arenas must be able to exist concurrently and remain isolated by Arena ID.
- The server should remain intentionally dumb: it stores and returns the supplied Arena game configuration rather than trying to understand or validate every game-specific option.

### Arena game configuration

The create request must carry the configuration needed later to launch a game/challenge for Arena participants. The configuration is not a preset selection.

Canonical request shape:

```json
{
  "ruleType": "threecushion",
  "options": {
    "tableSize": "5",
    "reds": "15",
    "raceTo": "15",
    "freeaim": true,
    "futureGameOption": "preserved"
  },
  "durationMinutes": 10
}
```

Rules:

- `ruleType` is the only required game-configuration field.
- `options` is optional and may contain `tableSize`, `reds`, `raceTo`, `freeaim`, and arbitrary future game-specific fields.
- Values inside `options` are opaque JSON. The server must preserve them without coercing strings to numbers or booleans.
- Unknown option fields must be preserved, not rejected or silently discarded.
- The server does not validate whether a combination is playable. The eventual game/challenge flow remains responsible for interpreting or rejecting invalid rules.
- Existing client naming conventions are canonical: `ruleType`, `tableSize`, and `raceTo`. Legacy URL spellings such as `ruletype`, `tablesize`, and `raceto` do not need to be accepted by this API unless a compatibility layer is later requested.
- `presetId` is not used. A preset would represent a server-maintained named template, but this MVP requires the caller to provide the full opaque configuration and only needs a server-generated Arena ID.

The Arena detail response must return this exact configuration so a future client can use the Arena ID to retrieve it before launching a challenge. The Arena ID is the durable lookup/context identifier; the client should not need to reconstruct or trust a separately copied configuration.

### Duration

- Duration is a separate top-level `durationMinutes` field.
- The create API should use `durationMinutes`, not `durationMs`.
- The server should start the Arena immediately; callers do not supply `startTime`.
- `startTime` is set from server time and `endTime` is calculated from the supplied duration.
- The server should keep duration handling simple. It may reject missing/non-positive/non-numeric durations as malformed input, but it must not introduce game-specific policy validation.
- If product later decides to restrict durations to an allowlist, that is a separate product decision; the current requirement is to support examples such as 10 and 30 minutes without a preset layer.

### Joining and leaving

- Players may join while the Arena is active.
- Joining is rejected after the Arena ends.
- Leaving marks a participant inactive while retaining their participant record and any score/history that may exist later.
- A player must not be duplicated in an Arena.
- The active participant count and inactive state must be visible or otherwise clear in the UI.
- The MVP does not need a separate persisted availability/playing state.

### Discovery

- Provide an active Arena list plus direct shareable links.
- The list should show active Arenas and enough metadata to choose one: rule type, relevant opaque options, duration/end time, status, participant count, and Arena ID/link.
- A refresh button is the required update mechanism. Automatic polling and real-time Arena list events are not required for this MVP.
- Refresh should also be available after create, join, and leave actions.

### Leaderboard and history

- During the active phase, show all joined participants, including inactive leavers, with their state distinguishable.
- Since scoring hookup is deferred, the initial leaderboard may show zeroed or placeholder score/stat fields, but the data model must support future points, wins, and games.
- Retain the ten most recent finished Arena results globally.
- History entries must be sufficient to render a finished Arena without relying on deleted working keys: Arena ID, full opaque game configuration, timing, final participants/leaderboard, and winner/result summary when scoring is later implemented.
- The history UI should show recent finished Arenas and link to their retained result pages/details.

### Ties

- The underlying game does not produce ties.
- The Arena specification therefore does not need a tie-resolution rule for the MVP. Future scoring should preserve the authoritative game result semantics rather than inventing a client-side tie rule.

## MVP User Flows

### Create

1. User opens the standalone Arena page or Arena directory.
2. User supplies/selects a `ruleType` and any game-specific `options`.
3. User selects or supplies an allowed practical duration such as 10 or 30 minutes.
4. User activates Create Arena.
5. Server validates only that the request is structurally usable, generates an Arena ID, persists the complete opaque configuration, and returns the Arena.
6. Client navigates to or displays the Arena detail page and its shareable URL.

### Discover and view

1. User opens the Arena list.
2. Client loads active Arenas from the API.
3. User selects an Arena or opens a shared Arena URL.
4. Client displays status, complete game configuration, start/end times, countdown, participants, and join/leave state.
5. User can press Refresh to reconstruct current state from the server.

### Join

1. User supplies or confirms the existing display name/identity.
2. Client sends the identified player ID and display name to the Arena join endpoint.
3. Server rejects missing/invalid identity, nonexistent Arena, finished Arena, or duplicate participation.
4. On success, the participant is retained in Arena metadata and the UI refreshes.

### Leave

1. Joined user activates Leave Arena.
2. Server marks the participant inactive without losing their participation data or future history snapshot.
3. UI refreshes and keeps the participant visible with an inactive state.

### Finish and history

1. Once `endTime` is reached, the server treats the Arena as finished on the next relevant request.
2. New joins and leaves that would change active participation are rejected or handled according to the finalization policy.
3. The finished summary, including the complete opaque game configuration, is retained in bounded history.
4. The active Arena is no longer shown in the active list and is available through recent history.

Because game/result integration is deferred, the first implementation may finalize with the currently stored participant/stat snapshot and must clearly label scoring as not yet connected if no results exist.

## Proposed Data Model

The minimum metadata model should preserve the caller's configuration without interpretation:

```ts
interface Arena {
  id: string;
  ruleType: string;
  options: Record<string, unknown>;
  durationMinutes: number;
  startTime: number;
  endTime: number;
  status: "active" | "finished";
  players: ArenaPlayer[];
  createdAt: number;
}

interface ArenaPlayer {
  playerId: string;
  name: string;
  active: boolean;
  joinedAt: number;
  points: number;
  wins: number;
  games: number;
}

interface ArenaHistoryEntry {
  arenaId: string;
  ruleType: string;
  options: Record<string, unknown>;
  durationMinutes: number;
  startTime: number;
  endTime: number;
  finishedAt: number;
  leaderboard: ArenaPlayer[];
  winnerId?: string;
}
```

The `options` object is opaque and must be round-tripped unchanged. The server may add metadata fields, but must not rewrite or discard supplied game options.

## Storage Requirements

Use the existing KV mechanism only.

Suggested namespaced keys:

```text
arena:{arenaId}          -> Arena metadata, opaque config, and players
arena:{arenaId}:scores   -> future score fields, if separate storage remains useful
arena:results            -> bounded map/list of ten most recent finished results
```

For this minimal phase, score storage can remain embedded in Arena metadata if that matches the existing API implementation and avoids unnecessary complexity. Do not create global non-namespaced working keys that could mix concurrent Arenas.

Working records must have a safety TTL. History retention must be bounded to ten finished Arenas and must be deterministic: newest `finishedAt` entries are retained.

## API Contract Direction

The create endpoint is the first implementation target:

```http
POST /api/arena
Content-Type: application/json
```

Request:

```json
{
  "ruleType": "threecushion",
  "options": {
    "tableSize": "5",
    "reds": "15",
    "raceTo": "15",
    "freeaim": true
  },
  "durationMinutes": 10
}
```

Response:

```http
201 Created
```

```json
{
  "status": "success",
  "arena": {
    "id": "arena-abc123",
    "ruleType": "threecushion",
    "options": {
      "tableSize": "5",
      "reds": "15",
      "raceTo": "15",
      "freeaim": true
    },
    "durationMinutes": 10,
    "startTime": 1788100000000,
    "endTime": 1788100600000,
    "status": "active",
    "players": [],
    "createdAt": 1788100000000
  }
}
```

The server generates the Arena `id`; it is not supplied by the caller. The future game flow should use the Arena ID to fetch the exact stored configuration when launching a challenge.

Other MVP operations:

- `GET /api/arena` or an equivalent active-list endpoint — list active Arenas.
- `GET /api/arena/:arenaId` — retrieve one Arena and its participant/stat view.
- `POST /api/arena/:arenaId/join` — join with existing identity/display name.
- `POST /api/arena/:arenaId/leave` — mark the participant inactive.
- `GET /api/arena/results` — retrieve the ten retained finished results.

Every endpoint must isolate data by `arenaId` where applicable. Error responses should be JSON and use consistent status codes for malformed input, missing Arena, duplicate join, and finished Arena.

The current API's result endpoint may remain behind a feature boundary until authoritative game-result integration is specified. It must not become a trusted client-only scoring path in the final design.

## UI Requirements

- Keep Arena as a standalone `arena.html` page, independent of knockout tournament rendering.
- Reuse lobby theme variables, light/dark behavior, typography, user identity/display name, and logo/header conventions.
- Provide a discoverable active Arena list and a direct Arena detail view.
- Detail view must include:
  - rule type and relevant options;
  - status;
  - start/end time and countdown;
  - duration;
  - participant count;
  - participant list with inactive state;
  - Join or Leave control;
  - Refresh control;
  - shareable URL/copy affordance;
  - current score/stat placeholders where appropriate;
  - link/section for recent finished Arena history.
- The create form must allow the initial required game configuration fields to be entered without forcing a preset abstraction. It should support `ruleType`, `tableSize`, `reds`, `raceTo`, and `freeaim`, while keeping the implementation extensible for future options.
- Use accessible labels, status announcements, disabled/loading states, and clear errors.
- Do not add matchmaking states, challenge buttons, game redirects, podiums, or automatic opponent selection to this minimal phase.

## Explicitly Deferred

- Automatic matchmaking and opponent selection.
- Existing challenge/acceptance integration and Arena metadata on challenges.
- Table/game launch and return-to-Arena flow. The future flow should use Arena ID to retrieve the stored opaque configuration.
- Authoritative result subscription/hookup.
- Server-side point awarding and idempotent result scoring.
- Elo sorting and final podium/medals.
- Presence-derived availability for matchmaking.
- Real-time push updates or polling beyond an explicit refresh button.
- Authentication/authorization stronger than the existing identified client convention.
- Presets or server-maintained named ruleset templates.

## Edge Cases

- Reject malformed JSON and missing `ruleType`.
- Preserve arbitrary JSON option fields exactly through create, get, and history snapshot operations.
- Do not reject an otherwise structurally valid option merely because the server does not understand it.
- Reject missing, non-numeric, or non-positive duration values; do not silently default to one hour.
- Prevent duplicate joins, including repeated requests.
- Handle concurrent join requests without losing an existing participant.
- Reject joins after lazy status transition to `finished`, even if the client displays stale `active` state.
- Make repeated leave requests harmless or return a clear already-inactive response.
- Ensure two Arena IDs cannot read or mutate each other's players/configuration/history.
- Ensure an Arena that expires without a follow-up request is eventually removed from the active list through TTL or a list query that filters by `endTime`.
- If history storage is malformed or unavailable, return a safe error without exposing unrelated Arena data.
- Preserve the full game configuration, display names, and participant records in final history even after working keys are cleaned up.

## Acceptance Criteria

- A user can create an Arena by sending `ruleType`, arbitrary opaque `options`, and `durationMinutes`.
- The server generates a unique Arena ID and does not require or interpret a `presetId`.
- The supplied options, including `tableSize`, `reds`, `raceTo`, `freeaim`, and unknown future fields, round-trip unchanged.
- Creation starts the Arena immediately and returns server-derived `startTime` and `endTime`.
- Active Arenas are discoverable from a list and via direct URL.
- Multiple concurrent Arenas remain isolated.
- A player can join once, see themselves in the participant list, and leave without losing retained participation data.
- All joined players remain visible during the Arena, with inactive state distinguishable.
- Refresh reconstructs the same Arena state from the API/KV.
- Finished Arenas reject new joins and appear in the ten-item history with their full configuration.
- History is bounded to the ten newest finished Arenas and contains enough data for a standalone finished view.
- The knockout tournament flow remains unchanged.
- `npm run build:all` completes successfully and the Docker/NJS configuration starts without syntax errors.

## Implementation Sequence

1. Update the create endpoint to accept `ruleType`, opaque `options`, and `durationMinutes`; remove preset-only assumptions.
2. Define the Arena response/storage shape and server-generated ID behavior.
3. Add/list/get Arena API behavior using namespaced KV state.
4. Add join/leave validation and idempotent participant updates.
5. Add lazy lifecycle transition and bounded history finalization.
6. Build the independent Arena list/detail/history Lit UI with refresh-driven updates.
7. Add focused tests for create/config round-tripping, list/get, join, leave, expiry/history, and concurrent Arena isolation.
8. Run `npm run build:all` and relevant tests.
9. Specify and implement game/challenge/result integration only in a later phase, using Arena ID to retrieve the stored configuration.
