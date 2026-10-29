# Lost challenges when returning to the lobby after a game

**Status:** problem definition only. This document describes the problem and what is known
about it. It does not propose or choose a solution.

## 1. The problem

A player is challenged while they are in a game. When they leave that game for the lobby, the
challenge has disappeared. The challenger's banner still reads "Waiting for {name} to accept."
and nothing will happen. The challenger is stuck waiting on a challenge that may never have
reached the target.

The problem happens at the moment of exit, as the player moves from the game to the lobby. It
is a regular occurrence that players notice.

## 2. Scope

- **Trigger:** challenges sent **near the exit**, around the time the target leaves the game.
- **Primary symptom:** the **challenger is left waiting** on an offer that will never be
  answered.
- **Secondary symptoms (unconfirmed for this scope):** the target never sees the challenge, or
  sees it briefly and then it vanishes.
- **Frequency:** regular, and noticed by players.

## 3. Why the challenge disappears (findings)

These are facts found in the code. They explain the symptom; they are not a fix.

1. **Challenges are live-only.** Offers travel on the lobby presence channel, which keeps no
   history (`nchan_message_buffer_length 0`, `nchan_message_timeout 0` in `docker/nchan.conf`).
   An offer reaches only connections subscribed at the moment it is published.
2. **Leaving the game ends the subscription.** The game page's `MessagingClient` stops on
   `pagehide` (`handlePageHide` → `stop({ isTeardown: true })`), closing the lobby connection and
   publishing a `leave`.
3. **The lobby that loads next starts empty.** It only sees offers published after its own
   subscription is live. `pendingChallenges` is in-memory per `Lobby` and is cleared by
   `leave()`, so nothing carries over from the game page.
4. **The navigation carries no challenge.** A plain lobby link, back button or reload does not
   say which challenge the player was looking at. The only handoff that survives a page load is
   the game page's own Accept redirect, which adds `acceptTableId` and `opponent.userId`.
5. **The sent-challenge banner cannot tell the cases apart.** `src/client/challenge-banner.js`
   shows "Waiting for {name} to accept." with a Cancel button and no timeout. It cannot
   distinguish "still deciding" from "never received".

## 4. Where challenges are lost

| Case | What happens | What the players see |
| --- | --- | --- |
| **Sent during the gap** | The offer is published after the game page has unsubscribed and before the lobby's subscription is live. | Dropped with no recipient. The challenger waits. |
| **Seen, then left** | The offer reaches the game page, but the player leaves before answering. | The target may see it briefly, then nothing in the lobby. The challenger waits. |
| **Accept during the move** | The player accepts and leaves at the same moment. | One player may end up at a table alone. The accept outcome is not yet defined (see section 6). |

## 5. How to reproduce

**Sent during the gap:**

1. Alice is in the lobby. Bob is on a game page, so he can be challenged.
2. Bob leaves the game page for the lobby.
3. Alice challenges Bob while Bob's new lobby is still connecting. The offer is dropped.
4. Bob sees no challenge. Alice's banner still says "Waiting for Bob to accept."

**Seen, then left:**

1. Alice challenges Bob while Bob is in a game.
2. Bob leaves for the lobby as the challenge arrives.
3. Bob reaches the lobby with no challenge. Alice is still waiting.

Slowing the network in devtools makes these cases easier to hit, because connect, join,
snapshot (3 s timeout) and settle all widen the gap.

## 6. Open questions

These were not settled in the interview and must be answered before the problem is fully
defined.

- **Accept race.** If the target accepts on the game page and leaves at the same moment, what
  is the expected outcome? The user called this "impossible" as a framing and did not state a
  preferred result.
- **User-list marker.** Should the challenger's row in the user list show that an offer is held?
  The user answered "don't know".
- **In-game visibility vs. exit-only scope.** The interview asked that a challenge sent during a
  game be visible in-game, but the scope is limited to challenges sent near the exit. These may
  conflict. Confirm whether both apply.
- **Frequency detail.** The user says this happens regularly. The exact share of challenges
  affected is not measured.

## 7. Impact

- **Challenger:** no delivery signal and no timeout. They must cancel by hand and cannot tell
  whether the target ever saw the offer.
- **Target:** a challenge they may have been offered is unrecoverable, with no list of missed
  challenges.
- **Both:** in the accept race case, the two players can disagree about whether a game started.

## 8. Success, stated as observable outcomes

- A challenger who sends an offer near a target's exit is no longer left waiting with no possible
  response.
- A target challenged near their exit sees the challenge when they arrive in the lobby.
- The problem is resolved when the "stuck waiting" symptom no longer happens in regular play.

## 9. Out of scope

- Refreshing or reconnecting while already in the lobby.
- Presence join/leave races (`AUTO_LEAVE_REJOIN_GRACE_MS`), which affect the user list, not
  challenge delivery.
- Where and how a challenge is stored or retained.
