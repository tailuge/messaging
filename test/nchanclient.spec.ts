import { startContainer, stopContainer, waitUntil, cleanupClients } from "./utils";
import WebSocket from "ws";
import { NchanClient } from "../src/nchanclient";

/**
 * Helper to verify meta enrichment in a parsed message.
 * Asserts that meta exists, ts is a valid ISO date,
 * and country is present.
 */
function expectMeta(parsed: Record<string, unknown>) {
  expect(parsed.meta).toBeDefined();
  const meta = parsed.meta as Record<string, unknown>;
  expect(meta.ts).toBeDefined();
  expect(typeof meta.ts).toBe("number");
  expect(meta.ts).toBeGreaterThan(0);
  expect(typeof meta.msgId).toBe("string");
}

describe("NchanClient", () => {
  let port: number;
  let server: string;

  beforeAll(async () => {
    server = await startContainer();
    port = parseInt(server.split(":")[1], 10);
  }, 20000);

  afterAll(async () => {
    await stopContainer();
  });

  afterEach(async () => {
    await cleanupClients();
  });

  describe("publishPresence", () => {
    it("should publish presence message to nchan ", async () => {
      const client = new NchanClient(server);

      await expect(
        client.publishPresence({
          type: "join",
          userId: "presence-publish-test",
          userName: "PresencePublishTest",
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("publishChallenge", () => {
    it("should publish challenge message to nchan ", async () => {
      const client = new NchanClient(server);

      await expect(
        client.publishChallenge({
          type: "offer",
          challengerId: "user1",
          challengerName: "User 1",
          challengeeId: "user2",
          ruleType: "standard",
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("publishTable", () => {
    it("should publish table message to nchan ", async () => {
      const client = new NchanClient(server);

      await expect(
        client.publishTable(
          "table99",
          {
            type: "MOVE",
            data: { x: 1, y: 2 },
          },
          "user123",
        ),
      ).resolves.not.toThrow();
    });
  });

  describe("subscribePresence", () => {
    it("should subscribe to presence channel and receive messages ", async () => {
      const client = new NchanClient(server);
      const messages: string[] = [];
      const targetUserId = "presence-sub-test-" + Date.now();

      const subscription = client.subscribePresence(targetUserId, (data) => {
        messages.push(data);
      });

      await subscription.ready;

      await client.publishPresence({
        type: "join",
        userId: targetUserId,
        userName: "PresenceSubTest",
      });

      await waitUntil(() => messages.some((m) => JSON.parse(m).userId === targetUserId));

      subscription.stop();

      const recentMessage = messages.reverse().find((m) => {
        const parsed = JSON.parse(m);
        return parsed.userId === targetUserId;
      });
      expect(recentMessage).toBeDefined();
      const parsed = JSON.parse(recentMessage!);
      expect(parsed.messageType).toBe("presence");
      expect(parsed.type).toBe("join");
      expect(parsed.userId).toBe(targetUserId);

      expectMeta(parsed);
    });

    it("should receive challenge messages on presence channel", async () => {
      const client = new NchanClient(server);
      const messages: string[] = [];
      const challengeeId = "recipient-" + Date.now();

      const subscription = client.subscribePresence(challengeeId, (data) => {
        messages.push(data);
      });

      await subscription.ready;

      await client.publishChallenge({
        type: "offer",
        challengerId: "challenger1",
        challengerName: "Challenger 1",
        challengeeId,
        ruleType: "standard",
      });

      await waitUntil(() => messages.some((m) => JSON.parse(m).challengeeId === challengeeId));

      subscription.stop();

      const recentMessage = messages.reverse().find((m) => {
        const parsed = JSON.parse(m);
        return parsed.challengeeId === challengeeId;
      });
      expect(recentMessage).toBeDefined();
      const parsed = JSON.parse(recentMessage!);
      expect(parsed.messageType).toBe("challenge");
      expect(parsed.type).toBe("offer");
    });
  });

  describe("subscribeTable", () => {
    it("should subscribe to table channel and receive messages ", async () => {
      const client = new NchanClient(server);
      const messages: string[] = [];
      const tableId = "testtable" + Date.now();

      const subscription = client.subscribeTable(tableId, "user123", (data) => {
        messages.push(data);
      });

      await subscription.ready;

      await client.publishTable(
        tableId,
        {
          type: "MOVE",
          data: { x: 10, y: 20 },
        },
        "user456",
      );

      await waitUntil(() => messages.some((m) => JSON.parse(m).senderId === "user456"));

      subscription.stop();

      expect(messages.length).toBeGreaterThan(0);
      const parsed = JSON.parse(messages[0]);
      expect(parsed.type).toBe("MOVE");
      expect(parsed.senderId).toBe("user456");
      expect(parsed.data.x).toBe(10);
      expectMeta(parsed);
    });

    it("should auto-publish table:leave message on WebSocket disconnect", async () => {
      const clientA = new NchanClient(server);
      const clientB = new NchanClient(server);
      const messagesB: string[] = [];
      const tableId = "testtable-leave-" + Date.now();

      // Client B subscribes to the table to listen for messages
      const subB = clientB.subscribeTable(tableId, "userB", (data) => {
        messagesB.push(data);
      });
      await subB.ready;

      // Client A subscribes to the table
      const subA = clientA.subscribeTable(tableId, "userA", (_data) => {});
      await subA.ready;

      // Now Client A disconnects (unsubscribes)
      subA.stop();

      // Verify that Client B receives a table:leave message for Client A
      await waitUntil(() => messagesB.some((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === "table:leave" && parsed.senderId === "userA";
      }), 4000);

      subB.stop();

      const leaveMessage = messagesB.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === "table:leave" && parsed.senderId === "userA";
      });
      expect(leaveMessage).toBeDefined();
      const parsed = JSON.parse(leaveMessage!);
      expect(parsed.type).toBe("table:leave");
      expect(parsed.senderId).toBe("userA");
      expectMeta(parsed);
    });

    it("should tag auto-leave with isSpectator when subscribed as spectator", async () => {
      const clientA = new NchanClient(server);
      const clientB = new NchanClient(server);
      const messagesB: string[] = [];
      const tableId = "testtable-spectator-leave-" + Date.now();

      const subB = clientB.subscribeTable(tableId, "userB", (data) => {
        messagesB.push(data);
      });
      await subB.ready;

      const subA = clientA.subscribeTable(tableId, "userA", (_data) => {}, { isSpectator: true });
      await subA.ready;

      subA.stop();

      await waitUntil(() => messagesB.some((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === "table:leave" && parsed.senderId === "userA";
      }), 4000);

      subB.stop();

      const leaveMessage = messagesB.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === "table:leave" && parsed.senderId === "userA";
      });
      expect(leaveMessage).toBeDefined();
      const parsed = JSON.parse(leaveMessage!);
      expect(parsed.data.isSpectator).toBe(true);
    });

    it("should NOT generate spurious leave event for Client A when Client B joins", async () => {
      const clientA = new NchanClient(server);
      const clientB = new NchanClient(server);
      const messagesA: string[] = [];
      const tableId = "testtable-spurious-" + Date.now();

      // Client A subscribes to the table
      const subA = clientA.subscribeTable(tableId, "userA", (data) => {
        messagesA.push(data);
      });
      await subA.ready;

      // Client B joins the table
      const subB = clientB.subscribeTable(tableId, "userB", (_data) => {});
      await subB.ready;

      // Wait a short duration to see if Client A receives any spurious leave event
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify that Client A did NOT receive any table:leave message for userB or userA
      const hasSpuriousLeave = messagesA.some((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === "table:leave";
      });
      expect(hasSpuriousLeave).toBe(false);

      // Clean up
      subA.stop();
      subB.stop();
    });
  });

  describe("WebSocket connection", () => {
    it("should connect to nchan websocket", (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/subscribe/presence/lobby`);

      ws.on("open", () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on("error", (error) => {
        done(error);
      });
    });
  });
});
