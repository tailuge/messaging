import { Lobby } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";

describe("Lobby settle detection (onSettled)", () => {
  let mockNchan: any;
  let onMessage: any;

  beforeEach(() => {
    jest.useFakeTimers();
    onMessage = undefined;
    mockNchan = {
      subscribePresence: jest.fn((_userId: string, callback: (data: string) => void) => {
        onMessage = callback;
        return { stop: jest.fn(), ready: Promise.resolve() };
      }),
      publishPresence: jest.fn().mockResolvedValue(undefined),
      publishChallenge: jest.fn().mockResolvedValue(undefined),
      publishChat: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeLobby(userId = "alice", userName = "Alice"): Lobby {
    return new Lobby(
      mockNchan as unknown as NchanClient,
      {
        messageType: "presence" as const,
        type: "join" as const,
        userId,
        userName,
      },
      { heartbeatInterval: 999999 },
    );
  }

  function feed(msg: object): void {
    if (!onMessage) throw new Error("onMessage not set");
    onMessage(JSON.stringify(msg));
  }

  // ── Basic settle detection ──────────────────────────────────────────

  it("fires onSettled when sentinel join echoes back", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    const publishCall = mockNchan.publishPresence.mock.calls[0][0];
    const sentinelTs = publishCall.clientTs;
    expect(sentinelTs).toBeGreaterThan(0);

    let settled = false;
    lobby.onSettled(() => { settled = true; });

    expect(settled).toBe(false);

    // Feed a challenge offer from opponent (simulates buffered message)
    feed({
      messageType: "challenge",
      type: "offer",
      challengerId: "alice",
      challengerName: "Alice",
      challengeeId: "bob",
      ruleType: "eightball",
      tableId: "table-1",
    });

    // Feed our own join sentinel (last message in Nchan buffer)
    feed({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
      clientTs: sentinelTs,
    });

    // Settled fires immediately on sentinel detection
    expect(settled).toBe(true);
  });

  it("fires onSettled immediately if registered after already settled", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    const sentinelTs = mockNchan.publishPresence.mock.calls[0][0].clientTs;

    // Send sentinel
    feed({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
      clientTs: sentinelTs,
    });

    // Register after settled — should fire immediately
    let settled = false;
    lobby.onSettled(() => { settled = true; });
    expect(settled).toBe(true);
  });

  it("does not fire onSettled on stale join with different clientTs", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    const sentinelTs = mockNchan.publishPresence.mock.calls[0][0].clientTs;

    let settled = false;
    lobby.onSettled(() => { settled = true; });

    // Feed a stale join from a previous session (different clientTs)
    feed({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
      clientTs: sentinelTs - 99999,
    });

    expect(settled).toBe(false);
  });

  it("does not fire onSettled on heartbeat with matching userId (type !== join)", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    const sentinelTs = mockNchan.publishPresence.mock.calls[0][0].clientTs;

    let settled = false;
    lobby.onSettled(() => { settled = true; });

    // Feed a heartbeat (same userId and clientTs would be unusual but possible)
    feed({
      messageType: "presence",
      type: "heartbeat",
      userId: "bob",
      userName: "Bob",
      clientTs: sentinelTs,
    });

    expect(settled).toBe(false);
  });

  it("resets settle state on leave()", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    const sentinelTs = mockNchan.publishPresence.mock.calls[0][0].clientTs;

    // Register a listener — will be cleared by leave()
    let preLeaveSettled = false;
    lobby.onSettled(() => { preLeaveSettled = true; });

    // Leave before sentinel arrives (leave clears settle state including listeners)
    await lobby.leave();

    // Advance the fake clock so the re-join gets a different Date.now() value
    jest.setSystemTime(jest.getRealSystemTime() + 1000);

    // Re-join with new sentinel
    await lobby.join();

    // Register a new listener for the new session
    let settled = false;
    lobby.onSettled(() => { settled = true; });

    // Old sentinel arrives — should not trigger (different clientTs from new session)
    feed({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
      clientTs: sentinelTs,
    });
    expect(settled).toBe(false);
    expect(preLeaveSettled).toBe(false);

    // Now feed the actual new sentinel to verify settlement still works
    // calls[0] = first join, calls[1] = leave, calls[2] = second join
    const newSentinelTs = mockNchan.publishPresence.mock.calls[2][0].clientTs;
    feed({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
      clientTs: newSentinelTs,
    });
    expect(settled).toBe(true);
    expect(preLeaveSettled).toBe(false);
  });

  // ── Challenge buffering + two-pass dedup on settle ──────────────────

  it("buffers challenges during unsettled period and dedups resolved offers on settle", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    const publishCall = mockNchan.publishPresence.mock.calls[0][0];
    const sentinelTs = publishCall.clientTs;

    let challenges: any[] = [];
    lobby.onChallenge((c) => challenges.push(c));

    // Simulate Nchan buffer replay: offer arrives, then accept (FIFO)
    feed({
      messageType: "challenge",
      type: "offer",
      challengerId: "alice",
      challengerName: "Alice",
      challengeeId: "bob",
      ruleType: "eightball",
      tableId: "table-1",
    });
    feed({
      messageType: "challenge",
      type: "accept",
      challengerId: "alice",
      challengerName: "Alice",
      challengeeId: "bob",
      ruleType: "eightball",
      tableId: "table-1",
    });

    // Nothing emitted during unsettled period
    expect(challenges).toHaveLength(0);

    // Feed sentinel — triggers fireSettled with two-pass dedup
    feed({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
      clientTs: sentinelTs,
    });

    // Offer resolved by accept → filtered. Accept not relevant to bob → not emitted.
    expect(challenges).toHaveLength(0);
    expect(lobby.settled).toBe(true);
  });

  it("emits unresolved offers on settle", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    const publishCall = mockNchan.publishPresence.mock.calls[0][0];
    const sentinelTs = publishCall.clientTs;

    let challenges: any[] = [];
    lobby.onChallenge((c) => challenges.push(c));

    // Unresolved offer (no accept/decline follows)
    feed({
      messageType: "challenge",
      type: "offer",
      challengerId: "alice",
      challengerName: "Alice",
      challengeeId: "bob",
      ruleType: "eightball",
      tableId: "table-1",
    });
    expect(challenges).toHaveLength(0); // buffered

    feed({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
      clientTs: sentinelTs,
    });

    expect(challenges).toHaveLength(1);
    expect(challenges[0].type).toBe("offer");
    expect(lobby.settled).toBe(true);
  });

  it("emits challenges immediately after settle (direct path)", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    // Manually settle
    const sentinelTs = mockNchan.publishPresence.mock.calls[0][0].clientTs;
    feed({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
      clientTs: sentinelTs,
    });
    expect(lobby.settled).toBe(true);

    let challenges: any[] = [];
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

    // Immediately emitted because already settled
    expect(challenges).toHaveLength(1);
    expect(challenges[0].type).toBe("offer");
  });
});
