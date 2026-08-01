import { Lobby } from "../src/lobby";
import { PresenceMessage } from "../src/types";

describe("Lobby - Presence Options", () => {
  const mockNchan: any = {
    subscribePresence: jest.fn().mockReturnValue({
      ready: Promise.resolve(),
      stop: jest.fn(),
    }),
    publishPresence: jest.fn().mockResolvedValue(undefined),
    publishChallenge: jest.fn().mockResolvedValue(undefined),
  };

  const currentUser: PresenceMessage = {
    messageType: "presence",
    type: "join",
    userId: "me",
    userName: "Me",
  };

  it("should have options property on PresenceMessage", () => {
    const msg: PresenceMessage = {
      messageType: "presence",
      type: "join",
      userId: "user-1",
      userName: "User 1",
      options: { raceTo: "15", handicap: "true" },
    };
    expect(msg.options).toBeDefined();
    expect(msg.options?.raceTo).toBe("15");
  });

  it("should detect meaningful change when options are updated", () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);

    // Initial call
    expect(listener).toHaveBeenCalledTimes(1);

    const baseMsg = {
      messageType: "presence",
      type: "heartbeat",
      userId: "user-1",
      userName: "User 1",
      ruleType: "threecushion",
    };

    // First heartbeat (user discovered)
    (lobby as any).handleIncomingMessage(JSON.stringify(baseMsg));
    expect(listener).toHaveBeenCalledTimes(2);

    // Second heartbeat with options added
    const msgWithOpts = {
      ...baseMsg,
      options: { raceTo: "15" },
    };
    (lobby as any).handleIncomingMessage(JSON.stringify(msgWithOpts));
    expect(listener).toHaveBeenCalledTimes(3);

    // Third heartbeat with same options - should NOT trigger listener
    const sameOpts = {
      ...msgWithOpts,
    };
    (lobby as any).handleIncomingMessage(JSON.stringify(sameOpts));
    expect(listener).toHaveBeenCalledTimes(3);

    // Fourth heartbeat with modified options - should trigger listener
    const modifiedOpts = {
      ...msgWithOpts,
      options: { raceTo: "15", shotClock: "45" },
    };
    (lobby as any).handleIncomingMessage(JSON.stringify(modifiedOpts));
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("should propagate options and ruleType to updatePresence during acceptChallenge", async () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const updatePresenceSpy = jest.spyOn(lobby, "updatePresence");

    const userId = "opponent-id";
    const ruleType = "threecushion";
    const tableId = "table-123";
    const options = { raceTo: "25", shotClock: "30" };

    await lobby.acceptChallenge(userId, ruleType, tableId, options);

    expect(updatePresenceSpy).toHaveBeenCalledWith({
      tableId,
      ruleType,
      options,
    });
  });
});
