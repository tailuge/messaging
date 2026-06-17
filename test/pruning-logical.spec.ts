import { Lobby } from "../src/lobby";
import { PresenceMessage } from "../src/types";

describe("Lobby - Pruning with Logical Time", () => {
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

  it("should NOT prune replayed users if their meta.ts is fresh relative to maxSeenServerTs", () => {
    // Set staleTtl to 90s
    const lobby = new Lobby(mockNchan, currentUser, { staleTtl: 90000 });
    const listener = jest.fn();
    lobby.onUsersChange(listener);

    // Mock Date.now to be 100s ahead of the replayed messages (simulating clock drift)
    const baseServerTime = 1000000;
    const clientTime = baseServerTime + 100000; // 100s drift
    jest.spyOn(Date, 'now').mockReturnValue(clientTime);

    // Replayed message from 85s ago (relative to server time)
    const replayedMsg = {
      messageType: "presence",
      type: "heartbeat",
      userId: "user1",
      userName: "User 1",
      meta: { ts: baseServerTime - 85000 }
    };

    // Client sees replayedMsg. relative to clientTime it is 185s old.
    // Relative to baseServerTime it is 85s old.

    (lobby as any).handleIncomingMessage(JSON.stringify(replayedMsg));
    expect((lobby as any).getUsersList().length).toBe(1);

    // Run pruning.
    // If it uses Date.now(), it will see (clientTime - (baseServerTime - 85000)) = 185000 > 90000 -> PRUNE
    // If it uses maxSeenServerTs (baseServerTime - 85000), it will see 0 -> NO PRUNE
    (lobby as any).startPruning();

    // We need to trigger the interval manually or mock it.
    // Lobby.ts uses setInterval, let's just call the internal logic if we can or wait.
    // Easier: trigger another message to update maxSeenServerTs if needed, but here replayedMsg already updated it.

    // Fast-forward time in Jest
    jest.useFakeTimers();
    (lobby as any).startPruning();
    jest.advanceTimersByTime(30000);

    // Should NOT be pruned because now (maxSeenServerTs) is replayedMsg.meta.ts
    expect((lobby as any).getUsersList().length).toBe(1);

    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should prune users when logical time advances", () => {
    const lobby = new Lobby(mockNchan, currentUser, { staleTtl: 90000, pruneInterval: 30000 });
    jest.useFakeTimers();

    const baseTime = 1000000;

    // User 1 at T=0
    (lobby as any).handleIncomingMessage(JSON.stringify({
      messageType: "presence",
      type: "heartbeat",
      userId: "user1",
      userName: "User 1",
      meta: { ts: baseTime }
    }));

    // User 2 at T=10s
    (lobby as any).handleIncomingMessage(JSON.stringify({
      messageType: "presence",
      type: "heartbeat",
      userId: "user2",
      userName: "User 2",
      meta: { ts: baseTime + 10000 }
    }));

    expect((lobby as any).getUsersList().length).toBe(2);

    // Advance logical time to T=100s by receiving a new message from User 2
    (lobby as any).handleIncomingMessage(JSON.stringify({
      messageType: "presence",
      type: "heartbeat",
      userId: "user2",
      userName: "User 2",
      meta: { ts: baseTime + 100000 }
    }));

    // User 1 (last seen T=0) is now 100s old relative to logical time (T=100s)
    // User 2 (last seen T=100s) is fresh.

    (lobby as any).startPruning();
    jest.advanceTimersByTime(30000);

    const users = (lobby as any).getUsersList();
    expect(users.length).toBe(1);
    expect(users[0].userId).toBe("user2");

    jest.useRealTimers();
  });
});
