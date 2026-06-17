
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
    
    // Decline from them
    const declineMsg = { challengerId: myId, challengeeId: opponentId, type: 'decline' };
    const stateWithSent = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId, payload: { ...sentOffer, tableId: 't1' } });

    const stateAfterDecline = reduce(stateWithSent, { type: 'CHALLENGE_MSG', myId, payload: declineMsg });
    expect(stateAfterDecline.challenges[opponentId].status).toBe('declined');
  });

  it("should handle simultaneous offers correctly (repro bug)", () => {
    // Alice (lower ID) and Bob (higher ID)
    const aliceId = "alice";
    const bobId = "bob";

    // 1. Bob sends a challenge to Alice (Table B)
    const bobOffer = {
      type: 'offer',
      challengerId: bobId,
      challengeeId: aliceId,
      tableId: 'table-b',
      ruleType: 'nineball'
    };

    // Bob's local state after sending
    let bobState = reduce(INITIAL_STATE, { 
      type: 'CHALLENGE_SENT', 
      myId: bobId, 
      payload: { ...bobOffer, recipientName: 'Alice' } 
    });

    expect(bobState.challenges[aliceId]).toBeDefined();
    expect(bobState.challenges[aliceId].challengerId).toBe(bobId);
    expect(bobState.challenges[aliceId].tableId).toBe('table-b');

    // 2. Bob receives Alice's simultaneous offer (Table A)
    const aliceOffer = {
      type: 'offer',
      challengerId: aliceId,
      challengeeId: bobId,
      tableId: 'table-a',
      ruleType: 'eightball'
    };

    bobState = reduce(bobState, { 
      type: 'CHALLENGE_MSG', 
      myId: bobId, 
      payload: aliceOffer 
    });

    // FIXED: Bob's knowledge of his own sent challenge (Table B) is PRESERVED 
    // because Bob has a higher ID than Alice.
    expect(bobState.challenges[aliceId].challengerId).toBe(bobId);
    expect(bobState.challenges[aliceId].tableId).toBe('table-b');

    // 3. Bob receives Alice's acceptance of Table B
    const aliceAccept = {
      type: 'accept',
      challengerId: bobId,
      challengeeId: aliceId,
      tableId: 'table-b',
      ruleType: 'nineball'
    };

    const stateAfterAccept = reduce(bobState, {
      type: 'CHALLENGE_MSG',
      myId: bobId,
      payload: aliceAccept
    });

    // FIXED: Bob successfully processes the acceptance
    expect(stateAfterAccept.currentMatch).not.toBeNull();
    expect(stateAfterAccept.currentMatch.tableId).toBe('table-b');
  });

  it("should demonstrate the correct unified table in simultaneous challenges", () => {
    const aliceId = "alice";
    const bobId = "bob";

    // 1. Both send offers
    const aliceOffer = { type: 'offer', challengerId: aliceId, challengeeId: bobId, tableId: 'table-a', ruleType: 'eightball' };
    const bobOffer = { type: 'offer', challengerId: bobId, challengeeId: aliceId, tableId: 'table-b', ruleType: 'nineball' };

    // Alice's state after sending A and receiving B
    let aliceState = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId: aliceId, payload: { ...aliceOffer, recipientName: 'Bob' } });
    aliceState = reduce(aliceState, { type: 'CHALLENGE_MSG', myId: aliceId, payload: bobOffer });

    // Alice (lower ID) yielded: she now has Bob's offer in state
    expect(aliceState.challenges[bobId].tableId).toBe('table-b');

    // Bob's state after sending B and receiving A
    let bobState = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId: bobId, payload: { ...bobOffer, recipientName: 'Alice' } });
    bobState = reduce(bobState, { type: 'CHALLENGE_MSG', myId: bobId, payload: aliceOffer });

    // Bob (higher ID) ignored Alice's offer: he still has his own in state
    expect(bobState.challenges[aliceId].tableId).toBe('table-b');

    // 2. Alice auto-accepts Table B
    aliceState = reduce(aliceState, { type: 'CHALLENGE_MSG', myId: aliceId, payload: { type: 'accept', challengerId: bobId, challengeeId: aliceId, tableId: 'table-b', ruleType: 'nineball' } });

    // 3. Alice's accept message for Table B arrives at Bob
    const aliceAcceptB = { type: 'accept', challengerId: bobId, challengeeId: aliceId, tableId: 'table-b', ruleType: 'nineball' };
    bobState = reduce(bobState, { type: 'CHALLENGE_MSG', myId: bobId, payload: aliceAcceptB });

    // FIXED: Bob is now in the match on Table B
    expect(bobState.currentMatch.tableId).toBe('table-b');

    // FINAL RESULT: Unified table
    expect(aliceState.currentMatch.tableId).toBe('table-b');
    expect(bobState.currentMatch.tableId).toBe('table-b');
  });
});
