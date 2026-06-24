import {
  startContainer,
  stopContainer,
  createTestClient,
  waitUntil,
  wait,
  cleanupClients,
} from "./utils";
import { PresenceMessage } from "../src/types";
import { MessageDeduplicator } from "../src/MessageDeduplicator";

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

  it("should dedup all joined users after reconnecting", async () => {
    const clientA = createClient();
    const clientB = createClient();
    const clientC = createClient();

    // Alice, Bob, and Carol all join the lobby
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

    const lobbyC = await clientC.joinLobby({
      messageType: "presence",
      type: "join",
      userId: "user-c",
      userName: "Carol",
    });

    // Wait for settle to go to direct path
    await waitUntil(() => lobbyB.settled, 10000);

    // Register user change callbacks BEFORE joining lobby to capture initial state
    let usersA: PresenceMessage[] = [];
    let usersB: PresenceMessage[] = [];
    let usersC: PresenceMessage[] = [];
    
    lobbyA.onUsersChange((users) => {
      usersA = users;
    });

    lobbyB.onUsersChange((users) => {
      usersB = users;
    });

    lobbyC.onUsersChange((users) => {
      usersC = users;
    });

    // Allow more time for initial join messages to propagate
    await waitUntil(() => usersA.length === 3, 10000);
    expect(usersA.length).toBe(3);
    const userNames = usersA.map((u) => u.userName);
    expect(userNames).toContain("Alice");
    expect(userNames).toContain("Bob");
    expect(userNames).toContain("Carol");

    // All three users leave the lobby
    await lobbyA.leave({ isTeardown: false });
    await lobbyB.leave({ isTeardown: false });
    await lobbyC.leave({ isTeardown: false });

    // Reconnect as the same users
    const clientA2 = createClient();
    const clientB2 = createClient();
    const clientC2 = createClient();

    const lobbyA2 = await clientA2.joinLobby({
      messageType: "presence",
      type: "join",
      userId: "user-a",
      userName: "Alice",
    });

    const lobbyB2 = await clientB2.joinLobby({
      messageType: "presence",
      type: "join",
      userId: "user-b",
      userName: "Bob",
    });

    const lobbyC2 = await clientC2.joinLobby({
      messageType: "presence",
      type: "join",
      userId: "user-c",
      userName: "Carol",
    });

    // Wait for settle after reconnect - buffered messages should be deduped
    await waitUntil(() => lobbyA2.settled, 10000);

    let usersA2: PresenceMessage[] = [];
    let usersB2: PresenceMessage[] = [];
    let usersC2: PresenceMessage[] = [];
    
    lobbyA2.onUsersChange((users) => {
      usersA2 = users;
    });

    lobbyB2.onUsersChange((users) => {
      usersB2 = users;
    });

    lobbyC2.onUsersChange((users) => {
      usersC2 = users;
    });

    // Allow more time for reconnecting users to receive join messages
    await waitUntil(() => usersA2.length === 3, 10000);
    expect(usersA2.length).toBe(3);
    const userNames2 = usersA2.map((u) => u.userName);
    expect(userNames2).toContain("Alice");
    expect(userNames2).toContain("Bob");
    expect(userNames2).toContain("Carol");
  });

  it("should dedup rec start messages with message Deduplicator", async () => {
    // Process all rec messages - they are already actual JSON objects
    const allRecMessages: PresenceMessage[] = rec as PresenceMessage[];

    // Filter for presence messages only
    const presenceMessages = allRecMessages.filter(msg => msg.messageType === "presence");

    // Apply deduplication logic
    const dedupedPresence = MessageDeduplicator.dedupePresence(presenceMessages);

    // Get the last state for each user after deduplication
    const finalAliceState = dedupedPresence.find(msg => msg.userName === "Alice");
    const finalBobState = dedupedPresence.find(msg => msg.userName === "Bob");
    const finalCarolState = dedupedPresence.find(msg => msg.userName === "Carol");

    // After deduplication, all should be in the "join" state (last state before exit)
    expect(finalAliceState).toBeDefined();
    expect(finalBobState).toBeDefined();
    expect(finalCarolState).toBeDefined();
    
    expect(finalAliceState.type).toBe("join");
    expect(finalBobState.type).toBe("join");
    expect(finalCarolState.type).toBe("join");
    
    // All are online after deduplication
    expect(dedupedPresence.length).toBe(3);
    expect(dedupedPresence).toContainEqual(finalAliceState);
    expect(dedupedPresence).toContainEqual(finalBobState);
    expect(dedupedPresence).toContainEqual(finalCarolState);
  });
}
const rec = [
    {"messageType":"presence","type":"heartbeat","userId":"Bob-65wc4","userName":"Bob","clientTs":1782316668519,"meta":{"ts":1782316668520,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"heartbeat","userId":"Carol-65wc4","userName":"Carol","clientTs":1782316668520,"meta":{"ts":1782316668520,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"heartbeat","userId":"Alice-65wc4","userName":"Alice","clientTs":1782316668521,"meta":{"ts":1782316668522,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"leave","userId":"Alice-65wc4","meta":{"ts":1782316711144,"ua":"nchan-auto-leave","origin":"internal"}},
    {"messageType":"presence","type":"leave","userId":"Alice-65wc4","userName":"Alice","clientTs":1782316711143,"meta":{"ts":1782316711147,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"leave","userId":"Bob-65wc4","meta":{"ts":1782316711149,"ua":"nchan-auto-leave","origin":"internal"}},
    {"messageType":"presence","type":"leave","userId":"Bob-65wc4","userName":"Bob","clientTs":1782316711147,"meta":{"ts":1782316711151,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"leave","userId":"Carol-65wc4","meta":{"ts":1782316711153,"ua":"nchan-auto-leave","origin":"internal"}},
    {"messageType":"presence","type":"leave","userId":"Carol-65wc4","userName":"Carol","clientTs":1782316711152,"meta":{"ts":1782316711154,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"join","userId":"Alice-9paml","userName":"Alice","clientTs":1782316711242,"meta":{"ts":1782316711244,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"join","userId":"Bob-9paml","userName":"Bob","clientTs":1782316711266,"meta":{"ts":1782316711269,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"join","userId":"Carol-9paml","userName":"Carol","clientTs":1782316711283,"meta":{"ts":1782316711284,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"heartbeat","userId":"Alice-9paml","userName":"Alice","clientTs":1782316714265,"meta":{"ts":1782316714266,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"heartbeat","userId":"Bob-9paml","userName":"Bob","clientTs":1782316714277,"meta":{"ts":1782316714278,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"heartbeat","userId":"Carol-9paml","userName":"Carol","clientTs":1782316714290,"meta":{"ts":1782316714291,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"heartbeat","userId":"Alice-9paml","userName":"Alice","clientTs":1782316774267,"meta":{"ts":1782316774268,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"heartbeat","userId":"Bob-9paml","userName":"Bob","clientTs":1782316774279,"meta":{"ts":1782316774280,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}},
    {"messageType":"presence","type":"heartbeat","userId":"Carol-9paml","userName":"Carol","clientTs":1782316774292,"meta":{"ts":1782316774293,"ua":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36","origin":"http://localhost","country":"XX","city":"","since":1782308682106,"version":"v4.93"}}
];