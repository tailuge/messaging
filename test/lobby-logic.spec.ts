import { resolveFirstTurn, reduce, INITIAL_STATE } from "../src/client/utils.js";

// Mock lit
jest.mock('lit', () => ({
  html: (strings: any, ..._values: any[]) => strings[0],
}));

describe("Lobby Logic", () => {
  describe("resolveFirstTurn", () => {
    it("should return true if myId matches nextTurnId", () => {
      const myId = "alice";
      const challengerId = "bob";
      const rematch = { nextTurnId: "alice" };
      expect(resolveFirstTurn(myId, challengerId, rematch)).toBe(true);
    });

    it("should return false if myId does not match nextTurnId", () => {
      const myId = "alice";
      const challengerId = "alice";
      const rematch = { nextTurnId: "bob" };
      expect(resolveFirstTurn(myId, challengerId, rematch)).toBe(false);
    });

    it("should fall back to challengerId === myId if no nextTurnId", () => {
      const myId = "alice";
      expect(resolveFirstTurn(myId, "alice", undefined)).toBe(true);
      expect(resolveFirstTurn(myId, "alice", {})).toBe(true);
      expect(resolveFirstTurn(myId, "bob", undefined)).toBe(false);
    });
  });

  describe("reduce - rematch turn resolution", () => {
    const myId = "alice";
    const opponentId = "bob";
    const tableId = "table-1";

    it("should set isFirst correctly when accepting a rematch challenge from someone else", () => {
      // Setup state where we sent a challenge (but it doesn't matter for this case, 
      // because we are receiving an offer)
      // Actually, if we RECEIVE an offer, the reducer handles 'offer' then we manually accept.
      // If we SENT an offer, the reducer handles 'accept' from the other person.
      
      // Case: Bob sends Alice a rematch offer, Alice accepts.
      // Alice's reducer handles CHALLENGE_MSG type 'offer'
      let state = reduce(INITIAL_STATE, { type: 'CHALLENGE_MSG', myId, payload: { 
        type: 'offer', challengerId: opponentId, challengeeId: myId, tableId, ruleType: 'nineball',
        rematch: { nextTurnId: myId }
      }});

      // Alice now has a pending challenge in state.
      // Wait, Alice's reducer doesn't redirect on 'offer'. She has to call #acceptChallenge which dispatches MATCH_SET.
      
      // Case: Alice sends Bob a rematch offer, Bob accepts.
      // Alice's reducer handles CHALLENGE_MSG type 'accept'.
      state = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId, payload: {
        challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball',
        rematch: { nextTurnId: opponentId }
      }});

      const acceptMsg = {
        type: 'accept', challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball'
      };
      
      state = reduce(state, { type: 'CHALLENGE_MSG', myId, payload: acceptMsg });

      expect(state.currentMatch).toBeDefined();
      expect(state.currentMatch?.isFirst).toBe(false); // nextTurnId was opponentId
    });

    it("should set isFirst to true if nextTurnId is us when receiving an accept", () => {
        let state = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId, payload: {
            challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball',
            rematch: { nextTurnId: myId }
          }});
    
          const acceptMsg = {
            type: 'accept', challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball'
          };
          
          state = reduce(state, { type: 'CHALLENGE_MSG', myId, payload: acceptMsg });
    
          expect(state.currentMatch?.isFirst).toBe(true);
    });
  });
});
