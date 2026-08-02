import {
  startContainer,
  stopContainer,
  createTestClient,
  waitUntil,
  cleanupClients,
} from "./utils";

describe("DEBUG dedup", () => {
  beforeAll(async () => {
    await startContainer();
  }, 20000);

  afterAll(async () => {
    await stopContainer();
  });

  afterEach(async () => {
    await cleanupClients();
  });

  it("inspects meta.ts ordering in the challenge/accept flow", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();

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
    await new Promise<void>((r) => lobbyB.onSettled(r));

    let receivedChallenge: any = null;
    lobbyB.onChallenge((c) => {
      receivedChallenge = c;
    });
    const tableId = await lobbyA.challenge("user-b", "standard");
    await waitUntil(() => receivedChallenge !== null);
    await lobbyB.acceptChallenge(
      receivedChallenge.challengerId,
      receivedChallenge.ruleType,
      receivedChallenge.tableId,
    );

    const tableA = await clientA.joinTable(tableId, "user-a");

    let messageReceivedByB: any = null;
    await clientB.joinTable(tableId, "user-b", {
      onMessage: (m) => {
        messageReceivedByB = m;
      },
    });

    await tableA.publish("MOVE", { x: 5, y: 10 });

    await new Promise((r) => setTimeout(r, 1500));

    console.log("=== B recorded table messages ===");
    for (const raw of clientB.recordedMessages) {
      try {
        const p = JSON.parse(raw);
        if (p.type === "MOVE" || p.type === "joined" || p.type === "table:leave") {
          console.log(`type=${p.type} sender=${p.senderId} metaTs=${p.meta?.ts}`);
        }
      } catch {}
    }
    console.log("=== A recorded table messages ===");
    for (const raw of clientA.recordedMessages) {
      try {
        const p = JSON.parse(raw);
        if (p.type === "MOVE" || p.type === "joined" || p.type === "table:leave") {
          console.log(`type=${p.type} sender=${p.senderId} metaTs=${p.meta?.ts}`);
        }
      } catch {}
    }
    console.log(`messageReceivedByB=${JSON.stringify(messageReceivedByB)}`);
    expect(true).toBe(true);
  });
});
