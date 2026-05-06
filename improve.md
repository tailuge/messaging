# Improvements for Lobby Implementation

Based on a review of the specification documents (`MESSAGING_SPEC.md`, `ACCEPT_DECLINE.md`, `challenge.md`, `launch.md`) and the current implementation in `docker/html/lobby.html` and `src/lobby.ts`, several inconsistencies and bugs have been identified.


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

