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

- Actual games, matchmaking, match results, bracket advancement, or tournament progression.
- Authentication beyond existing user/display-name conventions.
- A new database, KV provider, or storage library.
