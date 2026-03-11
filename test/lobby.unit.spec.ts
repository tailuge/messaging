import { Lobby } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";

describe("Lobby (Unit)", () => {
  let mockNchan: any;
  let mockSubscription: any;

  beforeEach(() => {
    mockSubscription = {
      ready: Promise.resolve(),
      stop: jest.fn(),
    };
    mockNchan = {
      subscribePresence: jest.fn().mockReturnValue(mockSubscription),
      publishPresence: jest.fn().mockResolvedValue({ ok: true }),
      publishChallenge: jest.fn().mockResolvedValue({ ok: true }),
    };
  });

  const createLobby = () => {
    const user = {
      messageType: "presence",
      type: "join",
      userId: "alice",
      userName: "Alice",
    };
    return new Lobby(mockNchan as any, user as any, { heartbeatInterval: 100, pruneInterval: 100 });
  };

  it("should wait for ready promise before publishing initial join", async () => {
    const lobby = createLobby();
    const readyResolver = { resolve: () => {} };
    mockSubscription.ready = new Promise<void>((resolve) => {
      readyResolver.resolve = resolve;
    });

    const joinPromise = lobby.join();

    // Check it hasn't published yet
    expect(mockNchan.publishPresence).not.toHaveBeenCalled();

    readyResolver.resolve();
    await joinPromise;

    expect(mockNchan.publishPresence).toHaveBeenCalledWith(
      expect.objectContaining({ type: "join", userId: "alice" })
    );
  });

  it("should start heartbeat and pruning after joining", async () => {
    jest.useFakeTimers();
    const lobby = createLobby();
    await lobby.join();

    expect(mockNchan.publishPresence).toHaveBeenCalledTimes(1); // The initial join

    // Advance for one heartbeat
    jest.advanceTimersByTime(110);
    // Use flushPromises to handle the async heartbeat
    await Promise.resolve();
    expect(mockNchan.publishPresence).toHaveBeenCalledTimes(2);

    // Another heartbeat
    jest.advanceTimersByTime(110);
    await Promise.resolve();
    expect(mockNchan.publishPresence).toHaveBeenCalledTimes(3);

    jest.useRealTimers();
  });

  it("should handle incoming presence updates and notify listeners", async () => {
    const lobby = createLobby();
    await lobby.join(); // MUST JOIN to subscribe
    const callback = jest.fn();
    lobby.onUsersChange(callback);

    // Initial notification
    expect(callback).toHaveBeenCalledWith(expect.any(Array));

    // Get the handler that was passed to subscribePresence
    const incomingHandler = mockNchan.subscribePresence.mock.calls[0][0];

    // Simulate another user joining
    const bobPresence = JSON.stringify({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
    });
    incomingHandler(bobPresence);

    expect(callback).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: "bob" }),
      ])
    );
  });

  it("should prune stale users", async () => {
    jest.useFakeTimers();
    const lobby = createLobby();
    await lobby.join(); // MUST JOIN
    const callback = jest.fn();
    lobby.onUsersChange(callback);

    const incomingHandler = mockNchan.subscribePresence.mock.calls[0][0];

    // Alice is already there (via join but users map only populates from incoming)
    // Actually the current implementation of Lobby only populates users Map from handleIncomingMessage.
    // Let's send Alice's presence too to be sure.
    incomingHandler(JSON.stringify({
      messageType: "presence",
      type: "join",
      userId: "alice",
      userName: "Alice",
    }));

    // Bob joins
    incomingHandler(JSON.stringify({
      messageType: "presence",
      type: "join",
      userId: "bob",
      userName: "Bob",
    }));

    expect(lobby["getUsersList"]()).toHaveLength(2); // Alice + Bob

    // Advance time past staleTtl (default 90s)
    jest.advanceTimersByTime(91000);
    // Advance timers for pruneInterval
    jest.advanceTimersByTime(100);

    // Bob should be pruned, Alice stays because she's current user (userId === this.currentUser.userId skip)
    expect(lobby["getUsersList"]()).toHaveLength(1);
    expect(lobby["getUsersList"]()[0].userId).toBe("alice");

    jest.useRealTimers();
  });

  it("should stop timers and subscriptions on leave", async () => {
    jest.useFakeTimers();
    const lobby = createLobby();
    await lobby.join();

    await lobby.leave();

    expect(mockSubscription.stop).toHaveBeenCalled();
    expect(mockNchan.publishPresence).toHaveBeenCalledWith(
      expect.objectContaining({ type: "leave" })
    );

    // Check timers are cleared
    const callCountAfterLeave = mockNchan.publishPresence.mock.calls.length;
    jest.advanceTimersByTime(200);
    expect(mockNchan.publishPresence.mock.calls.length).toBe(callCountAfterLeave);

    jest.useRealTimers();
  });
});
