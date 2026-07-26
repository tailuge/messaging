import {
  startContainer,
  stopContainer,
  createTestClient,
  waitUntil,
  cleanupClients,
} from "./utils";

describe("Table Early Message Registration", () => {
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

  it("should not drop messages sent immediately after join when onMessage is passed via options", async () => {
    const clientA = createClient();
    const clientB = createClient();
    const tableId = `table-early-reg-${Date.now()}`;

    // Player A joins first
    const tableA = await clientA.joinTable(tableId, "user-a");

    // We will publish a message from Player A as soon as we see Player B's "joined" message.
    // However, in our system, internal "joined" messages are filtered out of onMessage listeners,
    // but they resolve the bothJoined promise.
    // So Player A can await tableA.bothJoined, and immediately publish the BeginEvent.
    let beginSent = false;
    tableA.bothJoined.then(async () => {
      beginSent = true;
      // Publish immediately to trigger the race condition
      await tableA.publish("BeginEvent", { starter: "user-a" });
    });

    // Player B joins with the early onMessage option.
    // If the option is working, the listener is registered *before* subscription becomes ready and "joined" is sent,
    // so when Player A receives "joined", resolves bothJoined, and publishes "BeginEvent",
    // Player B's listener is already active and receives it — even though clientB.joinTable has not fully returned/resolved yet!
    let receivedMessage: any = null;
    const tableBPromise = clientB.joinTable(tableId, "user-b", {
      onMessage: (msg) => {
        receivedMessage = msg;
      },
    });

    // Wait for the joinTable of Player B to complete and the message to be received.
    const tableB = await tableBPromise;

    await waitUntil(() => receivedMessage !== null, 4000);

    expect(beginSent).toBe(true);
    expect(receivedMessage).not.toBeNull();
    expect(receivedMessage.type).toBe("BeginEvent");
    expect(receivedMessage.data.starter).toBe("user-a");
    expect(receivedMessage.senderId).toBe("user-a");
  });

  it("should support early registration for spectateTable", async () => {
    const clientA = createClient();
    const clientSpectator = createClient();
    const tableId = `table-spectator-early-${Date.now()}`;

    const tableA = await clientA.joinTable(tableId, "user-a");

    // Spectator joins with early onMessage option
    let receivedMessage: any = null;
    const spectatePromise = clientSpectator.spectateTable(tableId, "user-s", {
      onMessage: (msg) => {
        receivedMessage = msg;
      },
    });

    // Send a message immediately from Player A
    await tableA.publish("SpectatorCheck", { data: "hello" });

    await spectatePromise;

    await waitUntil(() => receivedMessage !== null, 4000);

    expect(receivedMessage).not.toBeNull();
    expect(receivedMessage.type).toBe("SpectatorCheck");
    expect(receivedMessage.data.data).toBe("hello");
  });
});
