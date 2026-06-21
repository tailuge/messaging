# Rematch Cleanup & Unified Auto-Challenge Plan

## Goal
Simplify the rematch and cross-site challenge acceptance by removing the `action=join` parameter and unifying all "return with intent" flows into a single deterministic mechanism.

## 1. Unified URL Parameters
The lobby will no longer look for `action=join`. All external entries with intent will use:
- `opponentId=X`: ID of the player to challenge or whose challenge to accept.
- `opponentName=Y`: Display name (optional).
- `ruletype=Z`: The game type.
- `nextTurnId=W`: (Optional) Deterministic first player for rematches.

## 2. Removal of Legacy Logic
- **`OnlinePanel.js`**: Remove the `action` parameter from URL parsing and the cleanup logic.
- **`OnlinePanel.js`**: Remove any specialized "join" vs "rematch" branching.

## 3. Deterministic Auto-Challenge / Simultaneous Acceptance
The `OnlinePanel` will maintain a single `#autoChallenge` state.

### Tie-Breaker Logic (Simultaneous Entry)
When both Player A and Player B enter the lobby targeting each other:
1. Both may broadcast a challenge `offer`.
2. The `reduce` function in `utils.js` ensures that:
   - The **Lower ID** player yields (updates their state to track the Higher ID's offer).
   - The **Higher ID** player ignores the incoming offer (keeps tracking their own sent offer).
3. `OnlinePanel` logic:
   - If an incoming offer matches `opponentId`, and we are the **Lower ID**, we call `acceptChallenge`.
   - If we arrive and the opponent has already offered, we accept regardless of ID (Scenario 5-8).
   - The **Higher ID** player simply waits for the `accept` message from the Lower ID player.

### Refined Logic for `OnlinePanel.#handleAutoChallengeOnMessage`:
```javascript
if (msg.type === 'offer' && msg.challengeeId === this.#myId) {
    if (this.#autoChallenge && this.#autoChallenge.opponentId === msg.challengerId) {
        const sent = this.#sentChallenge;
        if (sent && sent.challengeeId === msg.challengerId && sent.status === 'pending') {
            // Simultaneous offers: Lower ID accepts
            if (this.#myId < msg.challengerId) {
                this.#acceptChallenge(msg.challengerId);
            }
        } else {
            // No simultaneous offer from us: Just accept the incoming one
            this.#acceptChallenge(msg.challengerId);
        }
    }
}
```

## 4. Asserting "First Player"
The `nextTurnId` parameter from the URL must be passed into the `accept` message.
In `reduce` (`CHALLENGE_MSG`, type `accept`):
- `isFirst` is determined by:
  - If `nextTurnId` is present and matches `myId`, `isFirst = true`.
  - Else if `nextTurnId` matches the other player, `isFirst = false`.
  - Fallback: `challengerId === myId`. (Existing logic handles this).

## 5. Testing Strategy
- **Unit Test**: Update `test/rematch-repro.spec.ts` to verify that Bob (Higher ID) no longer self-accepts and Alice (Lower ID) correctly accepts Bob's offer.
- **Unified Test**: `test/rematch-unified.spec.ts` will mock various arrival timings to cover Scenarios 1-8.
- **E2E Test**: Playwright script where two pages are loaded with reciprocal `opponentId` and `nextTurnId`. Assert that only one page redirects to a URL containing `first=true`.
