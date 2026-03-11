import { NchanClient } from "../src/nchanclient";

describe("NchanClient (Unit)", () => {
  let mockWebSocket: any;
  let originalWebSocket: any;
  let originalFetch: any;

  beforeEach(() => {
    mockWebSocket = {
      send: jest.fn(),
      close: jest.fn(),
      onopen: null,
      onclose: null,
      onmessage: null,
      onerror: null,
    };
    originalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = jest.fn().mockImplementation(() => mockWebSocket);

    originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("should initialize with correct URLs", () => {
    const client = new NchanClient("example.com");
    // Internal methods are private, but we can check if it prepends http
    expect((client as any).server).toBe("http://example.com");
  });

  it("should return a ready promise that resolves on open", async () => {
    const client = new NchanClient("http://example.com");
    const sub = client.subscribePresence(() => {});

    // Simulate open
    setTimeout(() => {
      mockWebSocket.onopen();
    }, 10);

    await expect(sub.ready).resolves.toBeUndefined();
  });

  it("should call onMessage when websocket receives data", () => {
    const client = new NchanClient("http://example.com");
    const onMessage = jest.fn();
    client.subscribePresence(onMessage);

    mockWebSocket.onmessage({ data: "test message" });
    expect(onMessage).toHaveBeenCalledWith("test message");
  });

  it("should publish using fetch with correct parameters", async () => {
    const client = new NchanClient("http://example.com");
    const payload = { type: "join", userId: "1", userName: "Alice" };

    await client.publishPresence(payload as any);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://example.com/publish/presence/lobby",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ...payload, messageType: "presence" }),
      })
    );
  });

  it("should use AbortSignal if provided in publish", async () => {
    const client = new NchanClient("http://example.com");
    const controller = new AbortController();

    await client.publishPresence({ type: "join", userId: "1", userName: "Alice" } as any, { signal: controller.signal });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: controller.signal,
      })
    );
  });

  it("should cleanup websocket on stop", () => {
    const client = new NchanClient("http://example.com");
    const sub = client.subscribePresence(() => {});

    sub.stop();

    expect(mockWebSocket.close).toHaveBeenCalled();
    expect(mockWebSocket.onclose).toBeNull();
  });
});
