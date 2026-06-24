import { Lobby } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";
import { jest } from "@jest/globals";

jest.mock("../src/nchanclient");

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
    "userId": "u1bob",
    "userName": "Bob",
    "clientTs": 1781710679905,
    "meta": {
      "ts": 1781710679969,
      "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "GB",
      "city": "x",
      "since": 1781710676329,
      "version": "v4.37"
    }
  },
  {
    "type": "offer",
    "challengerId": "u1bob",
    "challengerName": "Bob",
    "challengeeId": "Luke-2oo0v",
    "ruleType": "eightball",
    "tableId": "b7000f1b",
    "messageType": "challenge",
    "meta": {
      "ts": 1781710685945,
      "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "GB",
      "city": "x",
      "since": 1781710676329,
      "version": "v4.37"
    }
  },
  {
    "type": "accept",
    "challengerId": "u1bob",
    "challengerName": "Bob",
    "challengeeId": "Luke-2oo0v",
    "ruleType": "eightball",
    "tableId": "b7000f1b",
    "messageType": "challenge",
    "meta": {
      "ts": 1781710687790,
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
    "userId": "Luke-2oo0v",
    "userName": "Lukey",
    "tableId": "b7000f1b",
    "clientTs": 1781710687816,
    "meta": {
      "ts": 1781710687893,
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
    "type": "leave",
    "userId": "u1bob",
    "meta": {
      "ts": 1781710687894,
      "ua": "nchan-auto-leave",
      "origin": "internal"
    }
  },
  {
    "messageType": "presence",
    "type": "leave",
    "userId": "u1bob",
    "userName": "Bob",
    "clientTs": 1781710687870,
    "meta": {
      "ts": 1781710688044,
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
    "type": "leave",
    "userId": "Luke-2oo0v",
    "userName": "Lukey",
    "tableId": "b7000f1b",
    "clientTs": 1781710688154,
    "meta": {
      "ts": 1781710688225,
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
    "type": "leave",
    "userId": "Luke-2oo0v",
    "meta": {
      "ts": 1781710688226,
      "ua": "nchan-auto-leave",
      "origin": "internal"
    }
  },
  {
    "messageType": "presence",
    "type": "join",
    "userId": "u1bob",
    "userName": "Bob",
    "ruleType": "eightball",
    "tableId": "b7000f1b",
    "clientTs": 1781710688299,
    "meta": {
      "ts": 1781710688331,
      "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "GB",
      "city": "x",
      "since": 1781710676329,
      "version": "260617.15-4"
    }
  },
  {
    "messageType": "presence",
    "type": "join",
    "userId": "Luke-2oo0v",
    "userName": "Lukey",
    "ruleType": "eightball",
    "tableId": "b7000f1b",
    "clientTs": 1781710688641,
    "meta": {
      "ts": 1781710688669,
      "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "GB",
      "city": "x",
      "since": 1781710676329,
      "version": "260617.15-4"
    }
  },
  {
    "messageType": "presence",
    "type": "join",
    "userId": "u1bob",
    "userName": "Bob",
    "ruleType": "eightball",
    "tableId": "b7000f1b",
    "clientTs": 1781710693303,
    "meta": {
      "ts": 1781710693385,
      "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "GB",
      "city": "x",
      "since": 1781710676329,
      "version": "260617.15-4"
    }
  },
  {
    "messageType": "presence",
    "type": "join",
    "userId": "Luke-2oo0v",
    "userName": "Lukey",
    "ruleType": "eightball",
    "tableId": "b7000f1b",
    "clientTs": 1781710693441,
    "meta": {
      "ts": 1781710693472,
      "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "GB",
      "city": "x",
      "since": 1781710676329,
      "version": "260617.15-4"
    }
  },
  {
    "messageType": "presence",
    "type": "leave",
    "userId": "u1bob",
    "userName": "Bob",
    "ruleType": "eightball",
    "tableId": "b7000f1b",
    "clientTs": 1781710696253,
    "meta": {
      "ts": 1781710696343,
      "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "GB",
      "city": "x",
      "since": 1781710676329,
      "version": "260617.15-4"
    }
  },
  {
    "messageType": "presence",
    "type": "leave",
    "userId": "u1bob",
    "meta": {
      "ts": 1781710696344,
      "ua": "nchan-auto-leave",
      "origin": "internal"
    }
  },
  {
    "messageType": "presence",
    "type": "join",
    "userId": "Luke-2oo0v",
    "userName": "Lukey",
    "clientTs": 1781710696509,
    "meta": {
      "ts": 1781710696546,
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
    "type": "leave",
    "userId": "Luke-2oo0v",
    "userName": "Lukey",
    "ruleType": "eightball",
    "tableId": "b7000f1b",
    "clientTs": 1781710697825,
    "meta": {
      "ts": 1781710697869,
      "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "GB",
      "city": "x",
      "since": 1781710676329,
      "version": "260617.15-4"
    }
  },
  {
    "messageType": "presence",
    "type": "leave",
    "userId": "Luke-2oo0v",
    "meta": {
      "ts": 1781710697870,
      "ua": "nchan-auto-leave",
      "origin": "internal"
    }
  },
  {
    "messageType": "presence",
    "type": "join",
    "userId": "Luke-2oo0v",
    "userName": "Lukey",
    "clientTs": 1781710698009,
    "meta": {
      "ts": 1781710698038,
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

describe("Replay", () => {
  let onMessage: ((data: string) => void) | undefined;

  const mockNchan = {
    subscribePresence: jest.fn((_userId: string, callback: (data: string) => void) => {
      onMessage = callback;
      return { stop: jest.fn(), ready: Promise.resolve() };
    }),
    publishPresence: jest.fn().mockReturnValue(undefined),
    publishChallenge: jest.fn().mockReturnValue(undefined),
    publishChat: jest.fn().mockReturnValue(undefined),
  };

  it("should process captured messages and list active users", async () => {
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

    // Feed all captured messages
    for (const msg of messages) {
      onMessage(JSON.stringify(msg));
    }

    // Collect the final user list
    const users: any[] = [];
    lobby.onUsersChange((u) => {
      users.length = 0;
      users.push(...u);
    });

    expect(users).not.toBeNull();
    expect(users.length).toBeGreaterThan(0);

    const userIds = users.map((u: any) => u.userId).sort();
    console.log("=== REPLAY RESULT ===");
    console.log("userIds:", userIds);
    console.log("users:", JSON.stringify(users.map(({ ...rest }: any) => rest), null, 2));

    expect(userIds).toEqual(["Luke-2oo0v", "u1alicu"]);
  });

  it.skip("should keep AnOniMouse2 online despite out-of-order leave-after-join", async () => {
    let onMessage: ((data: string) => void) | undefined;

    const mockNchan = {
      subscribePresence: jest.fn((_userId: string, callback: (data: string) => void) => {
        onMessage = callback;
        return { stop: jest.fn(), ready: Promise.resolve() };
      }),
      publishPresence: jest.fn().mockReturnValue(undefined),
      publishChallenge: jest.fn().mockReturnValue(undefined),
      publishChat: jest.fn().mockReturnValue(undefined),
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

    for (const msg of bug) {
      onMessage(JSON.stringify(msg));
    }

    const users: any[] = [];
    lobby.onUsersChange((u) => {
      users.length = 0;
      users.push(...u);
    });

    const userIds = users.map((u: any) => u.userId).sort();
    console.log("=== BUG REPLAY RESULT ===");
    console.log("userIds:", userIds);
    console.log("users:", JSON.stringify(users.map(({ ...rest }: any) => rest), null, 2));

    expect(userIds).toContain("AnOn-cr36t");
  });
}

const bug = [{
    "messageType": "presence",
    "type": "join",
    "userId": "AnOn-cr36t",
    "userName": "AnOniMouse2",
    "clientTs": 1781717348840,
    "meta": {
      "ts": 1781717349142,
      "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0",
      "origin": "https://billiards.tailuge.workers.dev",
      "country": "RO",
      "city": "Iași",
      "since": 1781716114597,
      "version": "v4.37"
    }
  },
  {
    "messageType": "presence",
    "type": "leave",
    "userId": "AnOn-cr36t",
    "meta": {
      "ts": 1781717349143,
      "ua": "nchan-auto-leave",
      "origin": "internal"
    }
  }];