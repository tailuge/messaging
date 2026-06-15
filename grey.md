# Delayed Leave Implementation Plan (Grey Mode)

This plan outlines the minimal changes required to implement a 5-second "unknown" state when a player leaves the lobby, using only one new state property: `isLeaving`.

## 1. Data Model Changes (`src/types.ts`)
- Add `isLeaving?: boolean` to the `PresenceMessage` interface.

## 2. Library Logic (`src/lobby.ts`)
- Add a private `leaveTimers: Map<string, any>` to the `Lobby` class to track pending removals.
- Modify `handlePresenceUpdate(msg: PresenceMessage)`:
  - **On 'leave' message**:
    - Do not delete the user immediately.
    - Set `existing.isLeaving = true` on the cached user object.
    - Schedule a 5-second `setTimeout`:
      - After 5s: `this.users.delete(userId)` and `this.notifyListeners()`.
    - Call `this.notifyListeners()` immediately to trigger the UI "grey" state.
  - **On any other message (join/heartbeat)**:
    - If a leave timer exists for this `userId`, `clearTimeout` it and remove from `leaveTimers`.
    - Ensure the incoming/existing user object has `isLeaving` set to `false` or `undefined`.
    - Call `this.notifyListeners()` as normal.

## 3. UI Styling (`src/client/styles.js`)
- Add a CSS class `.is-leaving` to `USER_LIST_STYLES`:
  ```css
  .is-leaving { filter: grayscale(1); opacity: 0.6; pointer-events: none; }
  ```

## 4. Component Update (`src/client/online-panel.js`)
- In `UserList._row(u)`, apply the `is-leaving` class to the `<li>` element if `u.isLeaving` is true.
  - Example: `class="${u.isLeaving ? 'is-leaving' : ''}"`
- This ensures the player appears grey and cannot be challenged while in the leaving state.

## 5. Summary
- **Single New State**: Only `isLeaving: boolean` is added to the user presence object.
- **Minimal Logic**: The lobby manages a timer to transition from `isLeaving=true` to deletion.
- **Cancellation**: Rejoining naturally clears the timer and resets `isLeaving`.
