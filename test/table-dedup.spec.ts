import { Table } from "../src/table";
import { TableMessage } from "../src/types";

/**
 * Unit tests for Work Item D (internal replay dedup).
 *
 * Simulates Nchan buffer replays by feeding the same messages to
 * handleIncomingMessage again with the same server-generated meta.msgId.
 */

function createMockNchan() {
  return {
    setVersion: jest.fn(),
    record: jest.fn(),
    subscribeTable: jest.fn().mockReturnValue({ stop: jest.fn(), ready: Promise.resolve() }),
    publishTable: jest.fn().mockResolvedValue(undefined),
    subscribePresence: jest.fn().mockReturnValue({ stop: jest.fn(), ready: Promise.resolve() }),
    publishPresence: jest.fn().mockResolvedValue(undefined),
    publishChallenge: jest.fn().mockResolvedValue(undefined),
    publishChat: jest.fn().mockResolvedValue(undefined),
  };
}

function msg(type: string, senderId: string, ts?: number): string {
  return JSON.stringify({
    type,
    senderId,
    data: { id: senderId },
    ...(ts !== undefined ? { meta: { ts, msgId: `${type}-${senderId}-${ts}` } } : {}),
  });
}

/** Message carrying a server-generated msgId (real server round-trip shape). */
function msgWithId(type: string, senderId: string, msgId: string, ts: number): string {
  return JSON.stringify({
    type,
    senderId,
    data: { id: senderId },
    meta: { ts, msgId },
  });
}

function makeTable(nchan: any, onMessage: (m: TableMessage) => void, isSpectator = true): Table {
  return new Table(nchan, "table-d", isSpectator ? "user-s" : "user-d", undefined, isSpectator, onMessage);
}

describe("Table replay dedup", () => {
  it("reconnect replay does not re-deliver already-processed messages", async () => {
    const nchan = createMockNchan();
    const received: TableMessage[] = [];
    const table = makeTable(nchan, (m) => received.push(m));
    await table.join();

    (table as any).handleIncomingMessage(msg("app", "peer", 100));
    expect(received).toHaveLength(1);

    // Reconnect replay re-delivers the same buffer message.
    (table as any).handleIncomingMessage(msg("app", "peer", 100));
    expect(received).toHaveLength(1);

    // A genuinely new message is delivered normally.
    (table as any).handleIncomingMessage(msg("app", "peer", 101));
    expect(received).toHaveLength(2);
    expect(received[1].type).toBe("app");
  });

  it("replayed messages with previously seen IDs are skipped", async () => {
    const nchan = createMockNchan();
    const received: TableMessage[] = [];
    const table = makeTable(nchan, (m) => received.push(m));
    await table.join();

    (table as any).handleIncomingMessage(msgWithId("app", "peer", "m100", 100));
    (table as any).handleIncomingMessage(msgWithId("app", "peer", "m200", 200));
    (table as any).handleIncomingMessage(msgWithId("app", "peer", "m210", 210));
    expect(received).toHaveLength(3);

    // Replay of the full buffer (100..210) after a reconnect; previously
    // processed message IDs are ignored regardless of timestamp ordering.
    (table as any).handleIncomingMessage(msgWithId("app", "peer", "m100", 100));
    (table as any).handleIncomingMessage(msgWithId("app", "peer", "m200", 200));
    (table as any).handleIncomingMessage(msgWithId("app", "peer", "m205", 205));
    (table as any).handleIncomingMessage(msgWithId("app", "peer", "m210", 210));
    expect(received).toHaveLength(4);
    expect(received[3].meta?.msgId).toBe("m205");
  });

  it("ordering of genuinely new messages is preserved", async () => {
    const nchan = createMockNchan();
    const received: TableMessage[] = [];
    const table = makeTable(nchan, (m) => received.push(m));
    await table.join();

    for (let ts = 500; ts <= 504; ts++) {
      (table as any).handleIncomingMessage(msg("app", "peer", ts));
    }
    expect(received.map((m) => m.meta?.ts)).toEqual([500, 501, 502, 503, 504]);
  });

  it("replayed system messages do not re-trigger opponent left/rejoin", async () => {
    const nchan = createMockNchan();
    const table = makeTable(nchan, () => {}, false);
    await table.join();

    // Full first-time sequence: A joins, D joins, A leaves, A rejoins.
    (table as any).handleIncomingMessage(msg("joined", "user-a", 100));
    (table as any).handleIncomingMessage(msg("joined", "user-d", 101));
    await table.bothJoined;

    let leftCount = 0;
    let rejoinCount = 0;
    table.onOpponentLeft(() => leftCount++);
    table.onOpponentRejoined(() => rejoinCount++);

    (table as any).handleIncomingMessage(msg("table:leave", "user-a", 200));
    (table as any).handleIncomingMessage(msg("joined", "user-a", 300));
    expect(leftCount).toBe(1);
    expect(rejoinCount).toBe(1);

    // Reconnect replay re-delivers the whole buffer — nothing re-fires.
    (table as any).handleIncomingMessage(msg("joined", "user-a", 100));
    (table as any).handleIncomingMessage(msg("joined", "user-d", 101));
    (table as any).handleIncomingMessage(msg("table:leave", "user-a", 200));
    (table as any).handleIncomingMessage(msg("joined", "user-a", 300));
    expect(leftCount).toBe(1);
    expect(rejoinCount).toBe(1);
  });

  it("messages without server meta are always delivered", async () => {
    const nchan = createMockNchan();
    const received: TableMessage[] = [];
    const table = makeTable(nchan, (m) => received.push(m));
    await table.join();

    (table as any).handleIncomingMessage(msg("app", "peer"));
    (table as any).handleIncomingMessage(msg("app", "peer"));
    expect(received).toHaveLength(2);
  });

  it("DISTINCT messages sharing the same millisecond ts are all delivered (msgId dedup)", async () => {
    const nchan = createMockNchan();
    const received: TableMessage[] = [];
    const table = makeTable(nchan, (m) => received.push(m));
    await table.join();

    // Regression: two handshakes landing in the same millisecond (common under
    // load) were previously dropped by ts-only dedup, stranding bothJoined.
    (table as any).handleIncomingMessage(msgWithId("joined", "user-a", "m1", 777));
    (table as any).handleIncomingMessage(msgWithId("joined", "user-b", "m2", 777));
    (table as any).handleIncomingMessage(msgWithId("app", "user-a", "m3", 781));

    await table.bothJoined;
    expect(received.map((m) => m.type)).toEqual(["app"]);
  });

  it("replay re-delivering the same msgId is skipped (no duplicate delivery)", async () => {
    const nchan = createMockNchan();
    const received: TableMessage[] = [];
    const table = makeTable(nchan, (m) => received.push(m));
    await table.join();

    (table as any).handleIncomingMessage(msgWithId("app", "peer", "m1", 100));
    expect(received).toHaveLength(1);

    // Reconnect replay re-delivers the same buffered message (same msgId).
    (table as any).handleIncomingMessage(msgWithId("app", "peer", "m1", 100));
    expect(received).toHaveLength(1);

    // New message with a new msgId is delivered.
    (table as any).handleIncomingMessage(msgWithId("app", "peer", "m2", 101));
    expect(received).toHaveLength(2);
  });
});
