import { GenericContainer, StartedTestContainer } from "testcontainers";
import { MessagingClient } from "../src/messagingclient";
import { PresenceMessage } from "../src/types";

async function waitUntil(
  condition: () => boolean,
  timeout = 3000
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error("waitUntil timeout");
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("Watchdog Integration", () => {
  let container: StartedTestContainer;
  let server: string;
  let clients: MessagingClient[] = [];

  beforeAll(async () => {
    container = await new GenericContainer("tailuge/billiards-network:latest")
      .withExposedPorts(8080)
      .withUser("root")
      .start();

    const port = container.getMappedPort(8080);
    server = `localhost:${port}`;
  }, 5000); // Container startup can be slow

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.stop()));
    if (container) await container.stop();
  });

  const createClient = () => {
    const client = new MessagingClient({ baseUrl: server });
    clients.push(client);
    return client;
  };

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
    await waitUntil(() =>
      usersB.some((u) => u.userId === "user-a" && u.tableId === tableId)
    );

    // 3. Simulate Alice crashing
    (lobbyA as any).stopHeartbeat();
    (lobbyA as any).stopPruning();

    // Bob's watchdog should detect Alice is gone
    await opponentLeftPromise;
  }, 5000);
});
