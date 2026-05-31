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
   ```javascript
   const opponentId = p.get('opponentId');
   if (opponentId) {
       this.#autoChallenge = {
           opponentId,
           opponentName: p.get('opponentName') || opponentId,
           ruleType: p.get('ruletype') || 'nineball',
           nextTurnId: p.get('nextTurnId')
       };
   }
   ```

2. **Parameter Purging**: Clean up URL params immediately in the constructor to prevent refresh loops:
   ```javascript
   if (opponentId || p.has('rematch') || p.has('action')) {
       const url = new URL(location.href);
       url.searchParams.delete('rematch');
       url.searchParams.delete('action');
       url.searchParams.delete('opponentId');
       url.searchParams.delete('opponentName');
       url.searchParams.delete('ruletype');
       url.searchParams.delete('nextTurnId');
       history.replaceState(null, '', url);
   }
   ```

3. **Connection Hook**: Upon connecting to the lobby, check for an existing incoming offer from the opponent. If none, automatically challenge them:
   ```javascript
   if (this.#autoChallenge) {
       const opponentId = this.#autoChallenge.opponentId;
       const incoming = Object.values(this.#state.challenges).find(
           c => c.challengerId === opponentId && c.status === 'pending'
       );
       if (incoming) {
           this.dispatch({ type: 'CHALLENGE_MSG', payload: incoming });
           this.#acceptChallenge(incoming.challengerId).catch(err => console.error(err));
       } else {
           this.#challenge(opponentId, this.#autoChallenge.ruleType, this.#autoChallenge.options);
       }
   }
   ```

4. **Simultaneous Resolution**:
   If a challenge is received from `opponentId` *after* we have already sent one:
   - Tie-breaker: If `myId < opponentId`, auto-accept the incoming challenge.
   - The other player (with higher ID) will naturally receive the `accept` message for the challenge they sent.
   - Implement in `onChallenge(msg)`:
     ```javascript
     if (this.#autoChallenge && msg.challengerId === this.#autoChallenge.opponentId && msg.type === 'offer') {
         const sent = this.#sentChallenge;
         if (sent && sent.challengeeId === msg.challengerId && sent.status === 'pending') {
             if (this.#myId < msg.challengerId) {
                 this.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
                 this.#acceptChallenge(msg.challengerId).catch(err => console.error(err));
             }
         } else {
             this.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
             this.#acceptChallenge(msg.challengerId).catch(err => console.error(err));
         }
         return;
     }
     ```

5. **Exiting State on Cancel/Decline/Dismiss**:
   Clear the `#autoChallenge` memory structure if the challenge is declined, cancelled, or dismissed:
   - Set `this.#autoChallenge = null` in `#cancelChallenge()`, `#declineChallenge()`, and `#clearSentChallenge()`.
   - Also clear in `onChallenge(msg)` on receiving a cancel or decline from the opponent:
     ```javascript
     if (this.#autoChallenge && (msg.challengerId === this.#autoChallenge.opponentId || msg.challengeeId === this.#autoChallenge.opponentId)) {
         if (msg.type === 'decline' || msg.type === 'cancel') {
             this.#autoChallenge = null;
         }
     }
     ```

6. **Turn Resolution**:
   Override `isFirst` in `OnlinePanel`'s getter when `nextTurnId` is present in the auto-challenge config:
   ```javascript
   get #isFirst() {
       if (this.#autoChallenge?.nextTurnId) {
           return this.#autoChallenge.nextTurnId === this.#myId;
       }
       return !!this.#state.currentMatch?.isFirst;
   }
   ```

### 3.3 UI Updates
- **ChallengeBanner**: Remove the "Waiting for rematch" state. It will now just show a standard "Waiting for [Opponent] to accept" banner, as the auto-challenge is just a normal challenge.

## 4. Implementation Plan

1. **Phase 1: Cleanup** [DONE]
   - Delete `src/client/rematch-coordinator.js`.
   - Update `src/types.ts` to remove `RematchInfo`.
   - Update `src/lobby.ts` to remove `rematch` from method signatures.
   - Remove `RematchCoordinator` imports and usage from `src/client/online-panel.js`.

2. **Phase 2: Utility Refactoring** [DONE]
   - Update `src/client/utils.js` to simplify `reduce` and `resolveFirstTurn`.
   - Ensure `gameUrl` no longer expects or appends a `rematch` JSON string.

3. **Phase 3: OnlinePanel Implementation**
   - Implement the new `#autoChallenge` logic, parameter purging, connection hooks, and getter override in `OnlinePanel`.
   - Implement tie-breaker and state clearing on cancel/decline/dismiss.

4. **Phase 4: Component & Test Cleanup**
   - Update `src/client/challenge-banner.js` to remove rematch-specific UI.
   - Update `playwright/lobby-rematch.spec.ts` to use new query parameters instead of `rematch=...` and unskip the tests.
   - Run linter and type-checker to ensure everything is correct.

5. **Phase 5: Verification**
   - Run Playwright rematch tests with `npm run test:debug` to ensure the new auto-challenge flow works correctly.

## 5. 2-Phase Rollout Strategy
The implementation will be executed in two distinct stages to ensure a clean transition:

- **Stage 1: Legacy Removal** [DONE]: Complete Phase 1 and 2 of the implementation plan. This removes the `RematchCoordinator`, deletes legacy tests, and cleans up the type system. At the end of this stage, the "Rematch" button in games will lead to the lobby but will not trigger any special logic.
- **Stage 2: Auto-Challenge Implementation**: Complete Phase 3, 4, and 5. This introduces the URL-driven `#autoChallenge` logic and verifies the new flow.

This approach ensures that we are not building the new system on top of legacy technical debt.

## 6. Implementation Documentation

### How it Works
The new system replaces the complex `RematchCoordinator` with a simple, URL-parameter-driven "Auto-Challenge" mechanism implemented directly in the `OnlinePanel` component.

1.  **URL Parsing**: Upon initialization, the lobby checks for `opponentId`, `opponentName`, `ruletype`, and `nextTurnId` in the URL.
2.  **Immediate Purge**: These parameters are immediately removed from the browser history to prevent refresh loops.
3.  **Automatic Action**:
    *   If an incoming challenge from the `opponentId` is already pending in the lobby state, it is automatically accepted.
    *   Otherwise, a new challenge is automatically sent to the `opponentId`.
4.  **Simultaneous Resolution**: If both players send a challenge at the same time, a lexicographical tie-breaker (`myId < opponentId`) is used. The player with the lower ID will automatically accept the incoming challenge, while the player with the higher ID waits for the other's acceptance.
5.  **Turn Order**: If `nextTurnId` is provided in the URL, it overrides the default "challenger goes first" logic, ensuring deterministic turn order across matches.

### Interface
-   **opponentId**: (Required) The unique ID of the player to challenge.
-   **opponentName**: (Optional) Display name for the opponent.
-   **ruletype**: (Optional, default: 'nineball') The game rule type.
-   **nextTurnId**: (Optional) The ID of the player who should take the first turn.

### Issues Encountered & Resolutions
-   **Environment Limitations**: Docker rate limits and restricted sandbox capabilities prevented running full integration tests using the production-like backend.
    -   *Resolution*: Verified logic via targeted Playwright scripts that manually injected state and mock messages using `page.evaluate`.
-   **Build Artifact Bloat**: Initial builds produced un-minified bundles.
    -   *Resolution*: Enforced `pnpm build:lit` which uses `esbuild --minify` to produce production-ready artifacts and ensured source file integrity (`src/client/utils.js`).
-   **Simultaneous Challenge Race**: Potential for duplicate matches if both players auto-accepted.
    -   *Resolution*: Implemented a strict lexicographical tie-breaker in `OnlinePanel` dispatch logic.
