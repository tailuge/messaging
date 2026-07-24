import {
  startContainer,
  stopContainer,
  createTestClient,
  waitUntil,
  cleanupClients,
} from "./utils";

describe("Table Both Joined", () => {
  beforeAll(async () => {
    await startContainer();
  }, 20000);

  afterAll(async () => {
    await stopContainer();
  });

  afterEach(async () => {
    await cleanupClients();
  });

  const createClient = createTestClient;

  it("should trigger onBothJoined and resolve bothJoined on both player clients symmetrically", async () => {
    const clientA = createClient();
    const clientB = createClient();
    const tableId = `table-both-joined-${Date.now()}`;

    const tableA = await clientA.joinTable(tableId, "user-a");

    let isBothJoinedA_CallbackCalled = false;
    tableA.onBothJoined(() => {
      isBothJoinedA_CallbackCalled = true;
    });

    let isBothJoinedA_PromiseResolved = false;
    tableA.bothJoined.then(() => {
      isBothJoinedA_PromiseResolved = true;
    });

    // Bob (the second player) joins the table
    const tableB = await clientB.joinTable(tableId, "user-b");

    let isBothJoinedB_CallbackCalled = false;
    tableB.onBothJoined(() => {
      isBothJoinedB_CallbackCalled = true;
    });

    let isBothJoinedB_PromiseResolved = false;
    tableB.bothJoined.then(() => {
      isBothJoinedB_PromiseResolved = true;
    });

    // Wait until both conditions are met on both sides
    await waitUntil(() => {
      return (
        isBothJoinedA_CallbackCalled &&
        isBothJoinedA_PromiseResolved &&
        isBothJoinedB_CallbackCalled &&
        isBothJoinedB_PromiseResolved
      );
    }, 4000);

    expect(isBothJoinedA_CallbackCalled).toBe(true);
    expect(isBothJoinedA_PromiseResolved).toBe(true);
    expect(isBothJoinedB_CallbackCalled).toBe(true);
    expect(isBothJoinedB_PromiseResolved).toBe(true);
  });

  it("should support spectators observing bothJoined and avoid leaking joined messages to onMessage", async () => {
    const clientA = createClient();
    const clientB = createClient();
    const clientSpectator = createClient();
    const tableId = `table-spectator-joined-${Date.now()}`;

    // Join Player A
    const tableA = await clientA.joinTable(tableId, "user-a");

    // Spectator joins
    const tableSpectator = await clientSpectator.spectateTable(tableId, "user-spectator");

    let isSpectator_BothJoined_Called = false;
    tableSpectator.onBothJoined(() => {
      isSpectator_BothJoined_Called = true;
    });

    let normalMessagesReceivedCount = 0;
    tableSpectator.onMessage((m) => {
      if (m.type === "joined") {
        normalMessagesReceivedCount++;
      }
    });

    tableA.onMessage((m) => {
      if (m.type === "joined") {
        normalMessagesReceivedCount++;
      }
    });

    // Bob joins as Player B
    const tableB = await clientB.joinTable(tableId, "user-b");

    tableB.onMessage((m) => {
      if (m.type === "joined") {
        normalMessagesReceivedCount++;
      }
    });

    // Wait for players to settle and bothJoined on spectator to trigger
    await waitUntil(() => isSpectator_BothJoined_Called, 4000);

    // Let's send a normal message to verify normal onMessage still works
    let normalMessageReceived = false;
    tableSpectator.onMessage((m) => {
      if (m.type === "game:start") {
        normalMessageReceived = true;
      }
    });

    await tableA.publish("game:start", { foo: "bar" });

    await waitUntil(() => normalMessageReceived, 2000);

    // Assertions
    expect(isSpectator_BothJoined_Called).toBe(true);
    expect(normalMessagesReceivedCount).toBe(0); // "joined" messages should have been filtered out
  });
});
