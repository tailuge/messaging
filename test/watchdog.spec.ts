import { PresenceMessage } from "../src/types";
import {
  startContainer,
  stopContainer,
  createTestClient,
  waitUntil,
  cleanupClients,
} from "./utils";

describe("Watchdog Integration", () => {
  beforeAll(async () => {
    await startContainer();
  });

  afterAll(async () => {
    await stopContainer();
  });

  afterEach(async () => {
    await cleanupClients();
  });

  const createClient = createTestClient;

  it("should notify when an opponent disconnects (Watchdog)", async () => {
    const clientA = createClient();
    const clientB = createClient();
    const tableId = "watchdog_table";

    const testOptions = {
      heartbeatInterval: 100,
      pruneInterval: 100,
      staleTtl: 300,
    };

    // 1. Bob joins lobby and table
    const lobbyB = await clientB.joinLobby(
      { messageType: "presence", type: "join", userId: "user-b", userName: "Bob" },
      testOptions,
    );
    const tableB = await clientB.joinTable(tableId, "user-b");

    let usersB: PresenceMessage[] = [];
    lobbyB.onUsersChange((u) => {
      usersB = u;
    });

    const opponentLeftPromise = new Promise<void>((resolve) => {
      tableB.onOpponentLeft(() => resolve());
    });

    // 2. Alice joins lobby and table
    const lobbyA = await clientA.joinLobby(
      { messageType: "presence", type: "join", userId: "user-a", userName: "Alice" },
      testOptions,
    );
    await clientA.joinTable(tableId, "user-a");

    // Wait until Bob sees Alice
    await waitUntil(() => usersB.some((u) => u.userId === "user-a" && u.tableId === tableId), 3000);

    // 3. Simulate Alice crashing
    (lobbyA as any).stopHeartbeat();
    (lobbyA as any).stopPruning();

    // Bob's watchdog should detect Alice is gone
    await opponentLeftPromise;
  }, 5000);
});
