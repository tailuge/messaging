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

    lobbyB2.onChallenge((c) => {
      receivedChallengeAfterReconnect = c;
    });

    await wait(1000);
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

    lobbyB2.onChallenge((c) => {
      receivedChallengeAfterReconnect = c;
    });

    await wait(1000);
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

    lobbyB2.onChallenge((c) => {
      receivedChallengeAfterReconnect = c;
    });

    await waitUntil(() => receivedChallengeAfterReconnect !== null, 5000);
    expect(receivedChallengeAfterReconnect.type).toBe("offer");
    expect(receivedChallengeAfterReconnect.challengerId).toBe("user-a");
  });
});
