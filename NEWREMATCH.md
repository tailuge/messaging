# Simplified Rematch Specification (NEWREMATCH.md)

This document outlines the removal of the legacy rematch state system and the implementation of a streamlined auto-challenge mechanism triggered by URL parameters.

## 1. Overview
The goal is to eliminate the complexity of the `RematchCoordinator` and associated state management. Instead, the lobby will support an "Auto-Challenge" mode where players arriving from an external URL with specific parameters will automatically attempt to pair up.

## 2. URL Parameter Specification
The following query parameters will be supported to trigger an auto-challenge:
- `opponentId`: The unique ID of the player to challenge.
- `opponentName`: The display name of the opponent.
- `ruletype`: The game type (e.g., `nineball`, `eightball`).
- `nextTurnId` (Optional): The ID of the player who should go first. This replaces the `first` boolean for better clarity.

Example: `lobby.html?opponentId=user-123&opponentName=Bob&ruletype=nineball&nextTurnId=user-123`

## 3. Core Logic Changes

### 3.1 Removal of Legacy Systems
- **Delete** `src/client/rematch-coordinator.js`: All deterministic logic moved to `OnlinePanel`.
- **Delete** `test/rematch-simultaneous.spec.ts`: Unit tests for the deleted coordinator.
- **Cleanup** `src/types.ts`: Remove `RematchInfo` interface and references in `PresenceMessage` and `ChallengeMessage`.
- **Cleanup** `src/lobby.ts`: Remove `rematch` parameters from `challenge`, `acceptChallenge`, and internal message handling.
- **Cleanup** `src/client/utils.js`: Remove `rematch` from `reduce`, `resolveFirstTurn`, and `gameUrl`.

### 3.2 Simplified Auto-Challenge Flow
In `OnlinePanel.js`, the `#rematch` and `#joinInfo` private fields will be replaced by a single `#autoChallenge` object:
1. **Initialization**: On load, if `opponentId` is present in the URL, populate `#autoChallenge`.
2. **Connection**: Upon connecting to the lobby:
   - Check if an incoming offer from `opponentId` already exists in the state.
   - If yes: **Auto-Accept** it.
   - If no: **Send Challenge** to `opponentId`.
3. **Simultaneous Resolution**:
   - If a challenge is received from `opponentId` *after* we have already sent one to them:
     - Use a simple tie-breaker: If `myId < opponentId`, auto-accept the incoming challenge.
     - The other player (with higher ID) will naturally receive the `accept` message for the challenge they sent.
4. **Turn Resolution**:
   - `resolveFirstTurn` will now simply check if `nextTurnId === myId`. If `nextTurnId` is missing, it falls back to the standard "challenger goes first" logic.
5. **Idempotency & Deduplication**: The `OnlinePanel` must ensure the auto-accept/challenge logic only fires once per session. Integration with `ChallengeDeduplicator` ensures that simultaneous transitions to the game are handled safely.
6. **Parameter Purging**: Once the auto-challenge is successfully initiated (challenge sent or accepted), the URL parameters must be cleared using `window.history.replaceState` to prevent re-triggering the flow on page refresh.

### 3.3 UI Updates
- **ChallengeBanner**: Remove the "Waiting for rematch" state. It will now just show a standard "Waiting for [Opponent] to accept" banner, as the auto-challenge is just a normal challenge.

## 4. Implementation Plan

1. **Phase 1: Cleanup**
   - Delete `src/client/rematch-coordinator.js`.
   - Update `src/types.ts` to remove `RematchInfo`.
   - Update `src/lobby.ts` to remove `rematch` from method signatures.
   - Remove `RematchCoordinator` imports and usage from `src/client/online-panel.js`.

2. **Phase 2: Utility Refactoring**
   - Update `src/client/utils.js` to simplify `reduce` and `resolveFirstTurn`.
   - Ensure `gameUrl` no longer expects or appends a `rematch` JSON string.

3. **Phase 3: OnlinePanel Implementation**
   - Implement the new `#autoChallenge` logic in `OnlinePanel`.
   - Ensure URL parameters are cleaned up after processing to prevent loops on refresh.
   - Implement idempotency checks to ensure auto-challenge logic only runs once.
   - Implement the lexicographical tie-breaker in `onChallenge`.

4. **Phase 4: Component & Test Cleanup**
   - Update `src/client/challenge-banner.js` to remove rematch-specific UI.
   - Delete `test/rematch-simultaneous.spec.ts`.

5. **Phase 5: Verification**
   - Run existing tests to ensure no regressions in basic challenge flow.
## 5. 2-Phase Rollout Strategy
The implementation will be executed in two distinct stages to ensure a clean transition:

- **Stage 1: Legacy Removal**: Complete Phase 1 and 2 of the implementation plan. This removes the `RematchCoordinator`, deletes legacy tests, and cleans up the type system. At the end of this stage, the "Rematch" button in games will lead to the lobby but will not trigger any special logic.
- **Stage 2: Auto-Challenge Implementation**: Complete Phase 3, 4, and 5. This introduces the URL-driven `#autoChallenge` logic and verifies the new flow.

This approach ensures that we are not building the new system on top of legacy technical debt.
