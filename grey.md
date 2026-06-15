# Delayed Leave Implementation Plan (Grey Mode)

This plan outlines the minimal changes required to implement a 5-second "unknown" state when a player leaves the lobby.

## 1. Data Model Changes (`src/types.ts`)
- Add `isLeaving?: boolean` to the `PresenceMessage` interface.
- Update `UserStatus` type to include `'unknown'`.
- Update `userStatus()` helper to return `'unknown'` if `user.isLeaving` is true.

## 2. Library Logic (`src/lobby.ts`)
- Add a private `leaveTimers: Map<string, any>` to `Lobby` class.
- Modify `handlePresenceUpdate(msg: PresenceMessage)`:
  - When `msg.type === 'leave'`:
    - Find the `existing` user in the `this.users` map.
    - If found:
      - Set `existing.isLeaving = true`.
      - Clear any existing timer for this user.
      - Schedule a 5-second timeout to perform the actual deletion (`this.users.delete(userId)`) and call `this.notifyListeners()`.
      - Trigger `this.notifyListeners()` immediately so the UI can reflect the "unknown" state.
  - When `msg.type === 'join'` or any message that implies presence:
    - Check if a leave timer exists for the `userId`.
    - If it exists, `clearTimeout` and remove it from the map.
    - Ensure the user object in `this.users` does not have `isLeaving: true`.

## 3. UI Styling (`src/client/styles.js`)
- Add a CSS class `.leaving` to `USER_LIST_STYLES` that applies `filter: grayscale(1); opacity: 0.6; pointer-events: none;`.

## 4. Component Update (`src/client/online-panel.js`)
- In `UserList._row(u)`, check if `userStatus(u) === 'unknown'`.
- Apply the `leaving` class to the `<li>` element if the status is unknown.
- The `pointer-events: none` in CSS will naturally disable the "Challenge" button for these users.

## 5. Summary
- **Minimal Changes**: One new boolean field in the message, one new derived status, and a timer management map in the lobby.
- **Behavior**: Receiving a 'leave' signal transitions the player to 'unknown' (grey in UI). Rejoining within 5s cancels the removal.
