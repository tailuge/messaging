
import { reduce, INITIAL_STATE } from "../src/client/utils.js";

// Mock lit
jest.mock('lit', () => ({
  html: (strings: any, ..._values: any[]) => strings[0],
  css: (strings: any, ..._values: any[]) => strings[0],
  LitElement: class {},
}));

describe("Unified Rematch Scenarios (newspec.md)", () => {
    const A = "alice";
    const B = "bob";

    describe("Scenario 1: Both Rematch Simultaneously", () => {
        it("should deterministically pick one table and one starter", () => {
            const nextTurnId = A; // A should be first

            // A sends offer
            const offerA = { type: 'offer', challengerId: A, challengerName: 'Alice', challengeeId: B, tableId: 'table-A', ruleType: 'nineball', nextTurnId };
            let stateA = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId: A, payload: { ...offerA, recipientName: 'Bob' } } as any);

            // B sends offer
            const offerB = { type: 'offer', challengerId: B, challengerName: 'Bob', challengeeId: A, tableId: 'table-B', ruleType: 'nineball', nextTurnId };
            let stateB = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId: B, payload: { ...offerB, recipientName: 'Alice' } } as any);

            // A receives B's offer. A is lower ID ("alice" < "bob"), so A yields.
            stateA = reduce(stateA, { type: 'CHALLENGE_MSG', myId: A, payload: offerB } as any);
            expect((stateA.challenges[B] as any).tableId).toBe('table-B');

            // B receives A's offer. B is higher ID, so B ignores.
            stateB = reduce(stateB, { type: 'CHALLENGE_MSG', myId: B, payload: offerA } as any);
            expect((stateB.challenges[A] as any).tableId).toBe('table-B');

            // Simulating OnlinePanel logic: A (lower ID) accepts B's offer
            const acceptA = { type: 'accept', challengerId: B, challengerName: 'Bob', challengeeId: A, ruleType: 'nineball', tableId: 'table-B', nextTurnId };

            stateA = reduce(stateA, { type: 'CHALLENGE_MSG', myId: A, payload: acceptA } as any);
            stateB = reduce(stateB, { type: 'CHALLENGE_MSG', myId: B, payload: acceptA } as any);

            expect((stateA.currentMatch as any)?.tableId).toBe('table-B');
            expect((stateB.currentMatch as any)?.tableId).toBe('table-B');
            expect((stateA.currentMatch as any)?.isFirst).toBe(true); // nextTurnId === A
            expect((stateB.currentMatch as any)?.isFirst).toBe(false);
        });
    });

    describe("Scenario 5/6: Rematch + Cross-site Accept (Simplified)", () => {
        it("should work when one player has an autoChallenge and the other sends an offer", () => {
            // A arrives with ?opponentId=B (autoChallenge)
            // B is already in lobby and sends an offer to A
            const offerB = { type: 'offer', challengerId: B, challengerName: 'Bob', challengeeId: A, tableId: 'table-B', ruleType: 'nineball' };

            let stateA = INITIAL_STATE;
            // A receives offerB.
            stateA = reduce(stateA, { type: 'CHALLENGE_MSG', myId: A, payload: offerB } as any);

            // In OnlinePanel.#checkAutoChallenge, A sees incoming offer from B and accepts.
            const acceptA = { type: 'accept', challengerId: B, challengerName: 'Bob', challengeeId: A, ruleType: 'nineball', tableId: 'table-B' };
            stateA = reduce(stateA, { type: 'CHALLENGE_MSG', myId: A, payload: acceptA } as any);

            expect((stateA.currentMatch as any)?.tableId).toBe('table-B');
        });
    });

    describe("isFirst logic edge cases", () => {
        it("should honor nextTurnId even if it's not the challenger", () => {
            // Bob challenges Alice, but sets Alice as nextTurnId
            const offerB = { type: 'offer', challengerId: B, challengeeId: A, tableId: 't1', ruleType: '9', nextTurnId: A };
            const acceptMsg = {
                type: 'accept', challengerId: B, challengeeId: A,
                tableId: 't1', ruleType: '9', nextTurnId: A
            };

            const stateA = reduce(INITIAL_STATE, { type: 'CHALLENGE_MSG', myId: A, payload: offerB } as any);
            const finalA = reduce(stateA, { type: 'CHALLENGE_MSG', myId: A, payload: acceptMsg } as any);
            expect((finalA.currentMatch as any)?.isFirst).toBe(true);

            const stateB = reduce(INITIAL_STATE, {
                type: 'CHALLENGE_SENT', myId: B,
                payload: { challengerId: B, challengeeId: A, tableId: 't1', status: 'pending', nextTurnId: A }
            } as any);
            const finalB = reduce(stateB, { type: 'CHALLENGE_MSG', myId: B, payload: acceptMsg } as any);
            expect((finalB.currentMatch as any)?.isFirst).toBe(false);
        });

        it("should fallback to challenger as first if nextTurnId is missing", () => {
            const acceptMsg = { type: 'accept', challengerId: B, challengeeId: A, tableId: 't1', ruleType: '9' };

            const stateB = reduce(INITIAL_STATE, {
                type: 'CHALLENGE_SENT', myId: B,
                payload: { challengerId: B, challengeeId: A, tableId: 't1', status: 'pending' }
            } as any);
            const finalB = reduce(stateB, { type: 'CHALLENGE_MSG', myId: B, payload: acceptMsg } as any);
            expect((finalB.currentMatch as any)?.isFirst).toBe(true);
        });
    });
});
