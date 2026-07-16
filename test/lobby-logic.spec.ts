import { reduce, INITIAL_STATE, getEmoji } from "../src/client/utils.js";

// Mock lit
jest.mock('lit', () => ({
  html: (strings: any, ..._values: any[]) => strings[0],
}));

describe("Lobby Logic", () => {
  describe("getEmoji", () => {
    it("should return correct emoji and title for sagu", () => {
      const result = getEmoji("", "sagu");
      expect(result).toEqual({ emoji: "④", title: "sagu" });
    });

    it("should handle sub-types of sagu like sagu-bot", () => {
      const result = getEmoji("", "sagu-bot");
      expect(result).toEqual({ emoji: "④🤖", title: "bot" });
    });

    it("should handle sub-types of sagu like sagu-speedrun", () => {
      const result = getEmoji("", "sagu-speedrun");
      expect(result).toEqual({ emoji: "④👟", title: "speedrun" });
    });

    it("should handle sub-types of sagu like sagu-mini", () => {
      const result = getEmoji("", "sagu-mini");
      expect(result).toEqual({ emoji: "④🍼", title: "mini" });
    });
  });

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

    it("should respect nextTurnId when challenger but nextTurnId is opponent", () => {
      // Rematch scenario: Alice (challenger) should NOT be first because nextTurnId is bob
      let state = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId, payload: {
        challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball'
      }});

      const acceptMsg = {
        type: 'accept', challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball', nextTurnId: opponentId
      };
      
      state = reduce(state, { type: 'CHALLENGE_MSG', myId, payload: acceptMsg });

      expect(state.currentMatch?.isFirst).toBe(false); // Alice is challenger but nextTurnId is bob
    });

    it("should respect nextTurnId when challengee and nextTurnId is me", () => {
      // Rematch scenario: Bob (challengee) SHOULD be first because nextTurnId is bob
      let state = reduce(INITIAL_STATE, { type: 'CHALLENGE_MSG', myId: opponentId, payload: {
        type: 'offer', challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball'
      }});

      const acceptMsg = {
        type: 'accept', challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball', nextTurnId: opponentId
      };
      
      state = reduce(state, { type: 'CHALLENGE_MSG', myId: opponentId, payload: acceptMsg });

      expect(state.currentMatch?.isFirst).toBe(true); // Bob is challengee but nextTurnId is bob
    });

    it("rematch: exactly one player gets isFirst=true for any nextTurnId (mutual exclusivity)", () => {
      // Simulates both players' reducers processing the same accept message with nextTurnId set.
      // Asserts the invariant: challenger.isFirst XOR challengee.isFirst === true.
      const cases = [
        { nextTurnId: myId,       expectAliceFirst: true,  expectBobFirst: false },
        { nextTurnId: opponentId, expectAliceFirst: false, expectBobFirst: true  },
      ];

      for (const { nextTurnId, expectAliceFirst, expectBobFirst } of cases) {
        // Alice (challenger) receives the accept message
        let aliceState = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId, payload: {
          challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball'
        }});
        const acceptMsg = { type: 'accept', challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball', nextTurnId };
        aliceState = reduce(aliceState, { type: 'CHALLENGE_MSG', myId, payload: acceptMsg });

        // Bob (challengee) receives the accept message
        let bobState = reduce(INITIAL_STATE, { type: 'CHALLENGE_MSG', myId: opponentId, payload: {
          type: 'offer', challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball'
        }});
        bobState = reduce(bobState, { type: 'CHALLENGE_MSG', myId: opponentId, payload: acceptMsg });

        expect(aliceState.currentMatch?.isFirst).toBe(expectAliceFirst);
        expect(bobState.currentMatch?.isFirst).toBe(expectBobFirst);
        // Key invariant: exactly one is first
        expect(aliceState.currentMatch?.isFirst).not.toBe(bobState.currentMatch?.isFirst);
      }
    });

    it("rematch: nextTurnId matching neither player falls back to challenger first", () => {
      // If the server sends a nextTurnId that matches neither Alice nor Bob,
      // the reducer falls back to challenger-first so the game can proceed.
      let aliceState = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId, payload: {
        challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball'
      }});
      const acceptMsg = { type: 'accept', challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball', nextTurnId: 'charlie' };
      aliceState = reduce(aliceState, { type: 'CHALLENGE_MSG', myId, payload: acceptMsg });

      let bobState = reduce(INITIAL_STATE, { type: 'CHALLENGE_MSG', myId: opponentId, payload: {
        type: 'offer', challengerId: myId, challengeeId: opponentId, tableId, ruleType: 'nineball'
      }});
      bobState = reduce(bobState, { type: 'CHALLENGE_MSG', myId: opponentId, payload: acceptMsg });

      // Key invariants: exactly one player is first, and it's the challenger (fallback)
      expect(aliceState.currentMatch?.isFirst).toBe(true);
      expect(bobState.currentMatch?.isFirst).toBe(false);
      expect(aliceState.currentMatch?.isFirst).not.toBe(bobState.currentMatch?.isFirst);
    });
  });
});
