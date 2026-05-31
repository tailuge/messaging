import { reduce, INITIAL_STATE } from "../src/client/utils.js";

// Mock lit
jest.mock('lit', () => ({
  html: (strings: any, ..._values: any[]) => strings[0],
}));

describe("Lobby Logic", () => {
  describe("reduce - challenge resolution", () => {
    const myId = "alice";
    const opponentId = "bob";
    const tableId = "table-1";

    it("should set isFirst correctly when accepting a challenge from someone else", () => {
      // Case: Alice sends Bob a challenge offer, Bob accepts.
      // Alice's reducer handles CHALLENGE_SENT
      let state = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId, payload: {
        challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball'
      }});

      const acceptMsg = {
        type: 'accept', challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball'
      };
      
      state = reduce(state, { type: 'CHALLENGE_MSG', myId, payload: acceptMsg });

      expect(state.currentMatch).toBeDefined();
      expect(state.currentMatch?.isFirst).toBe(true); // Alice is challenger
    });

    it("should set isFirst to false if we are the challengee (received an offer)", () => {
        // Reducer handles 'accept' after we've received an 'offer' and moved to game.
        // In the real UI, #acceptChallenge dispatches MATCH_SET.
        // Let's test MATCH_SET directly or the CHALLENGE_MSG 'accept' path.
        
        const acceptMsg = {
            type: 'accept', challengerId: opponentId, challengeeId: myId, tableId, ruleType: 'nineball'
        };

        // We need a pending challenge from opponentId in state for reduce to handle 'accept'
        let state = reduce(INITIAL_STATE, { type: 'CHALLENGE_MSG', myId, payload: {
            type: 'offer', challengerId: opponentId, challengeeId: myId, tableId, ruleType: 'nineball'
        }});

        state = reduce(state, { type: 'CHALLENGE_MSG', myId, payload: acceptMsg });

        expect(state.currentMatch?.isFirst).toBe(false);
    });
  });
});
