# Nchan Client Improvements Plan

## Objective
Address flakiness in tests and improve robustness of the Nchan client for consumers (Webpack/React).

## Proposed Changes

### 1. Improve Lobby State Integrity
**File:** `src/lobby.ts`
- **Current:** `handlePresenceUpdate` blindly accepts `join` or `leave` messages. Out-of-order messages (e.g., a delayed "leave" arriving after a reconnect "join") can corrupt state.
- **Change:** In `handlePresenceUpdate`, check `msg.meta.ts` (server timestamp) against the stored user's timestamp.
  - If incoming `ts` < stored `ts`, ignore the message as outdated.
  - This ensures only the latest state is applied.

## Verification
- Run `npm test` to ensure all tests pass reliably.
