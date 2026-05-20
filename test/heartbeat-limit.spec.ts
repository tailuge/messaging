import { PresenceMessage } from "../src/types";
import {
  startContainer,
  stopContainer,
  createTestClient,
  waitUntil,
  cleanupClients,
} from "./utils";

describe("Lobby Heartbeat Limit", () => {
  beforeAll(async () => {
    await startContainer();
  }, 60000);

  afterAll(async () => {
    await stopContainer();
  });

  afterEach(async () => {
    await cleanupClients();
  });

  it("should disconnect after 120 heartbeats", async () => {
    const client = createTestClient();
    const user: PresenceMessage = {
      messageType: "presence",
      type: "join",
      userId: "test-user",
      userName: "Tester",
    };

    // Join with a very fast heartbeat interval
    const lobby = await client.joinLobby(user, {
      heartbeatInterval: 10, // 10ms
    });

    let users: PresenceMessage[] = [];
    lobby.onUsersChange((u) => (users = u));

    // Initially we should be in the lobby
    await waitUntil(() => users.some((u) => u.userId === "test-user"));
    expect(users.some((u) => u.userId === "test-user")).toBe(true);

    // Wait for 120 heartbeats (at 10ms each, this should take ~1.2s plus some overhead)
    // We expect the user to be removed from the lobby list when they "leave" automatically
    // The Lobby.leave() call also notifies listeners with users.clear()
    await waitUntil(() => users.length === 0, 5000, 100);

    expect(users.length).toBe(0);
    expect((lobby as any).isJoined).toBe(false);
  }, 10000);
});
