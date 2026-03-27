import { MessagingClient } from "../src/messagingclient";
import { NchanClient } from "../src/nchanclient";
import { PresenceMessage } from "../src/types";

jest.mock("../src/nchanclient");

describe("MessagingClient Lifecycle Unit Tests", () => {
  let client: MessagingClient;
  let mockNchan: any;
  let mockSubscription: any;

  const user: PresenceMessage = {
    messageType: "presence",
    userId: "user1",
    userName: "User1",
    type: "join",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscription = {
      ready: Promise.resolve(),
      stop: jest.fn(),
    };
    mockNchan = {
      subscribePresence: jest.fn().mockReturnValue(mockSubscription),
      publishPresence: jest.fn().mockResolvedValue({ ok: true }),
    } as any;

    client = new MessagingClient({ baseUrl: "http://localhost" });
    (client as any).nchan = mockNchan;

    // Use globalThis for better compatibility
    (globalThis as any).window = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    (globalThis as any).document = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      visibilityState: "visible",
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  it("should attach lifecycle listeners only once and not remove them on stop", async () => {
    client.start();
    expect(window.addEventListener).toHaveBeenCalledTimes(2); // pagehide, pageshow
    expect(document.addEventListener).toHaveBeenCalledTimes(1); // visibilitychange

    client.start();
    expect(window.addEventListener).toHaveBeenCalledTimes(2); // Still 2

    await client.stop();
    expect(window.removeEventListener).not.toHaveBeenCalled();
    expect(document.removeEventListener).not.toHaveBeenCalled();
  });

  it("should re-join lobby on pageshow if persisted and set isStarted", async () => {
    client.start();
    await client.joinLobby(user);

    const handlePageShow = (window.addEventListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "pageshow",
    )[1];

    // Simulate pagehide (stops client)
    const handlePageHide = (window.addEventListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "pagehide",
    )[1];
    handlePageHide();

    expect(client["isStarted"]).toBe(false);

    // Simulate pageshow with persisted: true
    await handlePageShow({ persisted: true });

    expect(client["isStarted"]).toBe(true);
    // Should have re-joined
    expect(mockNchan.subscribePresence).toHaveBeenCalledTimes(2);
  });

  it("should resume heartbeats on visibilitychange after BFCache restore", async () => {
    client.start();
    const lobby = await client.joinLobby(user);
    const resumeHeartbeatSpy = jest.spyOn(lobby, "resumeHeartbeat");

    // 1. BFCache restore
    const handlePageShow = (window.addEventListener as jest.Mock).mock.calls.find(
        (call) => call[0] === "pageshow",
      )[1];
    await handlePageShow({ persisted: true });

    // 2. Hide tab
    const handleVisibilityChange = (document.addEventListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "visibilitychange",
    )[1];
    (document as any).visibilityState = "hidden";
    await handleVisibilityChange();

    // 3. Show tab
    (document as any).visibilityState = "visible";
    await handleVisibilityChange();

    // resumeHeartbeat should have been called
    expect(resumeHeartbeatSpy).toHaveBeenCalled();
  });

  it("should restore multiple lobbies", async () => {
    client.start();
    const user2 = { ...user, userId: "user2", userName: "User2" };
    await client.joinLobby(user);
    await client.joinLobby(user2);

    await client.stop();

    await client.resumeSession();

    expect(mockNchan.subscribePresence).toHaveBeenCalledTimes(4); // 2 initial + 2 restore
    expect(client["activeLobbies"].length).toBe(2);
  });

  it("should re-broadcast presence on NchanClient reconnection without redundancy", async () => {
    await client.joinLobby(user);

    const onReconnect = mockSubscription.onReconnect;
    expect(onReconnect).toBeDefined();

    // Reset calls to count only reconnection
    mockNchan.publishPresence.mockClear();

    await onReconnect();

    // Should only be called once during reconnection by the orchestrator (via Lobby callback)
    expect(mockNchan.publishPresence).toHaveBeenCalledTimes(1);
  });

  it("should not re-join a lobby that was explicitly left", async () => {
    client.start();
    await client.joinLobby(user);

    await client.leaveLobby(user.userId);
    expect(client["activeLobbies"].length).toBe(0);
    expect(client["lobbyConfigs"].has(user.userId)).toBe(false);

    // Simulate session restoration
    await client.resumeSession();

    // Should NOT have joined back
    expect(mockNchan.subscribePresence).toHaveBeenCalledTimes(1);
    expect(client["activeLobbies"].length).toBe(0);
  });

  it("should prevent concurrent session resumptions", async () => {
    client.start();
    await client.joinLobby(user);

    // Simulate multiple concurrent events
    const p1 = client.resumeSession();
    const p2 = client.resumeSession();
    const p3 = client.resumeSession();

    await Promise.all([p1, p2, p3]);

    // Initial join + 1 restoration
    expect(mockNchan.publishPresence).toHaveBeenCalledTimes(2);
  });

  it("should prevent concurrent lobby joins", async () => {
    // Make lobby.join take some time
    mockNchan.subscribePresence.mockImplementation(() => {
        return {
            ready: new Promise(r => setTimeout(r, 50)),
            stop: jest.fn()
        };
    });

    const p1 = client.joinLobby(user);
    const p2 = client.joinLobby(user);

    const [l1, l2] = await Promise.all([p1, p2]);

    expect(l1).toBe(l2);
    expect(mockNchan.subscribePresence).toHaveBeenCalledTimes(1);
  });
});
