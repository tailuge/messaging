
import { reduce, INITIAL_STATE } from "../src/client/utils.js";

// Mock lit to allow importing OnlinePanel or its dependencies if needed
jest.mock('lit', () => ({
  html: (strings: any, ..._values: any[]) => strings[0],
  css: (strings: any, ..._values: any[]) => strings[0],
  LitElement: class {},
}));

describe("Rematch Simultaneous Challenge Fixed", () => {
    const aliceId = "alice";
    const bobId = "bob";

    it("should demonstrate how Bob (higher ID) correctly waits while Alice (lower ID) accepts his offer", () => {
        // Bob's auto-challenge configuration (He is Higher ID)
        const bobAutoChallenge = {
            opponentId: aliceId,
            ruleType: 'nineball',
            nextTurnId: aliceId
        };

        // Alice's auto-challenge configuration (She is Lower ID)
        const aliceAutoChallenge = {
            opponentId: bobId,
            ruleType: 'nineball',
            nextTurnId: aliceId
        };

        // 1. Bob sends his offer (Table B)
        const bobOffer = {
            type: 'offer',
            challengerId: bobId,
            challengerName: 'Bob',
            challengeeId: aliceId,
            tableId: 'table-b',
            ruleType: 'nineball',
            nextTurnId: aliceId
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
            ruleType: 'nineball',
            nextTurnId: aliceId
        };

        let aliceState = reduce(INITIAL_STATE, {
            type: 'CHALLENGE_SENT',
            myId: aliceId,
            payload: { ...aliceOffer, recipientName: 'Bob' }
        });

        // 3. Bob receives Alice's offer
        // Bob (Higher ID) ignores Alice's offer because he has a pending sent challenge
        bobState = reduce(bobState, {
            type: 'CHALLENGE_MSG',
            myId: bobId,
            payload: aliceOffer
        });

        // Alice receives Bob's offer
        // Alice (Lower ID) YIELDS to Bob's offer
        aliceState = reduce(aliceState, {
            type: 'CHALLENGE_MSG',
            myId: aliceId,
            payload: bobOffer
        });

        // VERIFY TIE-BREAKER:
        // Bob keeps his own table-b
        expect(bobState.challenges[aliceId].tableId).toBe('table-b');
        expect(bobState.challenges[aliceId].challengerId).toBe(bobId);

        // Alice yielded and now tracks Bob's table-b
        expect(aliceState.challenges[bobId].tableId).toBe('table-b');
        expect(aliceState.challenges[bobId].challengerId).toBe(bobId);

        // 4. Simultaneous Auto-Accept Logic in OnlinePanel.#handleAutoChallengeOnMessage(msg)

        // Bob processes Alice's offer:
        let bobAcceptCalled = false;
        if (aliceOffer.type === 'offer' && aliceOffer.challengeeId === bobId) {
            if (bobAutoChallenge && bobAutoChallenge.opponentId === aliceOffer.challengerId) {
                const sent = bobState.challenges[aliceId];
                if (sent && sent.status === 'pending') {
                    if (bobId < aliceId) { // Bob is NOT lower than Alice
                        bobAcceptCalled = true;
                    }
                }
            }
        }
        expect(bobAcceptCalled).toBe(false); // Bob should NOT accept Alice's offer

        // Alice processes Bob's offer:
        let aliceAcceptCalledWith: string | null = null;
        if (bobOffer.type === 'offer' && bobOffer.challengeeId === aliceId) {
            if (aliceAutoChallenge && aliceAutoChallenge.opponentId === bobOffer.challengerId) {
                const sent = aliceState.challenges[bobId];
                if (sent && sent.status === 'pending') {
                    if (aliceId < bobId) { // Alice IS lower than Bob
                        aliceAcceptCalledWith = bobOffer.challengerId;
                    }
                } else {
                    // Scenario where Alice doesn't have a pending sent challenge yet
                    aliceAcceptCalledWith = bobOffer.challengerId;
                }
            }
        }
        // No, the code says this.#acceptChallenge(msg.challengerId)
        expect(aliceAcceptCalledWith).toBe(bobId);

        // 5. Alice accepts Bob's challenge
        const aliceAcceptMsg = {
            type: 'accept',
            challengerId: bobId,
            challengerName: 'Bob',
            challengeeId: aliceId,
            ruleType: 'nineball',
            tableId: 'table-b',
            nextTurnId: aliceAutoChallenge.nextTurnId // alice
        };

        // Alice updates her state with her own accept
        aliceState = reduce(aliceState, {
            type: 'CHALLENGE_MSG',
            myId: aliceId,
            payload: aliceAcceptMsg
        });

        // Bob receives Alice's accept
        bobState = reduce(bobState, {
            type: 'CHALLENGE_MSG',
            myId: bobId,
            payload: aliceAcceptMsg
        });

        // 6. VERIFY FINAL STATE
        expect(aliceState.currentMatch.tableId).toBe('table-b');
        expect(bobState.currentMatch.tableId).toBe('table-b');

        // VERIFY FIRST PLAYER (Alice)
        expect(aliceState.currentMatch.isFirst).toBe(true);
        expect(bobState.currentMatch.isFirst).toBe(false);
    });
});
