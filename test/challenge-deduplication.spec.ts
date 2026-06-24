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

const rec=
[
    "{\"messageType\":\"presence\",\"type\":\"heartbeat\",\"userId\":\"Bob-65wc4\",\"userName\":\"Bob\",\"clientTs\":1782316668519,\"meta\":{\"ts\":1782316668520,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"heartbeat\",\"userId\":\"Carol-65wc4\",\"userName\":\"Carol\",\"clientTs\":1782316668520,\"meta\":{\"ts\":1782316668520,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"heartbeat\",\"userId\":\"Alice-65wc4\",\"userName\":\"Alice\",\"clientTs\":1782316668521,\"meta\":{\"ts\":1782316668522,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"leave\",\"userId\":\"Alice-65wc4\",\"meta\":{\"ts\":1782316711144,\"ua\":\"nchan-auto-leave\",\"origin\":\"internal\"}}",
    "{\"messageType\":\"presence\",\"type\":\"leave\",\"userId\":\"Alice-65wc4\",\"userName\":\"Alice\",\"clientTs\":1782316711143,\"meta\":{\"ts\":1782316711147,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"leave\",\"userId\":\"Bob-65wc4\",\"meta\":{\"ts\":1782316711149,\"ua\":\"nchan-auto-leave\",\"origin\":\"internal\"}}",
    "{\"messageType\":\"presence\",\"type\":\"leave\",\"userId\":\"Bob-65wc4\",\"userName\":\"Bob\",\"clientTs\":1782316711147,\"meta\":{\"ts\":1782316711151,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"leave\",\"userId\":\"Carol-65wc4\",\"meta\":{\"ts\":1782316711153,\"ua\":\"nchan-auto-leave\",\"origin\":\"internal\"}}",
    "{\"messageType\":\"presence\",\"type\":\"leave\",\"userId\":\"Carol-65wc4\",\"userName\":\"Carol\",\"clientTs\":1782316711152,\"meta\":{\"ts\":1782316711154,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"join\",\"userId\":\"Alice-9paml\",\"userName\":\"Alice\",\"clientTs\":1782316711242,\"meta\":{\"ts\":1782316711244,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"join\",\"userId\":\"Bob-9paml\",\"userName\":\"Bob\",\"clientTs\":1782316711266,\"meta\":{\"ts\":1782316711269,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"join\",\"userId\":\"Carol-9paml\",\"userName\":\"Carol\",\"clientTs\":1782316711283,\"meta\":{\"ts\":1782316711284,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"heartbeat\",\"userId\":\"Alice-9paml\",\"userName\":\"Alice\",\"clientTs\":1782316714265,\"meta\":{\"ts\":1782316714266,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"heartbeat\",\"userId\":\"Bob-9paml\",\"userName\":\"Bob\",\"clientTs\":1782316714277,\"meta\":{\"ts\":1782316714278,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"heartbeat\",\"userId\":\"Carol-9paml\",\"userName\":\"Carol\",\"clientTs\":1782316714290,\"meta\":{\"ts\":1782316714291,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"heartbeat\",\"userId\":\"Alice-9paml\",\"userName\":\"Alice\",\"clientTs\":1782316774267,\"meta\":{\"ts\":1782316774268,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"heartbeat\",\"userId\":\"Bob-9paml\",\"userName\":\"Bob\",\"clientTs\":1782316774279,\"meta\":{\"ts\":1782316774280,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}",
    "{\"messageType\":\"presence\",\"type\":\"heartbeat\",\"userId\":\"Carol-9paml\",\"userName\":\"Carol\",\"clientTs\":1782316774292,\"meta\":{\"ts\":1782316774293,\"ua\":\"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\",\"origin\":\"http://localhost\",\"country\":\"XX\",\"city\":\"\",\"since\":1782308682106,\"version\":\"v4.93\"}}"
]