/**
 * Proof tests for the "no message lost" contract on table channels.
 *
 * The outbox guarantees the message reaches the Nchan server; the channel
 * replay buffer (2000 / 90s) must guarantee a late or mid-connection
 * subscriber still receives it. These tests deliberately publish WITHOUT
 * waiting on bothJoined — the delivery must not depend on consumer-side
 * synchronization.
 */
import {
  startContainer,
  stopContainer,
  createTestClient,
  waitUntil,
  cleanupClients,
} from "./utils";

describe("Table no-loss semantics", () => {
  beforeAll(async () => {
    await startContainer();
  }, 30000);

  afterAll(async () => {
    await stopContainer();
  });

  afterEach(async () => {
    await cleanupClients();
  });

  const createClient = createTestClient;

  it("messages published before B joins are replayed to B", async () => {
    const clientA = createClient();
    const clientB = createClient();
    const tableId = `noloss-late-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const tableA = await clientA.joinTable(tableId, "user-a");

    // Publish before B exists at all (sequential publishes — exercises the
    // outbox's serial flusher restart path too).
    await tableA.publish("M1", { n: 1 });
    await tableA.publish("M2", { n: 2 });

    // B starts joining only after both HTTP publishes have resolved. This is
    // the deterministic late-join case: B cannot receive these messages live,
    // so they must arrive from Nchan's retained channel buffer.

    let received: any[] = [];
    await clientB.joinTable(tableId, "user-b", {
      onMessage: (m) => received.push(m),
    });

    await waitUntil(() => received.length >= 2, 5000);
    expect(received.map((m) => m.type)).toEqual(["M1", "M2"]);
    expect(received).toHaveLength(2);
    expect(received.every((m) => m.senderId === "user-a")).toBe(true);
    expect(received[0].senderId).toBe("user-a");
  }, 15000);

  it("messages published while B is mid-connection are not lost", async () => {
    const clientA = createClient();
    const clientB = createClient();
    const tableId = `noloss-mid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const tableA = await clientA.joinTable(tableId, "user-a");

    // Start B's join but do NOT await it — B's socket is mid-connection.
    let received: any[] = [];
    const bJoinPromise = clientB.joinTable(tableId, "user-b", {
      onMessage: (m) => received.push(m),
    });

    // Publish immediately, while B's subscription is connecting.
    await tableA.publish("M1", { n: 1 });

    await bJoinPromise;

    // Give the buffer replay a moment to arrive after B connects.
    await waitUntil(() => received.some((m) => m.type === "M1"), 5000);
    expect(received[0].type).toBe("M1");
    expect(received[0].senderId).toBe("user-a");
  }, 15000);
});
