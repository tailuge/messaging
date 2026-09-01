# Reusing the Online Users Panel in Arena

## Goal

Arena should provide the same online-player and chat experience as the Lobby:

- Show all online users, including users outside the current Arena.
- Allow users to open chat with online players.
- Keep table spectating available where applicable.
- Hide challenge buttons and challenge UI in Arena.
- Preserve Arena-specific pairing and leaderboard behavior.

The Arena leaderboard should remain a separate component. It represents Arena standings and participant state; it should not become responsible for global presence or chat.

## Current architecture

### `online-panel`

`src/client/online-panel.js` is more than a visual user list. It currently owns:

- A `MessagingClient` instance.
- Lobby connection setup in `connectedCallback()`.
- Lobby cleanup in `disconnectedCallback()`.
- Joining the presence channel.
- Presence/user updates.
- Challenge message handling.
- Challenge offers, acceptance, decline, cancellation, and auto-challenge behavior.
- Unread chat state.
- Rendering of `user-list`, `message-modal`, challenge banners, and challenge modals.

The Lobby uses it as a self-contained feature:

```html
<online-panel class="panel"></online-panel>
```

### `ArenaView`

`src/client/tournament/arena-view.js` already owns a separate presence lifecycle:

- Creates its own `MessagingClient`.
- Calls `joinLobby()`.
- Updates presence with `arenaId`.
- Tracks `_onlineUsers` for Arena pairing and stale-participant detection.
- Handles Arena-specific challenge messages and pairing.
- Calls `leave()` and stops its client on disconnect.

The Arena leaderboard is presentational. It receives standings, participants, online users, and countdown data; it does not own messaging.

## Main problem

Rendering the current component directly inside Arena would create two independent lobby sessions for the same browser user:

```text
ArenaView
├── Arena MessagingClient + Lobby
└── <online-panel>
    └── another MessagingClient + Lobby
```

This creates several risks:

1. **Conflicting presence updates**

   Arena joins and updates presence with `arenaId`. The nested `online-panel` joins without `arenaId`. The two sessions can overwrite or race with each other, making the user's Arena status unreliable.

2. **Duplicate lifecycle cleanup**

   Arena calls `leave()` for its connection, while `online-panel` calls `leave()` for its own connection. Disconnect order and heartbeat timing become harder to reason about.

3. **Duplicate challenge listeners**

   Arena needs challenge messages for pairing. `online-panel` also listens for challenges and may show banners, open challenge flows, or process auto-challenge URL state.

4. **Duplicated presence state**

   Arena and `online-panel` maintain separate user snapshots. The leaderboard/pairing view and the online list could briefly disagree.

5. **Unnecessary lobby behavior**

   Arena needs chat, outsiders, and spectating, but does not need ordinary challenge controls or the panel's automatic challenge behavior.

A `hide-challenge-button` attribute by itself would solve only the visible button. It would not solve the duplicate connection and lifecycle problem.

## What overlaps with the leaderboard?

There is little direct component overlap:

- The leaderboard displays Arena standings and participant status.
- Arena owns pairing and Arena challenge logic.
- The online panel displays global presence and provides chat/spectate interactions.

The important shared data is `_onlineUsers`. Arena already needs this data for pairing and stale-participant checks. Reusing the same snapshot for the online panel would be preferable to maintaining a second subscription.

The online panel should not move leaderboard logic into itself, and the leaderboard should not absorb chat or global presence logic.

## Reuse options

### Option 1: Render the current `online-panel` directly in Arena

```html
<online-panel hide-challenge-button></online-panel>
```

#### Pros

- Smallest apparent UI change.
- Reuses all existing online list and chat markup.
- Fast to prototype.

#### Cons

- Creates a second `MessagingClient` and lobby connection.
- Can overwrite Arena presence because it joins without `arenaId`.
- Duplicates challenge listeners and lifecycle cleanup.
- Hiding one button does not disable challenge banners, modals, or auto-challenge behavior.
- Arena and the panel maintain separate user snapshots.

#### Assessment

Not recommended for production. Acceptable only as a short-lived visual prototype if presence behavior is not tested, but the lifecycle risk is too high for the final implementation.

---

### Option 2: Let `online-panel` accept an externally owned Lobby connection

Arena would continue owning its connection:

```html
<online-panel
    .lobby=${this._lobby}
    .users=${this._onlineUsers}
    .showChallengeActions=${false}
    .showChallengeNotifications=${false}
></online-panel>
```

The panel would retain its existing self-contained behavior for Lobby use, but use the supplied connection in Arena.

Conceptually:

```js
ownsLobby = !this.lobby;
```

When the panel owns the lobby, it creates and leaves the connection. When Arena supplies the lobby, the panel only consumes it and must not call `leave()`.

#### Pros

- Avoids the second connection.
- Preserves Arena's `arenaId` presence updates.
- Allows Arena to share the same user snapshot and lobby object.
- Requires less architectural change than a full extraction.
- Keeps Arena pairing logic in `ArenaView`.

#### Cons

- `online-panel` still contains connection and presentation responsibilities.
- Its public property/state synchronization needs careful design.
- It must distinguish internally owned versus externally owned lifecycle.
- The panel currently uses a reducer and internal callbacks, so accepting external users requires moderate refactoring.
- Challenge behavior needs more than a single hidden button.

#### Assessment

Best transitional option and likely the smallest safe production change.

---

### Option 3: Extract a reusable online-users/chat view from `online-panel`

Split the current component into reusable presentation and Lobby-specific orchestration:

```text
OnlinePanelController / Lobby connection
├── MessagingClient
├── presence subscription
├── chat state
└── challenge state

OnlineUsersView
├── user-list
├── chat entry points
└── optional spectate actions

ChallengeControls
├── challenge banner
├── challenge modal
└── challenge actions
```

Lobby could compose all of them, while Arena could compose only the reusable user/chat view and retain its own connection.

#### Pros

- Cleanest separation of lifecycle, state, and UI.
- Challenge functionality becomes explicitly optional rather than hidden through conditionals.
- Arena and Lobby can share exactly the same users/chat experience.
- Easier to test and extend for spectators, other tournaments, or future game modes.
- Avoids screen-specific checks such as `if (arena)` inside a generic component.

#### Cons

- Largest initial refactor.
- Requires deciding where presence, chat, and unread state live.
- May touch `online-panel.js`, `user-list.js`, `message-modal.js`, and related tests.
- More implementation work than the immediate feature requires.

#### Assessment

Best long-term architecture if online users and chat will appear in more than two contexts.

---

### Option 4: Add a dedicated Arena online-users component

Create an Arena-specific component that uses Arena's existing `_lobby` and `_onlineUsers` but reimplements the relevant list/chat UI.

#### Pros

- No risk of changing Lobby behavior.
- Full control over Arena layout.
- Can show Arena participants and outsiders differently if needed.

#### Cons

- Duplicates online list and chat rendering.
- Bug fixes and UX changes must be applied in two places.
- Presence/chat behavior can drift between Lobby and Arena.
- Higher long-term maintenance cost.

#### Assessment

Only justified if Arena's UX will diverge substantially from Lobby. It is not necessary for the current requirement.

---

### Option 5: Move the online panel into the shared parent or page shell

Create one long-lived lobby/presence connection above both Lobby and Arena, then provide its state to whichever screen is active.

#### Pros

- One canonical presence connection.
- Chat/unread state can persist while navigating between views.
- Avoids reconnecting when switching screens within the same application shell.

#### Cons

- The current Lobby and Arena are separate HTML entry points/pages.
- Requires broader application-shell changes.
- Lifecycle becomes more global and harder to reason about.
- Not appropriate unless navigation is also being consolidated.

#### Assessment

A possible future direction, but excessive for this feature.

## Recommended direction

Use **Option 2** now, with a path toward **Option 3** if more reuse is expected.

### Immediate design

1. Keep Arena as the owner of its existing `MessagingClient` and lobby connection.
2. Allow `online-panel` to receive the existing lobby connection and online-user snapshot.
3. Prevent the panel from joining or leaving when the connection is externally owned.
4. Disable challenge actions and challenge notifications in Arena.
5. Keep chat, outsiders, and spectating enabled.
6. Keep Arena pairing and challenge acknowledgement logic in `ArenaView`.
7. Keep `arena-leaderboard` unchanged.

Suggested capabilities:

```js
{
    chat: true,
    spectate: true,
    challenge: false,
    challengeNotifications: false,
}
```

A simpler first API could use two properties:

```js
showChallengeActions = true;
showChallengeNotifications = true;
```

Arena would set both to `false`.

### Important lifecycle rule

Only one component may own the Arena lobby connection:

```text
ArenaView owns:
  MessagingClient
  joinLobby()
  updatePresence({ arenaId })
  leave()

OnlinePanel consumes:
  the existing Lobby
  the existing user snapshot
```

The panel must never call `leave()` on an externally supplied connection.

## Chat state considerations

`message-modal` already accepts a Lobby object, so it should be reusable with Arena's existing `_lobby` as long as the same messaging API is retained.

Unread counts are currently local to `online-panel`. That is sufficient for displaying chat in Arena. If unread counts must persist across page navigation, they should eventually move into a shared store; that is independent of the initial reuse work.

## UX decisions

The requested behavior implies a global online panel in Arena:

- Show users outside the current Arena.
- Allow chat with any visible user.
- Preserve spectating links for users at tables.
- Do not expose normal challenge controls or challenge banners.

The Arena leaderboard can remain focused on Arena participants and standings. The two panels should be visually adjacent but conceptually separate.

## Final recommendation

Do not add the current self-contained `online-panel` unchanged to Arena. Reuse its user-list and chat functionality through Arena's existing Lobby connection, while making challenge UI opt-in or explicitly disabled. This avoids presence collisions, keeps leaderboard and pairing responsibilities isolated, and provides a relatively small path to a cleaner shared component later.
