import { Lobby } from "../src/lobby";
import { PresenceMessage } from "../src/types";

describe("Lobby - Presence Deduplication", () => {
  const mockNchan: any = {
    subscribePresence: jest.fn().mockReturnValue({
      ready: Promise.resolve(),
      stop: jest.fn(),
    }),
    publishPresence: jest.fn().mockResolvedValue(undefined),
  };

  const currentUser: PresenceMessage = {
    messageType: "presence",
    type: "join",
    userId: "me",
    userName: "Me",
  };

  const realWorldData: any[] = [
    {
      "messageType": "presence",
      "type": "heartbeat",
      "userId": "G_e72c_260520",
      "userName": "Anon",
      "ruleType": "eightball",
      "meta": {
        "ts": 1779275062857,
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "origin": "https://billiards.tailuge.workers.dev",
        "country": "US",
        "city": "San Francisco",
        "since": 1779273093068,
        "version": "260520.06-8"
      }
    }
  ];

  it("should NOT notify listeners on identical heartbeat after fix", () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);

    // Initial call from onUsersChange
    expect(listener).toHaveBeenCalledTimes(1);

    const heartbeat = realWorldData[0];

    // Send first heartbeat (initial discovery)
    (lobby as any).handleIncomingMessage(JSON.stringify(heartbeat));
    expect(listener).toHaveBeenCalledTimes(2);

    // Send same heartbeat again (slightly different meta.ts)
    const heartbeat2 = { ...heartbeat, meta: { ...heartbeat.meta, ts: heartbeat.meta.ts + 1000 } };
    (lobby as any).handleIncomingMessage(JSON.stringify(heartbeat2));

    // FIXED BEHAVIOR: It should NOT notify again
    expect(listener).toHaveBeenCalledTimes(2);

    // Send heartbeat with change
    const heartbeat3 = { ...heartbeat, userName: "New Name" };
    (lobby as any).handleIncomingMessage(JSON.stringify(heartbeat3));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("should notify on join and leave", () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    const joinMsg = { ...realWorldData[0], type: "join" };
    (lobby as any).handleIncomingMessage(JSON.stringify(joinMsg));
    expect(listener).toHaveBeenCalledTimes(2);

    const leaveMsg = { ...joinMsg, type: "leave" };
    (lobby as any).handleIncomingMessage(JSON.stringify(leaveMsg));
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
