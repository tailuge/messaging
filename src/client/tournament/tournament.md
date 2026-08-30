# Tournament Creation & Registration

## Overview

Build a standalone single-page tournament UI using the Google Lit framework. Follow the Lit patterns and styling conventions already used elsewhere in the application.

This phase covers only tournament setup and registration. It must not implement actual games, matchmaking, match results, or tournament progression.

## Directory

```text
src/client/tournament/
```

The page should be independently accessible and reuse existing shared client modules and styles where appropriate.

## Create Tournament

Provide a `Create Tournament` form with:

- **Game type** — select from the existing supported game types in the application.
- **Tournament size** — select a power-of-two size: `4`, `8`, `16`, or `32` players.
- **Create** button.

When the tournament is created:

1. Generate a unique tournament ID.
2. Persist the tournament in the application's existing KV store.
3. Generate a shareable URL containing the tournament ID.
4. Redirect to, or display, the newly created tournament page.

## Tournament Data

```ts
{
  id: string;
  gameType: string;
  size: number;
  status: "open" | "started";
  participants: { id: string; name: string }[];
  createdAt: number;
}
```

Use the application's existing KV storage mechanism. Do not introduce another database or storage library.

## Tournament Page

Display:

- Tournament title, game type, status (`OPEN` / `STARTED`).
- Registration count: `X / N players registered`.
- Shareable URL with a copy button.
- Registered player list.
- Display-only knockout bracket for the selected size.

The bracket shows empty slots filled in as players register. No match state, winners, or progression logic.

Example for 8 players:

```text
          ┌── Player 1 ──┐
Player 1 ─┤              │
Player 2 ─┘              ├── ?
                         │
          ┌── Player 3 ──┐
Player 3 ─┤              │
Player 4 ─┘              ┘

          ...etc...
```

## Joining

Anyone visiting a tournament URL can enter a display name and click `Join Tournament`.

Joining must:

- Add the visitor to the participant list in KV.
- Prevent duplicate participation.
- Reject registration when `status === "started"`.
- Update the page live so other participants see new joiners without a manual refresh.

Follow the application's existing real-time or polling conventions.

## Starting the Tournament

When registered participants reach the selected size, show a prominent `START TOURNAMENT` button.

Starting only changes `status: "open" -> "started"`, then:

- Disables further registration.
- Displays `STARTED` status.
- Keeps the bracket display-only.

## UI

- Use Lit; keep dependencies minimal.
- Styled to match the lobby: reuse [`styles.js`](../styles.js) CSS tokens and theme conventions (light/dark).
- Reuse lobby components where natural: [`user-badge.js`](../user-badge.js), [`user-store.js`](../user-store.js), [`utils.js`](../utils.js).
- Clean, compact, and feel like a real tournament page rather than an admin form.
- Accessible labels, button states, and status text throughout.

## Testing

- A small number of focused unit tests covering the three core flows: create, join, and start.
- Mirror the brevity of existing project tests — no heavy infrastructure, straightforward assertions.

## Out of Scope

- Actual games, matchmaking, match results, bracket advancement, or tournament progression for the knockout tournament.
- Authentication beyond existing user/display-name conventions.
- A new database, KV provider, or storage library.

# Arena Tournaments

## Overview

Create Arena tournaments as a separate standalone page at `src/client/tournament/arena.html`, visually inspired by the Lichess Arena tournament experience. The existing knockout tournament page and flow remain unchanged.

An Arena is a single, fixed-duration competition in which joined players play as many games as possible during a one-hour window. Each completed win awards one point; the highest-scoring eligible player wins. The Arena page is the player's central home before, during, and after the tournament: it shows the live leaderboard, matchmaking state, current score, and final results.

The Arena is **client-administered**:

- Clients discover available participants, select opponents, and drive the matchmaking loop.
- Players use the existing challenge and acceptance flow to resolve who gets to play; Arena does not add a separate claim or matchmaking protocol.
- The server/KV stores the Arena identity/timing, participant scores, and the bounded history of finished Arena results.
- There is no dedicated matchmaking worker, matchmaking server, long-lived server process, or second game system.
- Support multiple concurrent Arenas, each isolated by its Arena ID.

This is a plan only. Before implementation, inspect the existing challenge, table/game-result, and KV implementations and adapt their current contracts rather than creating parallel abstractions.

## Arena Page and Visual Experience

The Arena UI should resemble a Lichess Arena page without copying branding or assets:

- compact tournament header showing game type, status, and countdown;
- prominent `JOIN ARENA` button before joining;
- live leaderboard as the primary content area;
- current player's score and statistics clearly highlighted;
- matchmaking panel showing `Finding opponent…`, the selected opponent, and a return-to-Arena state after games;
- responsive layout that works on desktop and mobile;
- reuse the existing lobby theme tokens, light/dark conventions, typography, game assets, and top-left logo/header treatment.

The page must be a dedicated `arena.html` entry point, not a mode switch embedded in the knockout page. It may reuse shared modules and styles, but its markup and interaction model should be specific to Arena tournaments.

The Arena page should reuse the lobby's identity and presence UI so the current user appears online consistently:

- reuse `user-store.js` for the current user's identity and persisted display name;
- reuse `user-badge.js` and its supporting components/styles wherever appropriate for player names, flags, status, and online presence;
- initialize the existing presence/messaging client when the page loads and clean it up when the page is unloaded;
- use existing lobby presence/table state rather than inventing a separate Arena online-status model;
- reuse the same lobby logo/branding at the top-left, including its link and responsive/header styling.

When the Arena is finished, replace the active matchmaking presentation with a prominent top-three podium/medal display:

1. gold medal and first-place player;
2. silver medal and second-place player;
3. bronze medal and third-place player.

Keep the complete final leaderboard below or alongside the podium. If fewer than three eligible players exist, show only the available places. Bots are treated as normal players and may appear on the leaderboard and podium.

## Commonality with Existing Tournaments

Reuse the existing tournament page and conventions wherever the concepts overlap:

- Keep the standalone Lit page under `src/client/tournament/` and reuse the lobby theme tokens, shared styles, user store, game-type catalogue, accessibility conventions, and live-update approach.
- Reuse the existing tournament identity, game type, player identity/display-name, shareable-page, and status patterns where suitable.
- Keep the existing knockout tournament's registration and display-only bracket behavior unchanged; Arena should be a separate tournament mode/type rather than changing knockout semantics.
- Reuse the existing KV integration for the small Arena record and participant scores. Do not introduce another database, storage provider, claim primitive, or client-side-only source of truth for Arena scores.
- Reuse the existing `Lobby` challenge/acceptance flow and `MessagingClient.joinTable()` / `Table` game transport. Arena pairing should create an ordinary challenge/table session with optional Arena metadata, not a second challenge or game protocol.
- Reuse the existing authoritative game-result path. Arena scoring is an additional consumer of a completed result, not a replacement for game validation, game creation, or result calculation.
- Reuse existing presence/table state for the UI's available/playing indication; Arena does not persist a second availability state.

The important difference is progression: knockout tournaments are registered and then display a bracket, while an Arena repeatedly returns eligible players to matchmaking until the time window closes.

## Arena Data Model

Persist only the minimum shared state in the existing KV store. Arenas are addressed by ID so multiple Arenas can run concurrently. Use three namespaced working-key families plus one bounded result-history key:

```text
arena:{arenaId}          -> Arena metadata and participants
arena:{arenaId}:scores   -> scores for that Arena
arena:{arenaId}:scored   -> result/challenge IDs already scored for that Arena
arena:results            -> JSON map of finished Arena ID -> final result
```

The first three are per-Arena working keys. They must be cleaned up after finalization, so finished Arenas do not leave an unbounded number of keys behind. `arena:results` retains only the ten most recent finished Arena results. This means there are three logical Arena working-key schemas, not three literal Redis keys; concurrent Arenas necessarily create separate namespaced instances.

```ts
interface Arena {
  id: string;
  gameType: string;
  startTime: number;
  endTime: number;
  status: "scheduled" | "active" | "finished";
  players: ArenaPlayer[];
}

interface ArenaPlayer {
  playerId: string;
  points: number;
  games: number;
  wins: number;
}
```

The server does not retain Arena matchmaking, table, challenge, or game state. Existing challenge/table state and the authoritative game result remain responsible for the game itself. If duplicate result delivery is possible, use the existing result/challenge identity in `arena:{arenaId}:scored` or the simplest existing persistence convention to avoid scoring the same completed game twice; do not introduce a separate Arena match system solely for this purpose.

Each Arena is isolated by its ID: all metadata, score, and idempotency operations must use the same `arenaId`. Finished results are stored in `arena:results` as an ID-keyed JSON map. Each result should include the Arena metadata needed for history, the final leaderboard, and the final winner/podium data.

The server is authoritative for Arena membership, score updates, and Arena lifecycle. Clients may discover opponents and render state, but must not award points locally.

## Arena Lifecycle

### Creation and Scheduling

Provide an Arena setup/admin path using the existing tournament UI conventions. The MVP may create or schedule multiple Arenas with:

- an existing supported game type;
- a one-hour duration;
- `startTime`, `endTime`, and `status: "scheduled"` or `"active"` according to the existing deployment's scheduling convention.

Arenas may be created and run concurrently, and each Arena must be addressed by its own ID. The UI should derive each countdown from that Arena's persisted timestamps, not from a client-created duration alone. Arena IDs must be included in shareable URLs and every Arena API operation.

At or after `startTime`, the Arena is `active`; at or after `endTime`, it is `finished`. The transition may be triggered lazily by an API request or client interaction, but it must be enforced server-side on every operation that creates a match or changes Arena state.

### Joining and Leaving

The Arena page displays:

- Arena name and game type;
- start time, end time, and a countdown;
- Join/Leave control;
- live leaderboard;
- the current player's points, wins, games, and availability.

Joining adds an `ArenaPlayer` record initialized as:

```text
points = 0
wins = 0
games = 0
```

Joining is rejected after the Arena has finished. Leaving removes or marks the participant inactive using the existing KV conventions; it must not erase completed scoring history. Whether a player is currently playing is derived from the existing presence/table state, not duplicated in the Arena record.

## Client-Driven Matchmaking

After joining, the client reads the Arena participant snapshot and looks for another participant. The client should remain available between games and start another discovery cycle after returning from a completed match.

The flow is:

```text
Player joins Arena
        ↓
client finds another Arena participant
        ↓
client uses the existing challenge flow
        ↓
other player accepts or declines
        ↓
existing billiards game starts after acceptance
```

Challenge acceptance is the concurrency mechanism. There is no Arena-specific claim endpoint, two-player reservation, matchmaking queue, or persistent matchmaking process. If a challenge is declined, expires, or loses a race with another accepted challenge, the client simply chooses another participant and retries through the existing challenge behavior.

The Arena must prevent only obviously invalid choices in the client UI, such as selecting the current player, a player who is no longer in the Arena, or a player already shown by existing presence as being at a table. The server does not need to maintain a separate Arena `available`/`playing` status.

### Pairing Preference

When selecting an opponent, prefer the following order:

1. a participant currently available according to existing presence/table state;
2. a player who did not just play this player;
3. the longest-waiting participant, using existing presence/join information where available;
4. any available participant if necessary.

A recent opponent is a preference, not a hard exclusion. A rematch is allowed when necessary. The implementation should prioritize keeping players active over perfect fairness; this preference can be maintained in client state or derived from recent existing challenge/game history rather than persisted as Arena state.

The client must tolerate stale participant snapshots, declined challenges, disconnects, and duplicate notifications by treating existing challenge/game state and the server's Arena score state as authoritative.

## Existing Challenge and Game Integration

Arena matches must use the existing challenge and table/game mechanisms:

- Extend the existing challenge data with optional Arena context, for example `arenaId`. No Arena match/claim ID is required for the MVP.
- Normal challenges remain valid and behave exactly as before when Arena fields are absent.
- A successful Arena challenge creates the same kind of challenge/table session used by normal play.
- The existing player acceptance resolves the pairing; do not add automatic Arena acceptance or a second acceptance protocol.
- Use existing player validation, table creation/channel identity, turn/game messaging, and authoritative result logic.
- Update presence/table state through the existing Lobby/Table APIs so normal lobby behavior remains consistent.

The plan must first identify the current result event and its authoritative winner representation. Arena should subscribe to or hook into that existing completion path rather than infer a win from client UI state.

## Scoring and Idempotency

When an Arena-associated game completes, the authoritative result handler performs one server-side score update:

```text
winner:
    points += 1
    wins += 1

both players:
    games += 1
    status = available

both players:
    lastOpponentId = the other player
    lastPlayedAt = result timestamp
```

The score update must be safe when the same result is delivered more than once, replayed after reconnect, or observed by both clients. Prefer the existing result/challenge identity and existing idempotency convention. A duplicate notification may repeat a harmless state refresh but must not increment `games`, `wins`, or `points` again. Do not create a separate Arena match ledger unless the existing result path cannot provide this guarantee.

If a game ends without a valid winner, follow the existing result/draw/forfeit semantics and define explicitly whether it increments games and releases both players without awarding points. Do not invent a conflicting game-result rule in the Arena layer.

After the existing game flow completes, clients may immediately start another opponent-discovery/challenge cycle.

## Live Leaderboard

Display the leaderboard on `arena.html`:

| Rank | Player | Points | Games | Win % |
| ---- | ------ | -----: | -----: | ----: |

For the MVP, `Points = Wins`. Sort by:

1. points descending;
2. Elo descending;
3. deterministic final tie-breaker such as player name or ID.

The requested primary ordering is score first, then Elo. Win percentage and games may be displayed as statistics but must not outrank Elo in sorting unless a later product decision explicitly changes this rule.

Define zero-game win percentage as `0%` and use a deterministic final tie-breaker such as player name or ID if the existing ranking convention does not already provide one. Bots may appear on the leaderboard and can fill matchmaking gaps, but bots are treated as normal players and are eligible to win the Arena. The rule must be applied consistently when determining the displayed winner and podium.

Leaderboard and participant updates should follow the application's existing real-time or polling conventions. A client refresh must reconstruct the same state from KV and retained/current messages rather than relying on in-memory browser state.

## Arena Ending

At or after `endTime`:

- transition that Arena to `finished`;
- reject all new challenges and game creation for that Arena;
- allow already-started games to finish through the existing game flow;
- apply valid results from those games exactly once;
- calculate the final eligible winner and podium from completed Arena scores;
- after a result-finalization grace period, write the final result into `arena:results` under the Arena ID;
- retain only the ten most recent finished results in that map;
- delete `arena:{arenaId}`, `arena:{arenaId}:scores`, and `arena:{arenaId}:scored`.

Finalization and cleanup must be idempotent and protected against partial failures. The grace period must be long enough for already-started games and duplicate result deliveries to be handled before the idempotency key is deleted. Add a safety TTL to each Arena's working keys so failed cleanup cannot leave keys indefinitely. The retained result must contain enough data to render the finished Arena after its working keys have been deleted.

Finalization and cleanup must be idempotent and protected against partial failures. The grace period must be long enough for already-started games and duplicate result deliveries to be handled before the idempotency key is deleted. Add a safety TTL to each Arena's working keys so failed cleanup cannot leave keys indefinitely. The retained result must contain enough data to render the finished Arena after its working keys have been deleted.

A player must not start a new Arena game after the end time, even if their client has stale `available` state. Existing games finishing after `endTime` may update the final scores if they were claimed before the deadline, subject to the existing result rules.

The finished `arena.html` page should preserve the final leaderboard and prominently identify the winner using the top-three medal podium. Define how ties are displayed (for example, shared winners) before implementation rather than silently relying on client ordering.

## Arena UI Experience

The intended loop is:

```text
JOIN ARENA
        ↓
Finding opponent…
        ↓
You vs PlayerName
        ↓
existing billiards game
        ↓
You won! +1 point
        ↓
Back to Arena — Play Next Game
        ↓
Finding opponent…
```

Keep the live leaderboard visible throughout the Arena experience. Reuse the existing game launch/return conventions so the Arena page can restore the player's Arena context from the challenge/table context and continue matchmaking after a completed game.

## Arena Navigation and Page Context

- The Arena page URL must identify the Arena using the existing shareable tournament identity convention.
- Every Arena API operation must include or derive the Arena ID; no global mutable `arena`, `arena:scores`, or `arena:scored` key may be used for concurrent Arenas.
- A player joining from `arena.html` remains associated with that Arena when redirected into an existing billiards game.
- Returning from a completed game restores `arena.html` and resumes client-driven opponent discovery while the Arena is active.
- The page must not require the knockout tournament page to be loaded or mounted.

## Implementation Boundaries

Keep the MVP small:

- multiple concurrent Arenas addressed by Arena ID;
- one-hour duration;
- client-driven discovery;
- existing challenge acceptance resolves pairing;
- no Arena-specific active-game or pairing state;
- one point per authoritative win;
- bots may fill gaps but cannot win;
- no dedicated matchmaking service;
- no duplicate challenge, table, game, or result abstractions;
- no new database or KV provider.

Before code changes, produce a short architecture mapping showing which existing modules own: tournament registration/page state, KV access, challenge creation/acceptance, table/game lifecycle, result finalization, and real-time updates. Any new Arena endpoint or KV operation should be the smallest extension required by that mapping.

## Arena Testing Plan

In addition to the behavioral tests below, verify that:

- `arena.html` is independently reachable and loads without the knockout tournament page;
- the lobby logo appears at the top-left with the expected link and responsive behavior;
- the current user is initialized through the existing user/presence components and appears online;
- the leaderboard is sorted by points, then Elo;
- the finished view renders the correct top-three medal podium, including bots when they place;
- the join control transitions into the matchmaking state and the return flow restores Arena context.

Add focused tests after the existing implementations have been inspected. Cover:

- joining initializes a participant and rejects invalid/finished Arena joins;
- concurrent challenges are resolved by the existing challenge acceptance behavior;
- declined, expired, or superseded challenges allow the client to retry;
- pairing preference avoids an immediate rematch when another player is available but permits it when necessary;
- Arena challenges use the existing challenge/acceptance/table flow and normal challenges remain unchanged;
- an authoritative win increments the winner's points and wins and both players' games exactly once;
- duplicate/replayed result notifications do not double-score;
- completed matches release players for another game;
- end-time enforcement blocks new Arena challenges while allowing already-started games to finish;
- leaderboard sorting, zero-game percentages, bot eligibility, and final winner display;
- client refresh/reconnect reconstructs the leaderboard and player status from shared state;
- concurrent Arenas remain isolated by Arena ID;
- finalization writes an ID-keyed result to `arena:results`, retains only the ten newest results, and removes the finished Arena's working keys;
- abandoned or failed-cleanup Arenas are eventually removed by working-key TTLs.
