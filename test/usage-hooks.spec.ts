import { Lobby } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";
import { PresenceMessage } from "../src/types";

jest.mock("../src/nchanclient");

describe("Lobby challenge/accept usage hooks", () => {
  const currentUser: PresenceMessage = {
    messageType: "presence",
    type: "join",
    userId: "user-a",
    userName: "Alice",
  };

  const buildLobby = (options: Record<string, unknown> = {}) => {
    const mockNchan = new NchanClient("http://localhost") as any;
    return { lobby: new Lobby(mockNchan, currentUser, options as any), mockNchan };
  };

  it("fires onChallengeSent once with the offer details", async () => {
    const onChallengeSent = jest.fn();
    const { lobby, mockNchan } = buildLobby({ onChallengeSent });

    const tableId = await lobby.challenge("user-b", "eightball");

    expect(mockNchan.publishChallenge).toHaveBeenCalledTimes(1);
    expect(onChallengeSent).toHaveBeenCalledTimes(1);
    expect(onChallengeSent).toHaveBeenCalledWith({
      challengeeId: "user-b",
      ruleType: "eightball",
      tableId,
    });
  });

  it("fires onChallengeAccepted once with the accept details", async () => {
    const onChallengeAccepted = jest.fn();
    const { lobby, mockNchan } = buildLobby({ onChallengeAccepted });

    await lobby.acceptChallenge("user-b", "eightball", "table-1");

    expect(mockNchan.publishChallenge).toHaveBeenCalledTimes(1);
    expect(onChallengeAccepted).toHaveBeenCalledTimes(1);
    expect(onChallengeAccepted).toHaveBeenCalledWith({
      challengerId: "user-b",
      ruleType: "eightball",
      tableId: "table-1",
    });
  });

  it("does not fire either hook for decline or cancel", async () => {
    const onChallengeSent = jest.fn();
    const onChallengeAccepted = jest.fn();
    const { lobby } = buildLobby({ onChallengeSent, onChallengeAccepted });

    await lobby.declineChallenge("user-b", "eightball");
    await lobby.cancelChallenge("user-b", "eightball");

    expect(onChallengeSent).not.toHaveBeenCalled();
    expect(onChallengeAccepted).not.toHaveBeenCalled();
  });

  it("does not fail the challenge when a hook throws synchronously", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const onChallengeSent = jest.fn(() => {
      throw new Error("boom");
    });
    const { lobby } = buildLobby({ onChallengeSent });

    await expect(lobby.challenge("user-b", "eightball")).resolves.toEqual(
      expect.any(String),
    );
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("does not leave an unhandled rejection when a hook returns a rejected promise", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const onChallengeAccepted = jest.fn(() => Promise.reject(new Error("boom")));
    const { lobby } = buildLobby({ onChallengeAccepted });

    await expect(
      lobby.acceptChallenge("user-b", "eightball", "table-1"),
    ).resolves.toBeUndefined();
    // Let the attached rejection handler run before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
