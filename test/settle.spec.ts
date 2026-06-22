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

  it("fires onSettled after sentinel join echoes back + 300ms settle timer", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    // Capture the sentinelTs that Lobby published
    const publishCall = mockNchan.publishPresence.mock.calls[0][0];
    const sentinelTs = publishCall.clientTs;
    expect(sentinelTs).toBeGreaterThan(0);

    let settled = false;
    lobby.onSettled(() => { settled = true; });

    // Before sentinel: not settled
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

    // Still not settled — 300ms timer hasn't fired
    expect(settled).toBe(false);

    // Advance past the 300ms settle timer
    jest.advanceTimersByTime(299);
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    expect(settled).toBe(true);
  });

  it("fires onSettled immediately if registered after already settled", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    const sentinelTs = mockNchan.publishPresence.mock.calls[0][0].clientTs;

    // Send sentinel and let settle timer fire
    feed({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
      clientTs: sentinelTs,
    });
    jest.advanceTimersByTime(300);

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
      clientTs: sentinelTs - 99999, // different ts
    });

    // Should not trigger settle timers
    jest.advanceTimersByTime(500);
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

    jest.advanceTimersByTime(500);
    expect(settled).toBe(false);
  });

  it("fires onSettled via safety timeout if sentinel never received", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    let settled = false;
    lobby.onSettled(() => { settled = true; });

    // Sentinel is never received — safety timeout should fire after 5s
    jest.advanceTimersByTime(4999);
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    expect(settled).toBe(true);
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
    jest.advanceTimersByTime(500);
    expect(settled).toBe(false);
    expect(preLeaveSettled).toBe(false); // old listener was cleared

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
    jest.advanceTimersByTime(300);
    expect(settled).toBe(true);
    expect(preLeaveSettled).toBe(false); // old listener stays dead
  });

  it("does not fire onSettled for reconnect presence (no type field) — settled via safety timeout only", async () => {
    const lobby = makeLobby("bob", "Bob");
    await lobby.join();

    let settled = false;
    lobby.onSettled(() => { settled = true; });

    // Feed a reconnect-like presence (no type field, userId matches)
    // This should NOT trigger the sentinel (type !== "join")
    feed({
      messageType: "presence",
      userId: "bob",
      userName: "Bob",
      clientTs: 99999,
    });

    // Not settled by the reconnect message
    jest.advanceTimersByTime(1000);
    expect(settled).toBe(false);

    // The 5s safety timer (armed in join()) fires
    jest.advanceTimersByTime(4000);
    expect(settled).toBe(true);
  });
});
