# Improvements for Lobby Implementation

Based on a review of the specification documents (`MESSAGING_SPEC.md`, `ACCEPT_DECLINE.md`, `challenge.md`, `launch.md`) and the current implementation in `docker/html/lobby.html` and `src/lobby.ts`, several inconsistencies and bugs have been identified.

## 1. Query Parameter Inconsistency (`name` vs `userName`)

**Issue**: `launch.md` specifies that the external game client expects the user's display name in a query parameter named `name`. However, the current implementations use `userName`.

- **Location**: `docker/html/lobby.html` (in `gameUrl` helper and `Solo Practice` link), `docker/html/solo.html`, `docker/html/test.html`, and `src/lobby.ts`.
- **Finding**:
  ```javascript
  // lobby.html
  const gameUrl = ({ ..., userName, ... }) => {
      let url = `...&userName=${encodeURIComponent(userName)}...`; // Should be &name=
      ...
  };
  ```
- **Suggestion**: Harmonize all external links to use `name` instead of `userName` to comply with the game client specification.

## 2. Challenge Message Invariant Contradiction

**Issue**: There is a contradiction in `MESSAGING_SPEC.md` regarding the `recipientId` and `challengerId` fields in `accept` and `decline` messages.

- **MESSAGING_SPEC.md Invariant**: "`challengerId` always refers to the original challenger... and `recipientId` always refers to the person being challenged."
- **MESSAGING_SPEC.md Table**:
  | type | sent by | `challengerId` | `recipientId` |
  |---|---|---|---|
  | `accept` | user-b | user-a | user-a ← challenger needs to know |
- **Code implementation (`src/lobby.ts`)**:
  ```typescript
  async acceptChallenge(userId: string, ...) {
    await this.nchan.publishChallenge({
      type: "accept",
      challengerId: userId, // original challenger
      recipientId: userId,  // set to original challenger so they receive it
      ...
    });
  }
  ```
- **Finding**: The code follows the table (routing by `recipientId`), but violates the "Invariant" text. This makes the code harder to reason about.
- **Suggestion**: Update `MESSAGING_SPEC.md` to clarify that `recipientId` is used for **routing** and must be the ID of the party intended to receive the message. Alternatively, rename the fields to `senderId` and `targetId` for clarity, though that's a larger breaking change. At minimum, the "Invariant" text should be corrected.

## 3. Broken Buffered Challenge Replay in `lobby.html`

**Issue**: `lobby.html` explicitly ignores buffered messages, which breaks the feature described in `challenge.md` where a user can see challenges after a page refresh.

- **Location**: `docker/html/lobby.html`
- **Finding**:
  ```javascript
  this._lobby.onChallenge(msg => {
      const msgTime = msg.meta?.ts ? new Date(msg.meta.ts).getTime() : Infinity;
      if (msgTime < this._connectTime) return; // This kills the "replay" feature!
      ...
  });
  ```
- **Suggestion**: Remove the `msgTime < this._connectTime` check. The `ChallengeDeduplicator` in the library is already designed to handle the rapid replay of buffered messages and prevent duplicate notifications.

## 4. Redundant/Inconsistent State in `lobby.html` Reducer

**Issue**: The `reduce` function in `lobby.html` and the `LobbyController` have overlapping responsibilities for managing the "current match".

- **Finding**: When `acceptChallenge` is called in `LobbyController`, it manually dispatches `MATCH_SET`. However, the reducer ALSO tries to handle `m.type === 'accept'`.
- **Bug**: In the reducer:
  ```javascript
  } else if (m.type === 'accept' && !state.currentMatch) {
      ...
      return {
          ...state, challenges: C,
          currentMatch: { ..., isFirst: m.recipientId === action.myId }
      };
  ```
  If Alice (challenger) receives the `accept` message, `m.recipientId` is Alice, so `isFirst` becomes `true`. This is correct.
  If Bob (recipient) sends the `accept` message, his own reducer might see his own message (if Nchan loops back). If it does, `m.recipientId` is Alice, which is NOT Bob's ID, so `isFirst` becomes `false`. This also happens to be correct for Bob.
- **Suggestion**: Ensure that the library's `onChallenge` reliably delivers the `accept` message to both parties, or clarify if the sender of `accept` should rely on their own local state transition.

## 5. UI/UX: Missing "Declined" state for recipient

**Issue**: When a user declines a challenge, it immediately disappears from their UI, but the challenger sees a "Declined" banner.
- **Suggestion**: While functional, it might be better if the recipient also got some confirmation that the decline was sent successfully before it disappears.

## 6. Table ID Mismatch Risk

**Issue**: In `lobby.html` reducer, when processing `accept`, it tries to find the original `options` from the `challenges` map using `tableId`.
- **Finding**:
  ```javascript
  const options = m.options || (pending?.tableId === m.tableId ? pending.options : undefined);
  ```
  If the `accept` message itself contains the `options` (which it should, according to `src/lobby.ts`), this is safe. But if it relies on the local `pending` state, it might fail if the page was refreshed and the "offer" hasn't been replayed/processed yet.
- **Suggestion**: Ensure `accept` messages always carry the full `options` and `ruleType`.
