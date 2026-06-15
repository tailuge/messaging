import { Lobby } from "../src/lobby";
import { PresenceMessage } from "../src/types";

describe("Lobby - Leaving State", () => {
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

  function makeJoin(userId: string, userName: string, ts?: number): string {
    const msg: any = {
      messageType: "presence",
      type: "join",
      userId,
      userName,
    };
    if (ts !== undefined) msg.meta = { ts };
    return JSON.stringify(msg);
  }

  function makeLeave(userId: string, userName: string, ts?: number): string {
    const msg: any = {
      messageType: "presence",
      type: "leave",
      userId,
      userName,
    };
    if (ts !== undefined) msg.meta = { ts };
    return JSON.stringify(msg);
  }

  function makeHeartbeat(userId: string, userName: string, ts?: number): string {
    const msg: any = {
      messageType: "presence",
      type: "heartbeat",
      userId,
      userName,
    };
    if (ts !== undefined) msg.meta = { ts };
    return JSON.stringify(msg);
  }

  it("should keep user in list with isLeaving=true on leave, then remove after grace period via prune", () => {
    jest.useFakeTimers();
    jest.setSystemTime(1000000);
    const lobby = new Lobby(mockNchan, currentUser, { pruneInterval: 100 });
    const listener = jest.fn();
    lobby.onUsersChange(listener);
    listener.mockClear();

    // Start the prune cycle
    (lobby as any).isJoined = true;
    (lobby as any).startPruning();

    // User joins at T=1000000
    (lobby as any).handleIncomingMessage(makeJoin("alice", "Alice", 1000000));
    expect(listener).toHaveBeenCalledTimes(1);
    let users = listener.mock.calls[listener.mock.calls.length - 1][0];
    const aliceJoin = users.find((u: PresenceMessage) => u.userId === "alice");
    expect(aliceJoin).toBeDefined();
    expect(aliceJoin.isLeaving).toBe(false);

    // User leaves at T=1001000
    (lobby as any).handleIncomingMessage(makeLeave("alice", "Alice", 1001000));
    expect(listener).toHaveBeenCalledTimes(2);
    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    const alice = users.find((u: PresenceMessage) => u.userId === "alice");
    expect(alice).toBeDefined();
    expect(alice.isLeaving).toBe(true);

    // Advance time past grace period (5s) and trigger prune
    jest.setSystemTime(1001000 + 6000);
    jest.advanceTimersByTime(100);
    expect(listener).toHaveBeenCalledTimes(3);
    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "alice")).toBeUndefined();

    jest.useRealTimers();
  });

  it("should cancel leave if user rejoins with newer timestamp", () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);
    listener.mockClear();

    // User joins then leaves
    (lobby as any).handleIncomingMessage(makeJoin("bob", "Bob", 1000));
    (lobby as any).handleIncomingMessage(makeLeave("bob", "Bob", 2000));

    let users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "bob").isLeaving).toBe(true);

    // User rejoins with newer timestamp — grey should clear
    (lobby as any).handleIncomingMessage(makeJoin("bob", "Bob", 3000));

    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    const bob = users.find((u: PresenceMessage) => u.userId === "bob");
    expect(bob).toBeDefined();
    expect(bob.isLeaving).toBe(false);
  });

  it("should cancel leave if heartbeat arrives with newer timestamp", () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);
    listener.mockClear();

    (lobby as any).handleIncomingMessage(makeJoin("carol", "Carol", 1000));
    (lobby as any).handleIncomingMessage(makeLeave("carol", "Carol", 2000));

    // Heartbeat with newer timestamp cancels the leave
    (lobby as any).handleIncomingMessage(makeHeartbeat("carol", "Carol", 3000));

    let users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "carol").isLeaving).toBe(false);
  });

  it("should ignore stale messages (older than leave) during replay", () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);
    listener.mockClear();

    // User joins at T=1000
    (lobby as any).handleIncomingMessage(makeJoin("dave", "Dave", 1000));
    expect(listener).toHaveBeenCalledTimes(1);

    // User leaves at T=5000
    (lobby as any).handleIncomingMessage(makeLeave("dave", "Dave", 5000));
    expect(listener).toHaveBeenCalledTimes(2);
    let users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "dave").isLeaving).toBe(true);

    // Replay: old join at T=1000 arrives (stale) — should NOT clear grey
    (lobby as any).handleIncomingMessage(makeJoin("dave", "Dave", 1000));
    // No new notification — stale message is silently dropped
    expect(listener).toHaveBeenCalledTimes(2);
    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "dave").isLeaving).toBe(true);

    // Replay: old heartbeat at T=1000 arrives (stale) — should also be ignored
    (lobby as any).handleIncomingMessage(makeHeartbeat("dave", "Dave", 1000));
    expect(listener).toHaveBeenCalledTimes(2);
    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "dave").isLeaving).toBe(true);

    // New join at T=6000 — SHOULD clear grey
    (lobby as any).handleIncomingMessage(makeJoin("dave", "Dave", 6000));
    expect(listener).toHaveBeenCalledTimes(3);
    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    const dave = users.find((u: PresenceMessage) => u.userId === "dave");
    expect(dave).toBeDefined();
    expect(dave.isLeaving).toBe(false);
  });

  it("should clear leave timestamps on lobby.leave()", async () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);

    (lobby as any).handleIncomingMessage(makeJoin("eve", "Eve", 1000));
    (lobby as any).handleIncomingMessage(makeLeave("eve", "Eve", 2000));

    expect((lobby as any).leaveTimestamps.size).toBe(1);

    // Lobby teardown should clear timestamps
    await lobby.leave();
    expect((lobby as any).leaveTimestamps.size).toBe(0);
  });
});
