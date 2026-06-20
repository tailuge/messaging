
import { reduce, INITIAL_STATE } from "../src/client/utils.js";

// Mock lit to allow importing OnlinePanel or its dependencies if needed
jest.mock('lit', () => ({
  html: (strings: any, ..._values: any[]) => strings[0],
  css: (strings: any, ..._values: any[]) => strings[0],
  LitElement: class {},
}));

describe("Rematch Simultaneous Challenge Bug Reproduction", () => {
    const aliceId = "alice";
    const bobId = "bob";

    it("should demonstrate how Bob (higher ID) incorrectly accepts his own challenge in a simultaneous auto-challenge", () => {
        // --- SETUP ---

        // Bob's auto-challenge configuration
        const bobAutoChallenge = {
            opponentId: aliceId,
            ruleType: 'nineball',
            nextTurnId: aliceId // Alice should go first
        };

        // 1. Bob sends his offer (Table B)
        const bobOffer = {
            type: 'offer',
            challengerId: bobId,
            challengerName: 'Bob',
            challengeeId: aliceId,
            tableId: 'table-b',
            ruleType: 'nineball'
        };

        let bobState = reduce(INITIAL_STATE, {
            type: 'CHALLENGE_SENT',
            myId: bobId,
            payload: { ...bobOffer, recipientName: 'Alice' }
        });

        // 2. Alice sends her simultaneous offer (Table A)
        const aliceOffer = {
            type: 'offer',
            challengerId: aliceId,
            challengerName: 'Alice',
            challengeeId: bobId,
            tableId: 'table-a',
            ruleType: 'nineball'
        };

        // 3. Bob receives Alice's offer
        // In reduce, Bob (higher ID) ignores Alice's offer because he has a pending sent challenge
        bobState = reduce(bobState, {
            type: 'CHALLENGE_MSG',
            myId: bobId,
            payload: aliceOffer
        });

        // VERIFY: Bob's state still points to HIS OWN table-b
        expect(bobState.challenges[aliceId].tableId).toBe('table-b');
        expect(bobState.challenges[aliceId].challengerId).toBe(bobId);

        // 4. Simulate OnlinePanel.#handleAutoChallengeOnMessage(aliceOffer)
        // Current buggy logic in OnlinePanel.js:
        /*
        if (msg.type === 'offer' && msg.challengeeId === this.#myId) {
            if (this.#autoChallenge && this.#autoChallenge.opponentId === msg.challengerId) {
                this.#acceptChallenge(msg.challengerId)...
                return;
            }
        */

        let acceptCalledWith: string | null = null;
        if (aliceOffer.type === 'offer' && aliceOffer.challengeeId === bobId) {
            if (bobAutoChallenge && bobAutoChallenge.opponentId === aliceOffer.challengerId) {
                acceptCalledWith = aliceOffer.challengerId;
            }
        }

        expect(acceptCalledWith).toBe(aliceId);

        // 5. Simulate OnlinePanel.#acceptChallenge(aliceId)
        /*
        async #acceptChallenge(challengerId) {
            const c = challengerId ? this.#state.challenges[challengerId] : this.#activeChallenge;
            ...
            await this.#lobby.acceptChallenge(c.challengerId, c.ruleType, c.tableId, ...);
        */
        if (!acceptCalledWith) throw new Error("acceptCalledWith is null");
        const c = bobState.challenges[acceptCalledWith];

        // BUG IDENTIFIED: 'c' is Bob's OWN challenge (table-b, challenger=bob)
        // Bob is now calling acceptChallenge(bob, ..., table-b, ...)
        expect(c.challengerId).toBe(bobId);
        expect(c.tableId).toBe('table-b');

        // 6. Demonstrate the consequence: A malformed accept message
        const bobMalformedAccept = {
            messageType: 'challenge',
            type: 'accept',
            challengerId: c.challengerId, // bob
            challengerName: 'Bob',
            challengeeId: bobId, // bob (this.#myId)
            ruleType: c.ruleType,
            tableId: c.tableId, // table-b
            nextTurnId: bobAutoChallenge.nextTurnId // alice
        };

        // 7. Alice receives Bob's malformed accept
        // Alice (lower ID) yielded to Bob's offer, so her state has table-b
        let aliceState = reduce(INITIAL_STATE, {
            type: 'CHALLENGE_SENT',
            myId: aliceId,
            payload: { ...aliceOffer, recipientName: 'Bob' }
        });
        // Alice yielded in reduce
        aliceState = reduce(aliceState, {
            type: 'CHALLENGE_MSG',
            myId: aliceId,
            payload: bobOffer
        });
        expect(aliceState.challenges[bobId].tableId).toBe('table-b');

        // Alice processes Bob's malformed accept
        aliceState = reduce(aliceState, {
            type: 'CHALLENGE_MSG',
            myId: aliceId,
            payload: bobMalformedAccept
        });

        // 8. FINAL BUG: Alice's isFirst is FALSE because of the malformed message
        // In reduce:
        // isFirst: (m.nextTurnId === m.challengerId || m.nextTurnId === m.challengeeId)
        //          ? m.nextTurnId === action.myId
        //          : m.challengerId === action.myId

        // m.nextTurnId ('alice') === m.challengerId ('bob')? No.
        // m.nextTurnId ('alice') === m.challengeeId ('bob')? No.
        // Falls back to: m.challengerId ('bob') === action.myId ('alice')? FALSE.
        expect(aliceState.currentMatch.isFirst).toBe(false);

        // Bob also processes his own accept
        // Note: reduce() ignores accepts if there's no matching PENDING challenge.
        // bobState still has challenges['alice'] as {..., challengerId: 'bob', tableId: 'table-b', status: 'pending'}
        // bobMalformedAccept has challengerId: 'bob', tableId: 'table-b'
        // In reduce(): id = other(m) = challengerId === action.myId ? challengeeId : challengerId
        // action.myId = 'bob', m.challengerId = 'bob'. So id = m.challengeeId = 'bob'.
        // Wait, other(m) for Bob:
        // const other = m => m.challengerId === action.myId ? m.challengeeId : m.challengerId;
        // bobMalformedAccept = { challengerId: 'bob', challengeeId: 'bob', ... }
        // So id = 'bob'.
        // But Bob's pending challenge is in bobState.challenges['alice'].
        // So pending = bobState.challenges['bob'] which is undefined.
        // Thus reduce returns state unchanged, and currentMatch is null.

        let finalBobState = reduce(bobState, {
            type: 'CHALLENGE_MSG',
            myId: bobId,
            payload: bobMalformedAccept
        });

        expect(finalBobState.currentMatch).toBeNull();

        // RESULT: DEADLOCK. Alice is on Table B (waiting for Bob), but Bob is still in the Lobby because he didn't process his own malformed accept.
        // If Bob had accepted Alice's offer (Table A), they would be on Table A.
        // If Bob had ignored Alice's offer and waited for Alice to accept Table B (as the tie-breaker intended), they would be on Table B correctly.
        // But because Bob's auto-challenge logic triggered #acceptChallenge on his OWN challenge, he sent a malformed accept and stayed in the lobby.
    });
});
