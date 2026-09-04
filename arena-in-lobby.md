# Arena-in-Lobby Panel Plan

> Goal: clicking **Join** on an active arena in the lobby opens an in-lobby panel showing
> the arena leaderboard with **Pair / Join / Leave / Chat** controls — instead of
> redirecting to `arena.html`. The arena pairing logic is reworked to run against the
> main lobby presence system (the single lobby connection the OnlinePanel already owns).

---

## 1. Current Architecture

| Piece | File | What it does |
|-------|------|--------------|
| Arena row + Join button | `src/client/active-arenas.js` | `arenaRow()` renders each arena as `<a href="arena.html?tournamentId=...">` with a Join button. Clicking navigates away from the lobby. |
| Arena page shell | `src/client/tournament/arena.js` | `arena-app` — create form, active/completed lists; with `?tournamentId` renders `<arena-view>` + `<arena-chat>`. |
| Leaderboard + join/leave + pairing | `src/client/tournament/arena-view.js` | Fetches `/api/arena/:id`, renders leaderboard, Join/Leave Arena buttons, Pair button, pairing countdown overlay, beserk toggle. **Owns a second `MessagingClient` + `joinLobby()`** for arena presence. |
| Arena chat | `src/client/arena-chat.js` | WebSocket to `/subscribe/arena/:arenaId`, POSTs to `/publish/arena/:arenaId`. Standalone — no presence dependency. |
| Main lobby connection | `src/client/online-panel.js` | Owns the lobby `MessagingClient`/`Lobby` (presence + challenges + chat) for the whole page. |
| Presence model | `src/types.ts`, `src/lobby.ts` | `PresenceMessage.arenaId` already exists; `Lobby.hasMeaningfulChange()` already treats `arenaId` changes as meaningful; `user-list.js` already renders a ⚔️ arena badge. |

Key observation: `arena-view` and `arena-chat` are already standalone Lit custom elements.
The heavy lifting is **reuse, not rewrite** — the work is (a) hosting them in a lobby
panel, (b) feeding `arena-view` the lobby's existing presence connection instead of a
second one, and (c) routing arena challenge messages so they don't collide with the
lobby's own challenge banner.

---

## 2. Design Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Panel component | New `src/client/arena-panel.js` composing the existing `<arena-view>` + `<arena-chat>` | Reuse over rewrite; both already work standalone. |
| 2 | Presentation | Expandable panel section in the lobby grid (replaces/expands the arenas row while open). Modal overlay is the fallback. | Consistent with the single-page lobby; keeps OnlinePanel visible so users can see presence while pairing. |
| 3 | Lobby connection | **Inject the OnlinePanel's `Lobby` instance** into `arena-view` (embedded mode). No second `MessagingClient`. | One presence identity per tab; two clients with the same userId would fight over heartbeats and both receive every challenge. |
| 4 | Challenge routing | Offers carrying `options.tournamentId` are arena-pairing offers → handled only by the arena panel. OnlinePanel's challenge banner ignores them. Normal offers (no `tournamentId`) keep flowing to the banner. | Both handlers share one lobby subscription, so each must filter; `tournamentId` is already the arena marker used by `_handleIncomingChallenge`. |
| 5 | Close-panel behavior | Closing the panel keeps the user **joined** to the arena (presence `arenaId` stays set). Explicit **Leave Arena** button exits. | In-lobby there is no page unload to piggyback on; silently leaving on close would be surprising mid-arena. `arena.html` standalone keeps its unload-leave behavior. |
| 6 | Switching arenas | Re-opening the panel on a different arena re-targets `arenaId`, cancels any pending pairing, resets the one-shot stale refetch. | Mirrors navigating to a different `arena.html?tournamentId=`. |
| 7 | Pairing selection logic | Extract the candidate-selection math from `arena-view` into a pure module `src/client/arena-pairing.js` (leaderboard rows + arena player records + shared lobby presence in → candidates/diagnostics out). | Independently testable (same pattern as `UserSlotManager`); the rework to the "main lobby presence system" is exactly this: read `onlineUsers` from the shared lobby instead of a private presence connection. |
| 8 | Bots | Unchanged (`BOT_IDS`/`BOT_NAMES` in `arena-view`; bots appear in the shared lobby user list too). | Existing behavior preserved. |
| 9 | Create-arena + completed arenas | Stay on `arena.html` (out of scope). | Request targets join → leaderboard/pair/chat only. Follow-up candidate. |
| 10 | Join button markup | `arenaRow` keeps the anchor href (deep-link / escape hatch to the full page) **and** its Join button dispatches a `arena-join` CustomEvent. | One shared markup file serves both lobby (open panel) and arena page (navigate) via different listeners. |

---

## 3. Pairing Rework (fits the main lobby presence system)

Today `arena-view` builds its own presence view (`_onlineUsers`) from a private
`joinLobby()` and mixes it with the arena leaderboard + player records in
`_getPairingCandidates()`. In-lobby, the candidate source becomes the **shared lobby's
`users` list**, which already contains every online user (including bots) plus
`arenaId`/`tableId`/`meta`.

Extracted pure module — `src/client/arena-pairing.js`:

```js
// Inputs are plain data — no DOM, no Lit, no Nchan. Unit-testable like UserSlotManager.
getPairingCandidates({ leaderboard, arenaPlayers, onlineUsers, myId, botIds })
// → { candidates: [{ playerId, name, custom }], diagnostics: [...] }
// Same rules as today:
//   - skip self; skip inactive players (record.active === false)
//   - bots are always eligible when in the leaderboard
//   - humans eligible only when present in onlineUsers and not playing (no tableId)
//   - prefer humans as a group; fall back to bots
```

Everything else about pairing stays in `arena-view` and is unchanged in shape:
countdown (10s / 5s human), beserk toggle, opponent-history weighting
(`localStorage.arena_opponents_<id>`), random selection among least-played, `Pair`
button gating (`joined && active && arena active && not already pairing`), and the
pairing overlay UI. `_initiateChallenge` keeps both paths (bot → direct `gameUrl`,
human → `lobby.challenge(...)` with `options.tournamentId`), but calls the **injected**
lobby in embedded mode.

---

## 4. Component & Wiring Changes

### 4.1 `src/client/active-arenas.js`
- Join button in `arenaRow()` dispatches `arena-join` (`detail: { arenaId }`, bubbles,
  composed) instead of relying only on the anchor navigation. Keep the anchor href
  (`arena.html?tournamentId=...`) as the deep-link/full-page fallback.

### 4.2 `src/client/online-panel.js` — lobby sharing + routing
- Publish the connected `Lobby` for reuse: after `joinLobby()` resolves, dispatch a
  composed `lobby-ready` CustomEvent with the instance (or hand it to a tiny shared
  holder module). `LobbyApp` captures it and passes it down.
- In the `onChallenge` handler (and the banner render path), **ignore offers whose
  `options.tournamentId` is set** — those are arena-pairing offers handled by the arena
  panel. All other challenge flows are untouched.
- No other presence logic changes.

### 4.3 `src/client/tournament/arena-view.js` — embedded mode
- New optional property `lobby` (the shared `Lobby`) plus `embedded: { type: Boolean }`.
- When `lobby` is provided:
  - Skip `_connectPresence()`/`_presenceClient` entirely.
  - Register `onUsersChange` / `onChallenge` handlers on the shared lobby (same
    callbacks as today, minus the private-client teardown).
  - `_syncArenaPresence()` calls `lobby.updatePresence({ arenaId })` on the shared
    lobby → the main presence system now carries arena state; the lobby's ⚔️ badge,
    `hasMeaningfulChange`, and other tabs' views all update for free.
  - Pairing candidate source = shared lobby users list (via `arena-pairing.js`).
- Standalone mode (`arena.html`) keeps today's private connection — one code path,
  two connection modes.
- `disconnectedCallback` must not call `leave()` on a shared lobby (only in standalone
  mode).

### 4.4 New `src/client/arena-panel.js`
- Lit element wrapping `<arena-view lobby=... arenaId=...>` + `<arena-chat arenaId=...>`.
- Panel chrome: title row (arena rule + creator + countdown + end time), Close button,
  and a "Open full page ↗" link to `arena.html?tournamentId=...`.
- Renders the existing pairing overlay, Join/Leave/Pair buttons and leaderboard
  unchanged (they come from `arena-view`).
- Chat reuses `arena-chat` as-is; constrain its height in panel CSS.

### 4.5 `src/client/lobby.js`
- State `_arenaPanelId`; listen for `arena-join` events (from `active-arenas`) and
  `lobby-ready` (from `online-panel`).
- Render `<arena-panel>` (expandable section in the grid, replacing the arenas row
  while open) when an arena is selected; pass the captured shared lobby.
- If the panel is opened before `lobby-ready`, defer rendering until the lobby
  connection resolves (or render and let `arena-view` wait).

### 4.6 `src/client/user-list.js`
- The ⚔️ arena status link currently navigates to `arena.html?tournamentId=...`.
  Change it to dispatch `arena-join` so clicking another user's arena badge opens the
  same panel (consistency with the new flow).

### 4.7 `src/client/styles.js`
- Panel styles (expandable section / modal overlay variant), consistent with
  `THEME_VARS` and the existing lobby grid.

---

## 5. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Panel opened before lobby connection settles | Wait for `lobby-ready`; `arena-view` fetches arena data independently so only presence/pairing waits. |
| Arena expires while panel open | Existing `_isExpired()` path: show final standings + podium, hide Pair/Join buttons. |
| User not joined | Show Join Arena button (POST `/api/arena/:id/join`); after join, show Leave + Pair. |
| Incoming human challenge during countdown | Existing precedence in `_handleIncomingChallenge` (offer supersedes countdown) — works unchanged; OnlinePanel banner must not also surface it (routing rule 4.2). |
| Arena offer arrives with panel closed | OnlinePanel ignores it (always filtered by `options.tournamentId`); stale arena challenges simply expire. |
| Switching arenas / reopening on another arena | Cancel pairing, reset stale-refetch flag, update `arenaId` presence via shared lobby. |
| Opponent accepts arena challenge while panel open | `_handleArenaChallengeMessage` launches `gameUrl` (existing flow) — redirect still works from the lobby. |
| Closing panel while joined | Presence `arenaId` stays set; user remains in leaderboard. Leave Arena button (or reopening the panel) to exit. |

---

## 6. Testing

| Layer | What |
|-------|------|
| Unit (Jest) | New `test/arena-pairing.spec.ts` for the extracted pure logic: human-preference, bot fallback, playing-exclusion, inactive-exclusion, self-exclusion, diagnostics output. No Docker/DOM needed (mirrors `user-slot-manager.spec.ts`). |
| Integration (Jest) | Existing `messagingclient.spec.ts` / `nchanclient.spec.ts` must stay green (no library changes expected). |
| Browser (Playwright) | Open lobby → click Join on an active arena row → assert no navigation, panel shows leaderboard + Pair/Join buttons + chat. Optionally: pair two tabs and verify the accept flow launches the game. |
| Manual | 2+ tabs in lobby: join same arena, pair, beserk, chat, leave; verify ⚔️ presence badge appears in the user list while joined; verify closing the panel keeps join state. |

---

## 7. Implementation Phases

### Phase 1 — Extract pairing logic (no existing-code changes)
1. Create `src/client/arena-pairing.js` with `getPairingCandidates()`.
2. Create `test/arena-pairing.spec.ts` — all unit tests pass.

### Phase 2 — Make `arena-view` embeddable
3. Add `lobby` property + `embedded` mode; skip private connection; rewire
   `onUsersChange`/`onChallenge`/`_syncArenaPresence`/pairing to the injected lobby.
4. Ensure standalone `arena.html` mode still works unchanged.

### Phase 3 — Lobby sharing + challenge routing
5. `online-panel.js`: emit `lobby-ready`; filter `options.tournamentId` offers from the
   challenge banner.

### Phase 4 — Panel + wiring
6. Create `src/client/arena-panel.js` (compose `arena-view` + `arena-chat`).
7. `active-arenas.js`: Join button dispatches `arena-join` (keep anchor href).
8. `lobby.js`: capture lobby, hold `_arenaPanelId`, render the panel.
9. `styles.js`: panel styles.

### Phase 5 — Polish
10. `user-list.js`: ⚔️ badge opens the panel instead of navigating.
11. Handle expired-arena view, close-vs-leave behavior, deep-link
    (`lobby.html?tournamentId=...` auto-opens panel — nice-to-have).

### Phase 6 — Verification
12. `npm run lint`, `npm run test`, `npm run test:debug`, manual 2-tab smoke test.

---

## 8. Out of Scope / Follow-ups

- Moving the **create-arena form** and **completed-arenas list** into the lobby
  (natural next step once the panel exists).
- Adding arena pairing to the library (`src/lobby.ts`) itself — not required: pairing
  is client-side composition of existing `challenge()` + presence data.
- `arenaId`-aware filtering in `src/lobby.ts` — not required; filtering lives in the
  two UI handlers (decision #4).