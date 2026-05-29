
import { RematchCoordinator } from "../src/client/rematch-coordinator.js";

describe("Rematch Determinism", () => {
  const aliceId = "alice";
  const bobId = "bob";

  it("should ensure only one player challenges when nextTurnId is set", () => {
    const infoForAlice = { nextTurnId: aliceId, opponentId: bobId };
    const infoForBob   = { nextTurnId: aliceId, opponentId: aliceId };

    const coordAlice = new RematchCoordinator(infoForAlice);
    const coordBob   = new RematchCoordinator(infoForBob);

    expect(coordAlice.shouldChallenge(aliceId)).toBe(true);
    expect(coordBob.shouldChallenge(bobId)).toBe(false);
  });

  it("should ensure only one player challenges when nextTurnId is missing (tie-break)", () => {
    const infoForAlice = { opponentId: bobId };
    const infoForBob   = { opponentId: aliceId };

    const coordAlice = new RematchCoordinator(infoForAlice);
    const coordBob   = new RematchCoordinator(infoForBob);

    // alice < bob
    expect(coordAlice.shouldChallenge(aliceId)).toBe(true);
    expect(coordBob.shouldChallenge(bobId)).toBe(false);
  });

  it("should both be willing to auto-accept the other's offer", () => {
    const infoForAlice = { nextTurnId: aliceId, opponentId: bobId };
    const infoForBob   = { nextTurnId: aliceId, opponentId: aliceId };

    const coordAlice = new RematchCoordinator(infoForAlice);
    const coordBob   = new RematchCoordinator(infoForBob);

    expect(coordAlice.shouldAutoAccept({ type: 'offer', challengerId: bobId })).toBe(true);
    expect(coordBob.shouldAutoAccept({ type: 'offer', challengerId: aliceId })).toBe(true);
  });
});
