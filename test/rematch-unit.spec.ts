import { Lobby } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";
import { PresenceMessage, RematchInfo } from "../src/types";

jest.mock("../src/nchanclient");

describe("Lobby Rematch", () => {
  let lobby: Lobby;
  let mockNchan: jest.Mocked<NchanClient>;
  const currentUser: PresenceMessage = {
    messageType: "presence",
    type: "join",
    userId: "user-a",
    userName: "Alice",
  };

  beforeEach(() => {
    mockNchan = new NchanClient("http://localhost") as any;
    lobby = new Lobby(mockNchan, currentUser);
  });

  it("should pass rematch info to nchan.publishChallenge", async () => {
    const rematchInfo: RematchInfo = {
      lastScores: [
        { userId: "user-a", score: 10 },
        { userId: "user-b", score: 5 },
      ],
      isRematch: true,
      nextTurnId: "user-b",
    };

    await lobby.challenge("user-b", "standard", rematchInfo);

    expect(mockNchan.publishChallenge).toHaveBeenCalledWith(expect.objectContaining({
      type: "offer",
      recipientId: "user-b",
      rematch: rematchInfo
    }));
  });

  it("should work without rematch info", async () => {
    await lobby.challenge("user-b", "standard");

    expect(mockNchan.publishChallenge).toHaveBeenCalledWith(expect.objectContaining({
      type: "offer",
      recipientId: "user-b",
      rematch: undefined
    }));
  });
});
