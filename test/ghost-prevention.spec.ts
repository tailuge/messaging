import { Lobby } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";
import { PresenceMessage } from "../src/types";

jest.mock("../src/nchanclient");

describe("Lobby Ghost Prevention (Clock Skew)", () => {
  let lobby: Lobby;
  let mockNchan: any;
  let mockSubscription: any;

  const currentUser: PresenceMessage = {
    messageType: "presence",
    userId: "me",
    userName: "Me",
    type: "join",
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockSubscription = {
      ready: Promise.resolve(),
      stop: jest.fn(),
    };
    mockNchan = {
      subscribePresence: jest.fn().mockReturnValue(mockSubscription),
      publishPresence: jest.fn().mockResolvedValue({ ok: true }),
    } as any;

    lobby = new Lobby(mockNchan, currentUser, {
      staleTtl: 1000,
      pruneInterval: 100,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should prune users based on local arrival time, even if server timestamp is in the future", async () => {
    let presenceCallback: (data: string) => void = () => {};
    mockNchan.subscribePresence.mockImplementation((cb: any) => {
      presenceCallback = cb;
      return mockSubscription;
    });

    await lobby.join();

    const futureTime = Date.now() + 10000;
    const peerUser: PresenceMessage = {
      messageType: "presence",
      userId: "peer",
      userName: "Peer",
      type: "heartbeat",
      meta: {
        ts: futureTime, // Server clock is 10s ahead
        ua: "",
        ip: "",
        origin: "",
        method: "POST",
        country: "XX",
      },
    };

    presenceCallback(JSON.stringify(peerUser));

    // Verify peer is in the list
    let users: PresenceMessage[] = [];
    lobby.onUsersChange((u) => (users = u));
    expect(users.find((u) => u.userId === "peer")).toBeDefined();

    // Advance time by 1100ms (more than staleTtl of 1000ms)
    jest.advanceTimersByTime(1100);

    // Peer should be pruned because local time advanced, despite server ts being in the future
    expect(users.find((u) => u.userId === "peer")).toBeUndefined();
  });
});
