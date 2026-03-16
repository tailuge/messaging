# Nchan Client Improvements Plan

## Objective
Address flakiness in tests and improve robustness of the Nchan client for consumers (Webpack/React).

## Proposed Changes

### 1. Fix Test Flakiness
**File:** `test/nchanclient.spec.ts`
- **Current:** Uses `await wait()` (fixed 100ms sleep) to wait for WebSocket connection and message delivery. This is unreliable in CI or slow environments.
- **Change:** Replace `wait()` with `await waitFor(() => condition)` to wait until the specific condition (message received) is met, with a timeout safety net.
- **Detail:** Use `subscription.ready` to ensure connection is established before publishing.

### 2. Improve Lobby State Integrity
**File:** `src/lobby.ts`
- **Current:** `handlePresenceUpdate` blindly accepts `join` or `leave` messages. Out-of-order messages (e.g., a delayed "leave" arriving after a reconnect "join") can corrupt state.
- **Change:** In `handlePresenceUpdate`, check `msg.meta.ts` (server timestamp) against the stored user's timestamp.
  - If incoming `ts` < stored `ts`, ignore the message as outdated.
  - This ensures only the latest state is applied.

### 3. Enhance Build Compatibility
**File:** `tsconfig.json`
- **Current:** `target: "ES2022"`.
- **Change:** Lower to `target: "ES2020"`.
- **Reason:** Improves compatibility with older Webpack 4 configurations still common in some consumer projects, while retaining most modern features.

## Verification
- Run `npm test` to ensure all tests pass reliably.
- Verify build output targets ES2020.
