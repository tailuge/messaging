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

  function makeJoin(userId: string, userName: string): string {
    return JSON.stringify({
      messageType: "presence",
      type: "join",
      userId,
      userName,
    });
  }

  function makeLeave(userId: string, userName: string): string {
    return JSON.stringify({
      messageType: "presence",
      type: "leave",
      userId,
      userName,
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should keep user in list with isLeaving=true on leave, then remove after 5s", () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);
    listener.mockClear();

    // User joins
    (lobby as any).handleIncomingMessage(makeJoin("alice", "Alice"));
    expect(listener).toHaveBeenCalledTimes(1);
    let users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "alice")).toBeDefined();
    expect(users.find((u: PresenceMessage) => u.userId === "alice").isLeaving).toBe(false);

    // User leaves — should stay in list with isLeaving=true
    (lobby as any).handleIncomingMessage(makeLeave("alice", "Alice"));
    expect(listener).toHaveBeenCalledTimes(2);
    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    const alice = users.find((u: PresenceMessage) => u.userId === "alice");
    expect(alice).toBeDefined();
    expect(alice.isLeaving).toBe(true);

    // After 5s, user is removed
    jest.advanceTimersByTime(5000);
    expect(listener).toHaveBeenCalledTimes(3);
    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "alice")).toBeUndefined();
  });

  it("should cancel leave timer if user rejoins within grace period", () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);
    listener.mockClear();

    // User joins then leaves
    (lobby as any).handleIncomingMessage(makeJoin("bob", "Bob"));
    (lobby as any).handleIncomingMessage(makeLeave("bob", "Bob"));

    let users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "bob").isLeaving).toBe(true);

    // User rejoins before 5s — timer should be cancelled
    jest.advanceTimersByTime(2000);
    (lobby as any).handleIncomingMessage(makeJoin("bob", "Bob"));

    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    const bob = users.find((u: PresenceMessage) => u.userId === "bob");
    expect(bob).toBeDefined();
    expect(bob.isLeaving).toBe(false);

    // Advance past original 5s — user should still be present
    jest.advanceTimersByTime(4000);
    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "bob")).toBeDefined();
  });

  it("should cancel leave timer if user sends heartbeat", () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);
    listener.mockClear();

    (lobby as any).handleIncomingMessage(makeJoin("carol", "Carol"));
    (lobby as any).handleIncomingMessage(makeLeave("carol", "Carol"));

    // Heartbeat cancels the leave
    (lobby as any).handleIncomingMessage(
      JSON.stringify({ messageType: "presence", type: "heartbeat", userId: "carol", userName: "Carol" }),
    );

    let users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "carol").isLeaving).toBe(false);

    jest.advanceTimersByTime(6000);
    users = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(users.find((u: PresenceMessage) => u.userId === "carol")).toBeDefined();
  });

  it("should clear leave timers on lobby.leave()", async () => {
    const lobby = new Lobby(mockNchan, currentUser);
    const listener = jest.fn();
    lobby.onUsersChange(listener);

    (lobby as any).handleIncomingMessage(makeJoin("dave", "Dave"));
    (lobby as any).handleIncomingMessage(makeLeave("dave", "Dave"));

    // Lobby teardown should clear timers without throwing
    await lobby.leave();
    expect((lobby as any).leaveTimers.size).toBe(0);

    // Advancing timers should not cause errors or extra notifications
    const countBefore = listener.mock.calls.length;
    jest.advanceTimersByTime(10000);
    expect(listener.mock.calls.length).toBe(countBefore);
  });
});
