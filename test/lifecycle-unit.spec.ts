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

  it("should re-join lobby on pageshow if persisted", async () => {
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

    expect(mockSubscription.stop).toHaveBeenCalled();

    // Simulate pageshow with persisted: true
    await handlePageShow({ persisted: true });

    // Should have re-joined (2nd call to subscribePresence)
    expect(mockNchan.subscribePresence).toHaveBeenCalledTimes(2);
  });

  it("should re-join lobby on visibilitychange if was stopped", async () => {
    client.start();
    await client.joinLobby(user);

    const handleVisibilityChange = (document.addEventListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "visibilitychange",
    )[1];

    // Simulate pagehide (stops client)
    const handlePageHide = (window.addEventListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "pagehide",
    )[1];
    handlePageHide();

    // Change visibility to visible
    (document as any).visibilityState = "visible";
    await handleVisibilityChange();

    // Should have re-joined
    expect(mockNchan.subscribePresence).toHaveBeenCalledTimes(2);
  });

  it("should proactively update presence on visibilitychange if already started", async () => {
    client.start();
    const lobby = await client.joinLobby(user);
    const updatePresenceSpy = jest.spyOn(lobby, "updatePresence");

    const handleVisibilityChange = (document.addEventListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "visibilitychange",
    )[1];

    (document as any).visibilityState = "visible";
    await handleVisibilityChange();

    expect(updatePresenceSpy).toHaveBeenCalledWith({});
  });

  it("should re-broadcast presence on NchanClient reconnection", async () => {
    await client.joinLobby(user);

    const onReconnect = mockSubscription.onReconnect;
    expect(onReconnect).toBeDefined();

    await onReconnect();

    // Initial join + re-broadcast = 2
    expect(mockNchan.publishPresence).toHaveBeenCalledTimes(2);
    expect(mockNchan.publishPresence).toHaveBeenLastCalledWith(user);
  });
});
