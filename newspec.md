# Rematch Arrival Spec

Two URL formats bring players from the game site to the lobby:

| Format | Purpose | Parameters |
|---|---|---|
| **Rematch params** | Player clicked "Rematch" in game | `?opponentId=X&opponentName=Y&ruletype=Z&nextTurnId=W` |
| **Cross-site accept** | Player clicked "Accept" on a challenge while in game | `?action=join&ruletype=Z&opponentId=X&opponentName=Y` |
| **No params** | Player clicked "Return to Lobby" (or game ended normally) | `lobby.html` |

## All Combinations

| # | Player A action | Player B action | Player A URL | Player B URL | Desired action |
|---|---|---|---|---|---|
| 1 | Rematch | Rematch | `?opponentId=B&...&nextTurnId=A` | `?opponentId=A&...&nextTurnId=A` | one party triggers accept flow |
| 2 | Rematch | Return to Lobby | `?opponentId=B&...&nextTurnId=A` | (no params) | A shows "waiting for challenge to be accepted", B shows "challenge banner accept/decline" |
| 3 | Return to Lobby | Rematch | (no params) | `?opponentId=A&...&nextTurnId=A` | B shows "waiting for challenge to be accepted", A shows "challenge banner accept/decline" |
| 4 | Return to Lobby | Return to Lobby | (no params) | (no params) | |
| 5 | Rematch | Accept from game | `?opponentId=B&...&nextTurnId=A` | `?action=join&opponentId=A&ruletype=...` | B will trigger accept flow |
| 6 | Accept from game | Rematch | `?action=join&opponentId=B&ruletype=...` | `?opponentId=A&...&nextTurnId=A` | A will trigger accept flow |
| 7 | In lobby, challenges B | Accept from game | (already in lobby) | `?action=join&opponentId=A&ruletype=...` | B will trigger accept flow |
| 8 | Accept from game | In lobby, challenges A | `?action=join&opponentId=B&ruletype=...` | (already in lobby) | A will trigger accept flow |

**Key facts:**

- Both players are on separate computers and independently decide their action
- The game site cannot pre-coordinate roles — it doesn't know what the other player chose
- **Row 1** (both rematch) is the only case with a race condition — both arrive with `opponentId` AND `nextTurnId`
- **Rows 5-6** are rematch + cross-site accept — no `nextTurnId` in the `?action=join` URL (currently lost)
- **Rows 7-8** are standard cross-site challenge accepts — challenger already in lobby, no race
- `?action=join` never includes `nextTurnId` currently. The user is open to fixing this on the game site side.
- Messaging between parties happens over nchan relay
- When player arrives at lobby, full nchan message replay might not be available until sockets connect.
- Existing lobby handles in lobby challenge/accept/decline perfectly via nchan protocol.


----

Approach:

I want simplest system where any rematch feeds into existing challenge/accept/decline flow. 

No need for special logic for "rematch" logic. 

The core problem can be stated very simply:

Two players can independently issue overlapping challenges to each other, and the system must deterministically collapse that pair of challenges into a single match with exactly one “accept” outcome, without relying on timing or startup order.  I.e. one party (deterministically mybe by id) must accept.

Or even tighter:

Mutual challenges (A→B and B→A) must resolve into one match, with a deterministic rule selecting who “accepts” and preventing duplicate/competing starts.

And the cleanest resolution constraint you’ve already hinted at:

Use a deterministic tie-break (e.g. ordered playerId) so that when two reciprocal challenges exist, exactly one side becomes the accepter/initiator of the match creation.


----

Further simplification:

Remove `action=join` entirely. External game sites can just send:

```
?ruletype=Z&opponentId=X&opponentName=Y
```

instead of:

```
?action=join&ruletype=Z&opponentId=X&opponentName=Y
```

This eliminates the special `action=join` case and simplifies URL parameter handling to a single unified approach:

- **Rematch params**: `?opponentId=X&opponentName=Y&ruletype=Z&nextTurnId=W` → challenge offer
- **Cross-site accept params**: `?opponentId=X&opponentName=Y&ruletype=Z` → accept message (when matching challenge exists)
- **No params**: `lobby.html` → normal lobby behavior

The system becomes even cleaner with:
- No special `action=join` logic
- No URL parameter classification
- Context-based processing (treat as offer or accept based on state)
- Maximum reuse of existing challenge/accept/decline flow

This approach achieves the goal of "simplest system where any rematch feeds into existing challenge/accept/decline flow" with minimal complexity.

---

## Spec Deficiency: Startup Timing Gap

### The Problem

Rows 7-8 ("In lobby, challenges B | Accept from game") fail because the auto-challenge logic runs **before** Nchan-buffered challenge messages are visible to the client:

1. Returning player's lobby calls `join()` → subscribes to Nchan → dispatches `CONNECTED`
2. `checkAutoChallenge()` fires on `CONNECTED` — but the opponent's buffered challenge is still held in the `ChallengeDeduplicator`'s 250ms timer
3. No incoming challenge found → returning player sends a **new** challenge instead of accepting the existing one
4. Stationary player (already in lobby) receives the new challenge but has no `#autoChallenge` set → doesn't auto-accept
5. Even if the buffered challenge later arrives and triggers the tie-breaker, the tie-breaker may select the stationary player (lower ID) — but the stationary player has no auto-accept mechanism

**Root cause**: The spec assumes `checkAutoChallenge()` can see all relevant state when `CONNECTED` fires. It can't — Nchan message replay and the 250ms dedup delay mean challenges are not yet in the `challenges` map at that moment.

### The Fix: `onSettled` — Lobby Replay-Completion Detection

**Name**: `lobby.onSettled(callback)` — follows the existing Lobby callback pattern (`onUsersChange`, `onChallenge`, `onChat`).

**Mechanism**: Self-published sentinel using the existing `clientTs` field on the `join` presence message.

```
Lobby.join()
  ├─ subscribe to Nchan
  ├─ sentinelTs = Date.now()
  ├─ publish presence: { type:"join", clientTs: sentinelTs, ... }
  │
  ▼  [Nchan replays buffered messages FIFO, then our join]
  │
handlePresenceUpdate(msg)
  ├─ msg.userId === myId && msg.type === "join" && msg.clientTs === sentinelTs?
  │    → sentinel received → start 300ms settleTimer
  │
  ▼  [during 300ms: dedup 250ms timers fire, challenges emitted]
  │
settleTimer fires → call all onSettled listeners
```

**Why this works**:
- **Nchan FIFO**: Every buffered message was published before our join, so it appears in the WebSocket stream before our join
- **Match condition**: `(userId, type, clientTs)` uniquely identifies our specific join, immune to stale joins in the buffer
- **300ms settle timer**: Covers the dedup layer's 250ms timer with margin
- **5-second safety timeout**: Ensures `onSettled` fires even if the sentinel is lost

**Driver**: `OnlinePanel.dispatch()` will move `checkAutoChallenge()` from `CONNECTED`/`USERS_UPDATE` to `lobby.onSettled()`. The reactive `handleAutoChallengeOnMessage` path remains unchanged — it auto-accepts incoming offers as they arrive through the dedup layer, independent of `onSettled`.
