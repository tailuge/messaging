/**
 * Regression test: slow-joining party must receive both bothJoined and the first message.
 *
 * Scenario:
 *   1. Player A joins the table.
 *   2. A immediately publishes "message1" (before B even joins).
 *   3. Player B joins 1 second later (simulating slower connection).
 *   4. B must:
 *      - See bothJoined fire (know that both players are ready)
 *      - Receive "message1" via onMessage
 *
 * The bug: If B's bothJoined depends on receiving A's "joined" via Nchan buffer replay,
 * and message1 arrives before the buffer replay completes, B might see message1 before
 * bothJoined resolves. A consuming app that waits for bothJoined before processing
 * messages would lose message1.
 */

import {
  startContainer,
  stopContainer,
  createTestClient,
  waitUntil,
  cleanupClients,
  wait,
} from "./utils";

describe("bothJoined slow-party race condition", () => {
  beforeAll(async () => {
    await startContainer();
  }, 30000);

  afterAll(async () => {
    await stopContainer();
  });

  afterEach(async () => {
    await cleanupClients();
  });

  it("B receives bothJoined and message1 when A sends message1 immediately after join and B joins 1 second later", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();
    const tableId = `table-slow-join-${Date.now()}`;

    // --- Player A joins ---
    const tableA = await clientA.joinTable(tableId, "user-a");

    // A immediately publishes a message (before B even exists)
    await tableA.publish("message1", { data: "first-message" } as any);

    // --- Player B joins 1 second later (slow connection) ---
    await wait(1000);

    let bReceivedMessage1 = false;
    let bReceivedBeforeBothJoined = false;
    let bFiredBothJoined = false;

    const tableB = await clientB.joinTable(tableId, "user-b", {
      onBothJoined: () => {
        // onBothJoined fires synchronously inside resolveBothJoined(),
        // before the queue is drained — so this is the correct flag to check.
        bFiredBothJoined = true;
      },
      onMessage: (msg) => {
        if (msg.type === "message1") {
          // If the fix is correct, bFiredBothJoined is already true here
          // because the queue is drained after onBothJoined is called.
          bReceivedBeforeBothJoined = !bFiredBothJoined;
          bReceivedMessage1 = true;
        }
      },
    });

    // Wait for both conditions
    await waitUntil(() => bReceivedMessage1 && bFiredBothJoined, 6000);

    // Core assertions: B must receive the message and bothJoined must fire
    expect(bReceivedMessage1).toBe(true);
    expect(bFiredBothJoined).toBe(true);

    // Race condition check: message must NOT arrive before bothJoined resolves
    console.log(`[race condition] message1 arrived BEFORE B's bothJoined: ${bReceivedBeforeBothJoined}`);
    
    // THE CRITICAL ASSERTION: If this fails, consuming apps that wait for bothJoined
    // before processing messages will lose the first message.
    expect(bReceivedBeforeBothJoined).toBe(false);
  });

  it("B receives bothJoined and message1 when A sends immediately after bothJoined fires on A's side", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();
    const tableId = `table-slow-join-2-${Date.now()}`;

    // --- Player A joins ---
    const tableA = await clientA.joinTable(tableId, "user-a");

    let aFiredBothJoined = false;

    // A waits for bothJoined then immediately sends
    tableA.bothJoined.then(async () => {
      aFiredBothJoined = true;
      await tableA.publish("message1", { data: "after-both-joined" } as any);
    });

    // --- Player B joins 1 second later ---
    await wait(1000);

    let bReceivedMessage1 = false;
    let bReceivedBeforeBothJoined = false;
    let bFiredBothJoined = false;

    const tableB = await clientB.joinTable(tableId, "user-b", {
      onBothJoined: () => {
        bFiredBothJoined = true;
      },
      onMessage: (msg) => {
        if (msg.type === "message1") {
          bReceivedBeforeBothJoined = !bFiredBothJoined;
          bReceivedMessage1 = true;
        }
      },
    });

    // Wait for the message to propagate
    await waitUntil(() => aFiredBothJoined && bReceivedMessage1 && bFiredBothJoined, 6000);

    expect(aFiredBothJoined).toBe(true);
    expect(bReceivedMessage1).toBe(true);
    expect(bFiredBothJoined).toBe(true);

    console.log(`[race condition] message1 arrived BEFORE B's bothJoined: ${bReceivedBeforeBothJoined}`);
    expect(bReceivedBeforeBothJoined).toBe(false);
  });
});
