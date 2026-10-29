# Lost challenges when returning to the lobby after a game

**Status:** problem definition, plus one candidate solution in section 10. Sections 1–9
describe the problem and what is known about it; they do not choose a solution.

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

## 4a. Expected behaviour when the challenger goes offline

This is the behaviour the user has confirmed for an offer that is being held for a target who
has not yet returned to the lobby.

- **A held offer stays held** until the target accepts, the target declines, the challenger
  cancels, or its time limit expires. The time limit has not been chosen yet (see section 6).
- **A held offer is cleared when the challenger goes offline.** The target should not be able to
  accept an offer whose challenger has left. This replaces the earlier "keep regardless" answer.
- **The challenger going offline includes leaving the page.** A challenger who moves to another
  page loses their held offers in the same way. This is the intended behaviour, not a side effect.
- **Going offline is detected from presence.** A deliberate leave clears the offer immediately. A
  tab that closes without leaving is only detected once its presence times out, which is about
  70 seconds. Until then the offer may still be held, and the target may be able to accept an
  offer from a challenger who is already gone.
- **The target is told nothing** when a held offer is cleared because the challenger went
  offline. This is not yet confirmed (see section 6).

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
- **Time limit for a held offer.** Not chosen. It must be long enough to cover the game-to-lobby
  gap, which the user measured at one second or more.
- **Target notified on clearing.** Whether the target should see anything when a held offer is
  cleared because the challenger went offline is not decided.
- **Accept after the time limit.** What happens if the target accepts an offer after its time
  limit has expired is not decided.
- **Stale window for an offline challenger.** A challenger who closes the tab without leaving
  keeps their offer for up to about 70 seconds. Whether that is acceptable is not decided.

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
- Where and how a challenge is stored or retained (section 10 proposes one answer).

## 10. Solution #1 — hold offers in server memory and re-deliver them on join

**In short:** offers keep travelling on the lobby presence channel exactly as they do now.
Alongside the channel, the server keeps a short-lived in-memory record of offers that have not
yet been resolved, and re-delivers the waiting ones to a player when they (re)join the lobby.

**What is kept in memory:** one entry per outstanding offer, identified by the
challenger/challengee pair — the channel's resolutions (accept, decline, cancel) carry no table
id, so the pair is the only stable identity they share with the offer. The entry holds the offer
as it was published, so it can be sent again unchanged. Nothing else is stored, nothing is
written to disk, and entries disappear as soon as the offer is resolved.

**Lifecycle:**

- Written when an offer passes through the server, whether or not anyone was subscribed to
  receive it. That is what closes the gap: a dropped delivery and a held offer are the same
  event.
- Removed on accept, decline or cancel.
- Removed when the challenger goes offline (a deliberate leave or a dropped connection), so a
  target cannot accept an offer from someone who has left.
- Removed on expiry, which only needs to be a little longer than the measured ~5 second gap.
- **Not** removed when the challengee leaves — that departure is the case being fixed.

**Delivery:** when a player joins the lobby, any offer still held for them is published to the
presence channel again as an ordinary offer. It reaches the client on the path it already uses:
the offer arrives during the join window, is deduplicated against any resolutions in that
window, and is emitted once the lobby settles. There is no new endpoint, no client or library
change, and nothing for the joining client to fetch or merge.

**Caveats:**

- Memory only and per server instance: a restart drops held offers, and the approach assumes a
  single Nchan instance — a target's join has to reach the instance holding their offer.
- Challenger-offline detection is presence-based, so a challenger whose connection dies without
  a leave is only noticed when their presence expires (about 70 seconds). Until then an offer
  can be re-delivered for a challenger who has effectively gone.
- It removes the "offer was never delivered" case, not the "challenger was never answered"
  case: the sent-challenge banner still has no timeout, which is today's behaviour.
- The accept race (third row of section 4) is unchanged — accepts remain live-only.
