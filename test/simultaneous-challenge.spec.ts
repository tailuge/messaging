
import { reduce, INITIAL_STATE } from "../src/client/utils.js";

// Mock lit
jest.mock('lit', () => ({
  html: (strings: any, ..._values: any[]) => strings[0],
}));

describe("Simultaneous Challenge and State Hardening", () => {
  const myId = "alice";
  const opponentId = "bob";
  const tableId = "table-123";

  it("should ignore incoming offers if a match is already active", () => {
    const activeState = {
      ...INITIAL_STATE,
      currentMatch: { tableId: "existing-table", ruleType: "eightball", isFirst: true }
    };

    const offerMsg = {
      type: 'offer',
      challengerId: opponentId,
      challengeeId: myId,
      tableId: tableId,
      ruleType: 'nineball'
    };

    const nextState = reduce(activeState, { type: 'CHALLENGE_MSG', myId, payload: offerMsg });

    expect(nextState.challenges[opponentId]).toBeUndefined();
    expect(nextState).toBe(activeState);
  });

  it("should process offers if no match is active", () => {
    const offerMsg = {
      type: 'offer',
      challengerId: opponentId,
      challengeeId: myId,
      tableId: tableId,
      ruleType: 'nineball'
    };

    const nextState = reduce(INITIAL_STATE, { type: 'CHALLENGE_MSG', myId, payload: offerMsg });

    expect(nextState.challenges[opponentId]).toBeDefined();
    expect(nextState.challenges[opponentId].status).toBe('pending');
  });

  it("should correctly identify 'other' player in CHALLENGE_MSG", () => {
    // Offer sent by us
    const sentOffer = { challengerId: myId, challengeeId: opponentId, type: 'offer' };
    // This isn't usually how offers from us come in (they come via CHALLENGE_SENT),
    // but the reducer's 'other' helper should handle it.

    // Decline from them
    const declineMsg = { challengerId: myId, challengeeId: opponentId, type: 'decline' };
    const stateWithSent = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId, payload: { ...sentOffer, tableId: 't1' } });

    const stateAfterDecline = reduce(stateWithSent, { type: 'CHALLENGE_MSG', myId, payload: declineMsg });
    expect(stateAfterDecline.challenges[opponentId].status).toBe('declined');
  });
});
