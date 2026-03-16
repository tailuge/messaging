# Challenge Deduplication on Reconnect

## Problem

When B accepts (or declines) a challenge then reconnects, they receive the buffered "offer" again even though they've already responded to it.

### Scenario
1. A challenges B → B receives "offer"
2. B accepts → B sends "accept" to A
3. B disconnects and reconnects
4. Nchan delivers buffered messages: "offer" → "accept"
5. B receives "offer" notification again (bug!)
6. Game client opened in a new webpage reads the Nchan stream and incorrectly thinks there is a pending offer.

## Solution

Rely entirely on the Nchan event stream instead of `sessionStorage` or any global persistent storage. Since Nchan rapidly replays buffered messages on reconnect, we can introduce a small delay (250ms) to allow subsequent "accept", "decline", or "cancel" messages to override a buffered "offer" before notifying the application.

### State Management
Use a dedicated class to encapsulate the state. Data structures:
- `pendingOffers: Map<string, { timeoutId: NodeJS.Timeout, offer: ChallengeMessage }>` - Track offers awaiting the 250ms timer. Keyed by `tableId`.
- `resolvedOffers: Set<string>` - Track `tableId`s that have been accepted, declined, or canceled.

### Flow

**When an `offer` arrives:**
1. Check if the `tableId` is in `resolvedOffers`. If so, drop it immediately.
2. Otherwise, store it in `pendingOffers` and start a 250ms timer.

**When an `accept`, `decline`, or `cancel` arrives:**
1. Add the `tableId` to `resolvedOffers`.
2. If there is an active timeout in `pendingOffers` for this `tableId`, clear the timeout and remove it from `pendingOffers`.

**When the 250ms timer fires:**
1. Check if the `tableId` is in `resolvedOffers` (as a safety measure).
2. If not, emit the `onChallenge` event to the application.
3. Remove the offer from `pendingOffers`.

## Phased Implementation Plan

### Phase 1: Timer Foundation [COMPLETED]
- [x] Introduce a simple 250ms delay for emitting `onChallenge` events in the existing `Lobby` component.
- [x] Run all existing tests to ensure the asynchronous delay doesn't break current functionality or assumptions.

### Phase 2: Refactoring (SOLID & DRY) [COMPLETED]
- [x] Create a new class, `ChallengeDeduplicator`, to encapsulate the timer and state logic.
- [x] Move the timer logic from Phase 1 into this class.
- [x] Update `Lobby.ts` to instantiate and use `ChallengeDeduplicator` instead of handling the timer directly.
- [x] Ensure all tests still pass.

### Phase 3: Full Deduplication Logic
- Implement the `pendingOffers` and `resolvedOffers` state tracking within `ChallengeDeduplicator`.
- Implement the filtering logic discussed above (canceling timers when accept/decline/cancel arrives).
- Enable and verify the `challenge-deduplication.spec.ts` tests.

## Why This Works

1. **Stateless on the Client side:** When the user loads the game client in a new webpage, it starts with a clean slate. It doesn't need to know anything; it just reads Nchan's replays.
2. **Nchan Replay Characteristics:** Nchan delivers recent history in rapid succession upon connection: `Offer(A->B)` followed very quickly by `Accept(B->A)`. The 250ms window is more than enough to capture the resolution.
3. **No Storage Cleanup Needed:** Memory is bound to the `Lobby` lifecycle in the specific browser tab. It handles reconnects, page refreshes, and new tabs consistently by treating the Nchan stream as the single source of truth.
