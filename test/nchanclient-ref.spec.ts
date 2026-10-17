import { NchanClient } from "../src/nchanclient";

// Captures the WebSocket URL instead of opening a connection.
class FakeWebSocket {
  static OPEN = 1;
  static lastUrl: string | null = null;
  readyState = 0;
  onmessage: any = null;
  onopen: any = null;
  onclose: any = null;
  onerror: any = null;

  constructor(url: string) {
    FakeWebSocket.lastUrl = url;
  }

  close() {
    this.readyState = 3;
  }
}

describe("NchanClient - presence ref parameter", () => {
  const originalWebSocket = (globalThis as any).WebSocket;
  const originalDocument = (globalThis as any).document;

  beforeEach(() => {
    (globalThis as any).WebSocket = FakeWebSocket;
    FakeWebSocket.lastUrl = null;
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
    if (originalDocument === undefined) {
      delete (globalThis as any).document;
    } else {
      (globalThis as any).document = originalDocument;
    }
  });

  const subscribeUrl = () => new URL(FakeWebSocket.lastUrl!);

  it("sends only the referring page, without its query or fragment", () => {
    (globalThis as any).document = {
      referrer:
        "https://billiards.tailuge.workers.dev/?ruletype=threecushion&userId=Luke-84gqc&custom.cue.shaftColour=%23d2b48c#frag",
    };

    const client = new NchanClient("https://nchan.example");
    const subscription = client.subscribePresence("Luke-84gqc", () => {});

    const url = subscribeUrl();
    expect(url.pathname).toBe("/subscribe/presence/lobby");
    expect(url.searchParams.get("uid")).toBe("Luke-84gqc");
    expect(url.searchParams.get("ref")).toBe("https://billiards.tailuge.workers.dev/");

    subscription.stop();
  });

  it("keeps the referrer path", () => {
    (globalThis as any).document = { referrer: "https://example.com/game/index.html?start=1" };

    const client = new NchanClient("https://nchan.example");
    const subscription = client.subscribePresence("user-1", () => {});

    expect(subscribeUrl().searchParams.get("ref")).toBe("https://example.com/game/index.html");

    subscription.stop();
  });

  it("omits ref when there is no referrer", () => {
    (globalThis as any).document = { referrer: "" };

    const client = new NchanClient("https://nchan.example");
    const subscription = client.subscribePresence("user-1", () => {});

    const url = subscribeUrl();
    expect(url.searchParams.has("ref")).toBe(false);
    expect(url.searchParams.get("uid")).toBe("user-1");

    subscription.stop();
  });
});
