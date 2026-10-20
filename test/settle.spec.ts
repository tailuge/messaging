import { Lobby } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";

describe("Lobby join, snapshot and settle (onSettled)", () => {
  let mockNchan: any;
  let onMessage: any;
  let snapshotResolve: ((value: any) => void) | undefined;
  let snapshotReject: ((err: Error) => void) | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    onMessage = undefined;
    snapshotResolve = undefined;
    snapshotReject = undefined;
    mockNchan = {
      subscribePresence: jest.fn((_userId: string, callback: (data: string) => void) => {
        onMessage = callback;
        return { stop: jest.fn(), ready: Promise.resolve() };
      }),
      publishPresence: jest.fn().mockResolvedValue(undefined),
      publishChallenge: jest.fn().mockResolvedValue(undefined),
      publishChat: jest.fn().mockResolvedValue(undefined),
      fetchPresenceSnapshot: jest.fn(
        () =>
          new Promise((resolve, reject) => {
            snapshotResolve = resolve;
            snapshotReject = reject;
          }),
      ),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeLobby(userId = "bob", userName = "Bob"): Lobby {
    return new Lobby(
      mockNchan as unknown as NchanClient,
      { messageType: "presence" as const, type: "join" as const, userId, userName },
      { heartbeatInterval: 999999 },
    );
  }

  function feed(msg: object): void {
    if (!onMessage) throw new Error("onMessage not set");
    onMessage(JSON.stringify(msg));
  }

  // Lets the join reach the snapshot await.
  async function untilSnapshotRequested(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(mockNchan.fetchPresenceSnapshot).toHaveBeenCalled();
  }

  function presence(userId: string, userName: string, ts: number, type = "heartbeat") {
    return { messageType: "presence", type, userId, userName, meta: { ts } };
  }

  it("settles once after the snapshot is applied", async () => {
    const lobby = makeLobby();
    let settledCount = 0;
    lobby.onSettled(() => settledCount++);

    const joining = lobby.join();
    await untilSnapshotRequested();
    expect(lobby.settled).toBe(false);

    snapshotResolve!({ ts: 1000, users: [presence("bob", "Bob", 900), presence("carol", "Carol", 950)] });
    await joining;

    expect(lobby.settled).toBe(true);
    expect(settledCount).toBe(1);
    expect(lobby.getUsers().map((u) => u.userId)).toEqual(["bob", "carol"]);
  });

  it("fires onSettled immediately if registered after settle", async () => {
    const lobby = makeLobby();
    const joining = lobby.join();
    await untilSnapshotRequested();
    snapshotResolve!({ ts: 1000, users: [] });
    await joining;

    let settled = false;
    lobby.onSettled(() => (settled = true));
    expect(settled).toBe(true);
  });

  it("settles with live state when the snapshot fails", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const lobby = makeLobby();
    const joining = lobby.join();
    await untilSnapshotRequested();
    snapshotReject!(new Error("timeout"));
    await joining;

    expect(lobby.settled).toBe(true);
    // A later heartbeat still adds users
    feed(presence("carol", "Carol", 2000));
    expect(lobby.getUsers().map((u) => u.userId)).toEqual(["carol"]);
  });

  it("drops buffered frames the snapshot already reflects, applies newer ones", async () => {
    const lobby = makeLobby();
    const joining = lobby.join();
    await untilSnapshotRequested();

    // Buffered during join: a stale join for dave (left before the snapshot) and a newer join for erin
    feed(presence("dave", "Dave", 800, "join"));
    feed(presence("erin", "Erin", 1100, "join"));

    snapshotResolve!({ ts: 1000, users: [presence("bob", "Bob", 990)] });
    await joining;

    expect(lobby.getUsers().map((u) => u.userId)).toEqual(["bob", "erin"]);
  });

  it("buffers challenges during join and emits unresolved offers on settle", async () => {
    const lobby = makeLobby();
    const challenges: any[] = [];
    lobby.onChallenge((c) => challenges.push(c));

    const joining = lobby.join();
    await untilSnapshotRequested();

    feed({
      messageType: "challenge",
      type: "offer",
      challengerId: "alice",
      challengerName: "Alice",
      challengeeId: "bob",
      ruleType: "eightball",
      tableId: "table-1",
    });
    expect(challenges).toHaveLength(0);

    snapshotResolve!({ ts: 1000, users: [] });
    await joining;

    expect(challenges).toHaveLength(1);
    expect(challenges[0].type).toBe("offer");
  });

  it("drops offers that were resolved in the same join window", async () => {
    const lobby = makeLobby();
    const challenges: any[] = [];
    lobby.onChallenge((c) => challenges.push(c));

    const joining = lobby.join();
    await untilSnapshotRequested();

    const offer = {
      messageType: "challenge",
      type: "offer",
      challengerId: "alice",
      challengerName: "Alice",
      challengeeId: "bob",
      ruleType: "eightball",
      tableId: "table-1",
    };
    feed(offer);
    feed({ ...offer, type: "accept" });

    snapshotResolve!({ ts: 1000, users: [] });
    await joining;

    expect(challenges).toHaveLength(0);
  });

  it("emits challenges immediately after settle", async () => {
    const lobby = makeLobby();
    const joining = lobby.join();
    await untilSnapshotRequested();
    snapshotResolve!({ ts: 1000, users: [] });
    await joining;

    const challenges: any[] = [];
    lobby.onChallenge((c) => challenges.push(c));
    feed({
      messageType: "challenge",
      type: "offer",
      challengerId: "alice",
      challengerName: "Alice",
      challengeeId: "bob",
      ruleType: "eightball",
      tableId: "table-1",
    });
    expect(challenges).toHaveLength(1);
  });

  it("refreshSnapshot replaces the user list, removing users who went offline", async () => {
    const lobby = makeLobby();
    const joining = lobby.join();
    await untilSnapshotRequested();
    snapshotResolve!({ ts: 1000, users: [presence("bob", "Bob", 990), presence("carol", "Carol", 995)] });
    await joining;
    expect(lobby.getUsers()).toHaveLength(2);

    const refresh = lobby.refreshSnapshot();
    snapshotResolve!({ ts: 2000, users: [presence("bob", "Bob", 1990)] });
    await refresh;

    expect(lobby.getUsers().map((u) => u.userId)).toEqual(["bob"]);
  });

  it("refreshSnapshot keeps the current list when the fetch fails", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const lobby = makeLobby();
    const joining = lobby.join();
    await untilSnapshotRequested();
    snapshotResolve!({ ts: 1000, users: [presence("carol", "Carol", 995)] });
    await joining;

    const refresh = lobby.refreshSnapshot();
    snapshotReject!(new Error("down"));
    await refresh;

    expect(lobby.getUsers().map((u) => u.userId)).toEqual(["carol"]);
  });

  it("resets settle state on leave()", async () => {
    const lobby = makeLobby();
    const joining = lobby.join();
    await untilSnapshotRequested();
    snapshotResolve!({ ts: 1000, users: [] });
    await joining;
    expect(lobby.settled).toBe(true);

    await lobby.leave();
    expect(lobby.settled).toBe(false);
  });
});
