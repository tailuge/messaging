import { Lobby, LobbyOptions } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";

const messages = [
  {
    "messageType": "presence",
    "type": "join",
    "userId": "Luke-2oo0v",
    "userName": "Lukey",
    "clientTs": 1781710676099,
    "meta": {
      "ts": 1781710676329,
      "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "GB",
      "city": "x",
      "since": 1781710676329,
      "version": "v4.37"
    }
  },
  {
    "messageType": "presence",
    "type": "join",
    "userId": "u1alicu",
    "userName": "Alice",
    "clientTs": 1781710701171,
    "meta": {
      "ts": 1781710701206,
      "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "GB",
      "city": "x",
      "since": 1781710676329,
      "version": "v4.37"
    }
  }
];

describe("Debug Replay", () => {
  it("should process captured messages and list active users", async () => {
    let onMessage: ((data: string) => void) | undefined;

    const mockNchan = {
      subscribePresence: jest.fn((_userId: string, callback: (data: string) => void) => {
        onMessage = callback;
        return { stop: jest.fn(), ready: Promise.resolve() };
      }),
      publishPresence: jest.fn().mockResolvedValue(undefined),
      publishChallenge: jest.fn().mockResolvedValue(undefined),
      publishChat: jest.fn().mockResolvedValue(undefined),
    };

    const lobby = new Lobby(
      mockNchan as unknown as NchanClient,
      {
        messageType: "presence" as const,
        type: "join" as const,
        userId: "u1alicu",
        userName: "Alice",
      },
      { heartbeatInterval: 999999 },
    );

    await lobby.join();
    expect(onMessage).toBeDefined();
    if (!onMessage) throw new Error("onMessage not set");

    console.log("=== BEFORE SENDING MESSAGES ===");
    console.log("currentUsers:", lobby.getUsers());
    console.log("joinSentinelTs:", lobby.joinSentinelTs);
    console.log("isSettled:", lobby.isSettled);
    console.log("unsettledPresenceMessages length:", lobby.unsettledPresenceMessages.length);

    // Feed all captured messages
    for (const msg of messages) {
      console.log("=== SENDING MESSAGE ===");
      console.log("Message:", msg);
      onMessage(JSON.stringify(msg));
      console.log("=== AFTER PROCESSING ===");
      console.log("currentUsers:", lobby.getUsers());
      console.log("joinSentinelTs:", lobby.joinSentinelTs);
      console.log("isSettled:", lobby.isSettled);
      console.log("unsettledPresenceMessages length:", lobby.unsettledPresenceMessages.length);
    }

    console.log("=== AFTER ALL MESSAGES ===");
    console.log("currentUsers:", lobby.getUsers());
    console.log("joinSentinelTs:", lobby.joinSentinelTs);
    console.log("isSettled:", lobby.isSettled);
    console.log("unsettledPresenceMessages length:", lobby.unsettledPresenceMessages.length);

    // Collect the final user list
    const users: any[] = [];
    lobby.onUsersChange((u) => {
      users.length = 0;
      users.push(...u);
      console.log("=== USERS CHANGE ===");
      console.log("users:", users);
    });

    console.log("=== FINAL STATE ===");
    console.log("currentUsers:", lobby.getUsers());
    console.log("joinSentinelTs:", lobby.joinSentinelTs);
    console.log("isSettled:", lobby.isSettled);
    console.log("unsettledPresenceMessages length:", lobby.unsettledPresenceMessages.length);

    expect(users).not.toBeNull();
    expect(users.length).toBeGreaterThan(0);

    const userIds = users.map((u: any) => u.userId).sort();
    console.log("=== REPLAY RESULT ===");
    console.log("userIds:", userIds);
    console.log("users:", JSON.stringify(users.map(({ ...rest }: any) => rest), null, 2));

    expect(userIds).toEqual(["Luke-2oo0v", "u1alicu"]);
  });
});
