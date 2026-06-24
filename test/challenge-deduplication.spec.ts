import {
  startContainer,
  stopContainer,
  createTestClient,
  waitUntil,
  wait,
  cleanupClients,
} from "./utils";

describe("MessagingClient - Challenge Deduplication", () => {
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

  it("should not receive challenge offer again after accepting and reconnecting", async () => {
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

    // Wait for settle before sending challenge so it goes direct path
    await waitUntil(() => lobbyB.settled, 10000);

    let receivedChallenge: any = null;
    lobbyB.onChallenge((c) => {
      receivedChallenge = c;
    });

    const _tableId = await lobbyA.challenge("user-b", "standard");
    await waitUntil(() => receivedChallenge !== null);
    expect(receivedChallenge.type).toBe("offer");
    expect(receivedChallenge.challengerId).toBe("user-a");

    await lobbyB.acceptChallenge(
      receivedChallenge.challengerId,
      receivedChallenge.ruleType,
      receivedChallenge.tableId,
    );

    await lobbyB.leave({ isTeardown: false });

    const clientB2 = createClient();
    let receivedChallengeAfterReconnect: any = null;
    const lobbyB2 = await clientB2.joinLobby({
      messageType: "presence",
      type: "join",
      userId: "user-b",
      userName: "Bob",
    });

    // Wait for settle after reconnect — buffered offer+accept will be deduped
    await waitUntil(() => lobbyB2.settled, 10000);

    lobbyB2.onChallenge((c) => {
      receivedChallengeAfterReconnect = c;
    });

    expect(receivedChallengeAfterReconnect).toBeNull();
  });

  it("should not receive challenge offer again after declining and reconnecting", async () => {
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

    // Wait for settle before sending challenge so it goes direct path
    await waitUntil(() => lobbyB.settled, 10000);

    let receivedChallenge: any = null;
    lobbyB.onChallenge((c) => {
      receivedChallenge = c;
    });

    const _tableId = await lobbyA.challenge("user-b", "standard");
    await waitUntil(() => receivedChallenge !== null);
    expect(receivedChallenge.type).toBe("offer");
    expect(receivedChallenge.challengerId).toBe("user-a");

    await lobbyB.declineChallenge(
      receivedChallenge.challengerId,
      receivedChallenge.ruleType,
    );

    await lobbyB.leave({ isTeardown: false });

    const clientB2 = createClient();
    let receivedChallengeAfterReconnect: any = null;
    const lobbyB2 = await clientB2.joinLobby({
      messageType: "presence",
      type: "join",
      userId: "user-b",
      userName: "Bob",
    });

    // Wait for settle after reconnect — buffered offer+decline will be deduped
    await waitUntil(() => lobbyB2.settled, 10000);

    lobbyB2.onChallenge((c) => {
      receivedChallengeAfterReconnect = c;
    });

    expect(receivedChallengeAfterReconnect).toBeNull();
  });

  it("should receive pending challenge offer after reconnecting", async () => {
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

    // Wait for settle before sending challenge so it goes direct path
    await waitUntil(() => lobbyB.settled, 10000);

    let receivedChallenge: any = null;
    lobbyB.onChallenge((c) => {
      receivedChallenge = c;
    });

    await lobbyA.challenge("user-b", "standard");
    await waitUntil(() => receivedChallenge !== null);
    expect(receivedChallenge.type).toBe("offer");

    // Client B leaves without resolving
    await lobbyB.leave({ isTeardown: false });

    // Client B reconnects
    const clientB2 = createClient();
    let receivedChallengeAfterReconnect: any = null;
    const lobbyB2 = await clientB2.joinLobby({
      messageType: "presence",
      type: "join",
      userId: "user-b",
      userName: "Bob",
    });

    // Wait for settle after reconnect — buffered offer will be replayed as unresolved
    await waitUntil(() => lobbyB2.settled, 10000);

    lobbyB2.onChallenge((c) => {
      receivedChallengeAfterReconnect = c;
    });

    // Offer was not resolved, so dedup replays it on settle
    expect(receivedChallengeAfterReconnect).not.toBeNull();
    expect(receivedChallengeAfterReconnect.type).toBe("offer");
    expect(receivedChallengeAfterReconnect.challengerId).toBe("user-a");
  });
});
