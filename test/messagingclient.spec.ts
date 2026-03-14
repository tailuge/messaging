import { PresenceMessage, ActiveGame, canChallenge, canSpectate, activeGames } from "../src/types";
import {
  startContainer,
  stopContainer,
  createTestClient,
  waitUntil,
  wait,
  cleanupClients,
} from "./utils";

describe("MessagingClient - Phase 1", () => {
  beforeAll(async () => {
    await startContainer();
  });

  afterAll(async () => {
    await stopContainer();
  });

  afterEach(async () => {
    await cleanupClients();
  });

  const createClient = createTestClient;

  describe("Lobby & Presence", () => {
    it("should track multiple users in the lobby accurately", async () => {
      const clientA = createClient();
      const clientB = createClient();

      const userA: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-a",
        userName: "Alice",
      };

      const userB: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-b",
        userName: "Bob",
      };

      // 1. Client A joins lobby
      const lobbyA = await clientA.joinLobby(userA);

      // 2. Client A receives list containing only themselves
      let usersA: PresenceMessage[] = [];
      lobbyA.onUsersChange((u) => (usersA = u));

      // Wait for propagation
      await waitUntil(() => usersA.length === 1 && usersA[0].userId === "user-a");
      expect(usersA[0].userId).toBe("user-a");

      // 3. Client B joins lobby
      const lobbyB = await clientB.joinLobby(userB);

      let usersB: PresenceMessage[] = [];
      lobbyB.onUsersChange((u) => (usersB = u));

      // 4. Both clients should see both users
      await waitUntil(() => usersA.length === 2 && usersB.length === 2);

      const userIdsA = usersA.map((u) => u.userId).sort();
      const userIdsB = usersB.map((u) => u.userId).sort();
      expect(userIdsA).toEqual(["user-a", "user-b"]);
      expect(userIdsB).toEqual(["user-a", "user-b"]);

      // 5. Client B leaves explicitly
      await lobbyB.leave();

      // 6. Client A receives list containing only themselves again
      await waitUntil(() => usersA.length === 1 && usersA[0].userId === "user-a");
      expect(usersA[0].userId).toBe("user-a");
    });

    it("should return users sorted alphabetically by userName", async () => {
      const clientA = createClient();
      const clientB = createClient();
      const clientC = createClient();

      // Join in non-alphabetical order: Charlie, Alice, Bob
      const userC: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-c",
        userName: "Charlie",
      };

      const userA: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-a",
        userName: "Alice",
      };

      const userB: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-b",
        userName: "Bob",
      };

      // Join clients in non-alphabetical order
      const lobbyA = await clientA.joinLobby(userA);
      await clientB.joinLobby(userB);
      await clientC.joinLobby(userC);

      let usersA: PresenceMessage[] = [];
      lobbyA.onUsersChange((u) => (usersA = u));

      // Wait for all three to see each other
      await waitUntil(() => usersA.length === 3);

      // Verify alphabetical sorting by userName
      const userNames = usersA.map((u) => u.userName);
      expect(userNames).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("should show B sees A even when joining after initial heartbeat (message retention)", async () => {
      // Nchan message retention (message_buffer_length=2000, message_timeout=90s)
      // ensures late subscribers receive buffered presence messages.
      const clientA = createClient();
      const clientB = createClient();

      const userA: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-a",
        userName: "Alice",
      };

      const userB: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-b",
        userName: "Bob",
      };

      // 1. Client A joins lobby with long heartbeat (no heartbeats during test)
      const lobbyA = await clientA.joinLobby(userA, {
        heartbeatInterval: 10000,
        pruneInterval: 10000,
        staleTtl: 30000,
      });

      let usersA: PresenceMessage[] = [];
      lobbyA.onUsersChange((u) => (usersA = u));

      // Wait for A to see themselves
      await waitUntil(() => usersA.length === 1 && usersA[0].userId === "user-a");

      // 2. Wait 1 second - no heartbeats will fire
      await wait(1000);

      // 3. Client B joins lobby AFTER A's initial join (but no heartbeat yet)
      const lobbyB = await clientB.joinLobby(userB, {
        heartbeatInterval: 10000,
        pruneInterval: 10000,
        staleTtl: 30000,
      });

      let usersB: PresenceMessage[] = [];
      lobbyB.onUsersChange((u) => (usersB = u));

      // Wait for B to stabilize
      await wait(500);

      // BUG: B should see A but doesn't (because A hasn't sent a heartbeat yet)
      const userIdsB = usersB.map((u) => u.userId);
      
      // This will fail if the bug exists - B should see A but won't
      expect(userIdsB).toContain("user-a");
    }, 10000);

    it("should show A sees B after reconnecting (message retention)", async () => {
      const clientA = createClient();
      const clientB = createClient();

      const userA: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-a",
        userName: "Alice",
      };

      const userB: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-b",
        userName: "Bob",
      };

      // 1. Client A joins lobby
      const lobbyA = await clientA.joinLobby(userA, {
        heartbeatInterval: 100,
        pruneInterval: 100,
        staleTtl: 300,
      });

      let usersA: PresenceMessage[] = [];
      lobbyA.onUsersChange((u) => (usersA = u));

      // Wait for A to see themselves
      await waitUntil(() => usersA.length === 1 && usersA[0].userId === "user-a");

      // 2. Client B joins lobby
      const lobbyB = await clientB.joinLobby(userB, {
        heartbeatInterval: 100,
        pruneInterval: 100,
        staleTtl: 300,
      });

      let usersB: PresenceMessage[] = [];
      lobbyB.onUsersChange((u) => (usersB = u));

      // Wait for both to see each other
      await waitUntil(() => usersA.length === 2 && usersB.length === 2);
      
      expect(usersA.map(u => u.userId).sort()).toEqual(["user-a", "user-b"]);
      expect(usersB.map(u => u.userId).sort()).toEqual(["user-a", "user-b"]);

      // 3. A disconnects and reconnects
      await clientA.stop();
      
      // Give B time to see A leave
      await wait(200);
      
      // A reconnects
      await clientA.start();
      const lobbyA2 = await clientA.joinLobby(userA, {
        heartbeatInterval: 100,
        pruneInterval: 100,
        staleTtl: 300,
      });

      let usersA2: PresenceMessage[] = [];
      lobbyA2.onUsersChange((u) => (usersA2 = u));

      // Wait for A to stabilize after reconnect
      await wait(200);

      // BUG: A should see B but doesn't
      const userIdsA2 = usersA2.map((u) => u.userId);
      
      // This will fail if the bug exists - A should see B but won't
      expect(userIdsA2).toContain("user-b");
    }, 10000);

    it("should update presence metadata correctly", async () => {
      const clientA = createClient();
      const clientB = createClient();

      const lobbyA = await clientA.joinLobby({
        messageType: "presence",
        type: "join",
        userId: "alice",
        userName: "Alice",
      });

      const lobbyB = await clientB.joinLobby({
        messageType: "presence",
        type: "join",
        userId: "bob",
        userName: "Bob",
      });

      let usersB: PresenceMessage[] = [];
      lobbyB.onUsersChange((u) => (usersB = u));

      // Wait for initial join
      await waitUntil(() => usersB.some((u) => u.userId === "bob"));

      // Alice updates her username
      await lobbyA.updatePresence({ userName: "Alice Updated" });

      // Wait for update propagation
      await waitUntil(() =>
        usersB.some((u) => u.userId === "alice" && u.userName === "Alice Updated"),
      );

      const aliceInB = usersB.find((u) => u.userId === "alice");
      expect(aliceInB).toBeDefined();
      expect(aliceInB?.userName).toBe("Alice Updated");
    });
  });

  describe("Challenges & Tables (Phase 2)", () => {
    it("should handle a full challenge/accept and table messaging flow", async () => {
      const clientA = createClient();
      const clientB = createClient();

      const lobbyA = await clientA.joinLobby({
        messageType: "presence",
        type: "join",
        userId: "user-a",
        userName: "Alice",
      });

      const lobbyB = await clientB.joinLobby({
        messageType: "presence",
        type: "join",
        userId: "user-b",
        userName: "Bob",
      });

      // 1. Listen for challenges on B
      let receivedChallenge: any = null;
      lobbyB.onChallenge((c) => {
        receivedChallenge = c;
      });

      // 2. A challenges B
      const tableId = await lobbyA.challenge("user-b", "standard");
      expect(tableId).toBeDefined();

      // Wait for challenge to propagate
      await waitUntil(() => receivedChallenge !== null);
      expect(receivedChallenge.challengerId).toBe("user-a");
      expect(receivedChallenge.tableId).toBe(tableId);

      // 3. B accepts challenge
      const tableB = await lobbyB.acceptChallenge(
        receivedChallenge.challengerId,
        receivedChallenge.ruleType,
        receivedChallenge.tableId,
      );

      // A joins the same table (as it created it)
      const tableA = await clientA.joinTable(tableId, "user-a");

      // 4. Test table messaging
      let messageReceivedByB: any = null;
      tableB.onMessage((m) => {
        messageReceivedByB = m;
      });

      await wait(); // wait for subscription
      await tableA.publish("MOVE", { x: 5, y: 10 });

      await waitUntil(() => messageReceivedByB !== null);
      expect(messageReceivedByB.type).toBe("MOVE");
      expect(messageReceivedByB.data.x).toBe(5);
      expect(messageReceivedByB.senderId).toBe("user-a");
    });

    it("should notify when an opponent leaves the table explicitly", async () => {
      const clientA = createClient();
      const clientB = createClient();

      const tableId = "tableId1";

      // 1. Bob joins lobby and table first
      await clientB.joinLobby({
        messageType: "presence",
        type: "join",
        userId: "user-b",
        userName: "Bob",
      });
      const tableB = await clientB.joinTable(tableId, "user-b");

      let opponentLeft = false;
      tableB.onOpponentLeft(() => {
        opponentLeft = true;
      });

      // Wait for Bob's subscription to be ready
      await wait();

      // 2. Alice joins lobby and table
      await clientA.joinLobby({
        messageType: "presence",
        type: "join",
        userId: "user-a",
        userName: "Alice",
      });
      const tableA = await clientA.joinTable(tableId, "user-a");

      // Wait for presence propagation
      await wait();

      // 3. Alice leaves the table
      await tableA.leave();

      // Bob should be notified
      await waitUntil(() => opponentLeft);
      expect(opponentLeft).toBe(true);
    }, 5000);

    it("should handle challenge decline", async () => {
      // ... (unchanged)
    });
  });

  describe("Reliability (Phase 3)", () => {
    it("should prune a client who stops heartbeating", async () => {
      const clientA = createClient();
      const clientB = createClient();

      // Client A tracks with very aggressive pruning for the test
      const lobbyA = await clientA.joinLobby(
        {
          messageType: "presence",
          type: "join",
          userId: "alice",
          userName: "Alice",
        },
        {
          pruneInterval: 500,
          staleTtl: 1000,
        },
      );

      const lobbyB = await clientB.joinLobby({
        messageType: "presence",
        type: "join",
        userId: "bob",
        userName: "Bob",
      });

      let usersA: PresenceMessage[] = [];
      lobbyA.onUsersChange((u) => (usersA = u));

      // 1. Both see each other
      await waitUntil(() => usersA.some((u) => u.userId === "bob"));
      expect(usersA.find((u) => u.userId === "bob")).toBeDefined();

      // 2. Bob "crashes"
      (lobbyB as any).stopHeartbeat();
      (lobbyB as any).stopPruning();

      // 3. Wait for A to prune Bob (staleTtl = 1000ms)
      await waitUntil(() => !usersA.some((u) => u.userId === "bob"), 2000, 100);

      expect(usersA.find((u) => u.userId === "bob")).toBeUndefined();
      expect(usersA.length).toBe(1); // Only Alice remains
    }, 5000);
  });

  describe("Helper Functions", () => {
    it("canChallenge: returns false for self", () => {
      const user: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-1",
        userName: "Alice",
      };
      expect(canChallenge(user, "user-1")).toBe(false);
    });

    it("canChallenge: returns false if target is in a game", () => {
      const user: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-2",
        userName: "Bob",
        tableId: "table-1",
      };
      expect(canChallenge(user, "user-1")).toBe(false);
    });

    it("canChallenge: returns false if target is seeking", () => {
      const user: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-2",
        userName: "Bob",
        seek: { tableId: "table-1" },
      };
      expect(canChallenge(user, "user-1")).toBe(false);
    });

    it("canChallenge: returns true for valid target", () => {
      const user: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-2",
        userName: "Bob",
      };
      expect(canChallenge(user, "user-1")).toBe(true);
    });

    it("canSpectate: returns false if target not in game", () => {
      const user: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-2",
        userName: "Bob",
      };
      expect(canSpectate(user)).toBe(false);
    });

    it("canSpectate: returns false if target at same table", () => {
      const user: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-2",
        userName: "Bob",
        tableId: "table-1",
      };
      expect(canSpectate(user, "table-1")).toBe(false);
    });

    it("canSpectate: returns true for different table", () => {
      const user: PresenceMessage = {
        messageType: "presence",
        type: "join",
        userId: "user-2",
        userName: "Bob",
        tableId: "table-2",
      };
      expect(canSpectate(user, "table-1")).toBe(true);
    });

    it("activeGames: returns empty for no users in games", () => {
      const users: PresenceMessage[] = [
        { messageType: "presence", type: "join", userId: "u1", userName: "A" },
        { messageType: "presence", type: "join", userId: "u2", userName: "B" },
      ];
      expect(activeGames(users)).toEqual([]);
    });

    it("activeGames: returns games grouped by tableId", () => {
      const users: PresenceMessage[] = [
        { messageType: "presence", type: "join", userId: "u1", userName: "Alice", tableId: "t1" },
        { messageType: "presence", type: "join", userId: "u2", userName: "Bob", tableId: "t1" },
        { messageType: "presence", type: "join", userId: "u3", userName: "Charlie", tableId: "t2" },
      ];
      const games = activeGames(users);
      expect(games).toHaveLength(2);
      
      const t1 = games.find((g: ActiveGame) => g.tableId === "t1");
      expect(t1?.players).toHaveLength(2);
      expect(t1?.players.map((p: { id: string; name: string }) => p.name).sort()).toEqual(["Alice", "Bob"]);
      
      const t2 = games.find((g: ActiveGame) => g.tableId === "t2");
      expect(t2?.players).toHaveLength(1);
      expect(t2?.players[0].name).toBe("Charlie");
    });
  });
});
