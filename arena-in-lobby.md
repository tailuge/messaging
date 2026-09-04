# Arena-in-Lobby Plan (Simplified)

> **Goal**: Clicking **Join** on an active arena in the lobby opens an in-lobby panel showing
> the arena leaderboard with **Pair / Join / Leave / Chat** controls — instead of
> redirecting away from the lobby.
>
> **Core Simplifications**:
> 1. **Only 1 active arena at a time supported** — no multi-arena switching or complex multiplexing.
> 2. **`arena.html` kept strictly as a management page** — create arenas, view active/completed lists; playing/pairing runs exclusively in the lobby.
> 3. **Single-mode `arena-view`** — `arena-view` consumes the shared lobby connection from `online-panel.js` directly (no standalone dual-mode, no second `MessagingClient`).
> 4. **No extraction of pairing math** — reuse existing candidate selection and pairing countdown in `arena-view.js` as-is against shared lobby presence.
> 5. **Clean challenge filtering** — 1-line check in `online-panel.js` to ignore arena pairing offers (`options.tournamentId`), which are handled by `arena-view`.

---

## 1. Architecture Overview

| Component | File | Role in Simplified Design |
|---|---|---|
| **Active Arenas Row** | `src/client/active-arenas.js` | Renders the active arena row; clicking Join dispatches `arena-select` with `{ arenaId }`. |
| **Arena Panel** | `src/client/arena-panel.js` *(new)* | Simple wrapper composing `<arena-view>` + `<arena-chat>` with a "✕ Close" button and "Manage Arenas ↗" link. |
| **Arena View** | `src/client/tournament/arena-view.js` | Receives `.lobby` from the lobby page. Handles leaderboard, Join/Leave, Pairing (with countdown/beserk), and auto-accepting arena challenges. |
| **Arena Chat** | `src/client/arena-chat.js` | Connects directly to `/subscribe/arena/:arenaId` (unchanged). |
| **Main Lobby** | `src/client/lobby.js` | Holds `_activeArenaId` state; switches between `<active-arenas>` and `<arena-panel>`; listens for `arena-select` and `lobby-ready`. |
| **Online Panel** | `src/client/online-panel.js` | Owns the single `Lobby` connection; exposes `get lobby()`; ignores offers where `options.tournamentId` is present. |
| **Management Page** | `src/client/tournament/arena.html` & `arena.js` | Create Arena form + Active/Completed lists. Links to `lobby.html?tournamentId=...` for play. `<arena-view>` and `<arena-chat>` removed. |

---

## 2. Key Design Decisions

1. **Only 1 Active Arena at a Time**
   - The system only seeds or supports 1 active arena at a time (e.g., hourly mini/standard).
   - The lobby only needs a single `_activeArenaId` state. No arena switching logic or multiplexing.

2. **`arena.html` as Management Only**
   - `arena.html` serves exclusively as the admin/management view (Create Arena form, Active Arenas list, Completed Arenas list).
   - Links point to `lobby.html?tournamentId=...` to join/play.
   - Eliminates the need for `arena-view` to support "standalone mode" or private `MessagingClient` creation.

3. **Inject Shared `Lobby` into `arena-view`**
   - `online-panel.js` establishes the single WebSocket presence connection for the tab.
   - When connected, `online-panel.js` exposes `get lobby() { return this.#lobby; }` and dispatches `lobby-ready`.
   - `arena-view` receives `lobby` and binds its listeners (`onUsersChange`, `onChallenge`, `updatePresence`, `challenge`, `acceptChallenge`).
   - `disconnectedCallback()` in `arena-view` does **not** call `lobby.leave()` (closing the panel does not leave the lobby or the arena).

4. **1-Line Challenge Routing**
   - In `online-panel.js` challenge listener:
     ```js
     if (msg.options?.tournamentId) return; // Handled by arena-view
     ```
   - Standard lobby challenge banner ignores arena pairing offers.
   - `arena-view` already filters incoming challenges by `msg.options?.tournamentId === this.arenaId`.

5. **Reuse Existing Pairing Logic in `arena-view.js`**
   - No separate `arena-pairing.js` module or new unit-test suite.
   - `arena-view.js` already has clean candidate selection (`_getPairingCandidates`), history weighting (`localStorage`), countdown timer, Beserk button, and direct bot launch.
   - Candidates are evaluated against `this._onlineUsers`, populated directly from `this.lobby.onUsersChange`.

6. **Panel Close vs. Leave Arena**
   - **Close Panel ("✕ Close")**: Sets `_activeArenaId = null` in `lobby.js`. The panel collapses to the compact row. The user's presence retains `arenaId` if joined.
   - **Leave Arena ("Leave Arena" button)**: Calls `arena-view`'s `_leave()`, which removes the user from the arena participant list and clears `arenaId` in presence (`lobby.updatePresence({ arenaId: undefined })`).

---

## 3. Implementation Steps

### Step 1: `src/client/online-panel.js`
- Add `get lobby() { return this.#lobby; }`.
- In `_connect()`, dispatch `lobby-ready` (`bubbles: true, composed: true, detail: this.#lobby`) once `#lobby` is joined.
- In `#lobby.onChallenge(msg => ...)`:
  ```js
  if (msg.options?.tournamentId) return;
  ```

### Step 2: `src/client/tournament/arena-view.js`
- Declare `lobby` property (`static properties = { lobby: { type: Object }, ... }`).
- In `connectedCallback()`:
  - Remove private `_connectPresence()` / `MessagingClient` instantiation.
  - Wire listeners to `this.lobby`:
    ```js
    this.lobby.onUsersChange(users => {
        this._onlineUsers = [...users, { userId: userStore.clientId, userName: userStore.userName, custom: this._localCustom }];
        this._checkStaleArenaPresence();
    });
    this.lobby.onChallenge(msg => {
        if (msg.type === 'offer') this._handleIncomingChallenge(msg);
        else this._handleArenaChallengeMessage(msg);
    });
    ```
- In `_syncArenaPresence()`: update presence using `this.lobby.updatePresence({ arenaId })`.
- In `_leave()`: clear presence using `this.lobby.updatePresence({ arenaId: undefined })`.
- In `disconnectedCallback()`: do **not** call `this._lobby?.leave()`. Only clear local timers.

### Step 3: `src/client/arena-panel.js`
- Create a lightweight container element:
  - Header: Arena title / meta, "✕ Close" button (dispatches `close` event), and link to `arena.html` ("Manage Arenas ↗").
  - Content: `<arena-view .arenaId=${this.arenaId} .lobby=${this.lobby}></arena-view>` and `<arena-chat .arenaId=${this.arenaId}></arena-chat>`.

### Step 4: `src/client/active-arenas.js` & `src/client/lobby.js`
- `active-arenas.js`: Join button dispatches `arena-select` event with `{ arenaId: arena.id }`.
- `lobby.js`:
  - Track `_activeArenaId` and `_lobby`.
  - Listen for `lobby-ready` from `online-panel` to store `_lobby`.
  - Listen for `arena-select` to set `_activeArenaId`.
  - Check URL query parameters on load (`?tournamentId=` or `?arena=`) to auto-open the arena panel.
  - In `render()`:
    - If `_activeArenaId` is set: render `<arena-panel .arenaId=${this._activeArenaId} .lobby=${this._lobby} @close=${() => this._activeArenaId = null}>`.
    - Otherwise: render `<active-arenas>`.

### Step 5: `src/client/user-list.js`
- Update ⚔️ status link to emit `arena-select` with `arenaId` so clicking a user's arena badge opens the in-lobby panel.

### Step 6: `src/client/tournament/arena.js` & `arena.html`
- Simplify `arena-app` to strictly serve as the management page:
  - Create Arena form (`arena-create-form`).
  - Active Arenas list (with links to `lobby.html?tournamentId=...`).
  - Completed Arenas list.
  - Remove `<arena-view>` and `<arena-chat>` references.

---

## 4. Verification

1. `npm run test` & `npm run lint` — verify no syntax or unit test breakages.
2. Two-tab lobby test:
   - Tab 1 opens active arena, joins, sees ⚔️ badge.
   - Tab 2 clicks ⚔️ badge or Join button → opens panel in Tab 2.
   - Pair button initiates countdown and auto-pairs both tabs into a game table.
   - Closing panel preserves joined state; clicking "Leave Arena" clears it.
3. `arena.html` test:
   - Create Arena works and directs players to the lobby.