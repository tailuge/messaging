import { Table } from "../src/table";

/**
 * Unit tests for Work Item C (reconnect re-announces `joined`).
 *
 * The mock captures each Subscription so tests can fire its `onReconnect`
 * hook to simulate a replacement connection.
 */

interface Sub {
  stop: jest.Mock;
  ready: Promise<void>;
  onReconnect?: () => void;
}

function createReconnectNchan() {
  const subscriptions: Sub[] = [];
  const publishCalls: { type: string; data: unknown }[] = [];
  const subscribeTable = jest.fn(() => {
    const sub: Sub = { stop: jest.fn(), ready: Promise.resolve() };
    subscriptions.push(sub);
    return sub;
  });
  const publishTable = jest.fn((_tableId: string, message: { type: string; data: unknown }) => {
    publishCalls.push({ type: message.type, data: message.data });
    return Promise.resolve();
  });
  return {
    setVersion: jest.fn(),
    record: jest.fn(),
    subscribeTable,
    publishTable,
    subscribePresence: jest.fn().mockReturnValue({ stop: jest.fn(), ready: Promise.resolve() }),
    publishPresence: jest.fn().mockResolvedValue(undefined),
    subscriptions,
    publishCalls,
  };
}

function makeTable(
  nchan: ReturnType<typeof createReconnectNchan>,
  opts: { userId?: string; isSpectator?: boolean } = {},
): Table {
  return new Table(
    nchan as any,
    "table-c",
    opts.userId ?? (opts.isSpectator ? "user-s" : "user-c"),
    undefined,
    opts.isSpectator ?? false,
    undefined,
    undefined,
    undefined,
    { initialRetryDelayMs: 10, maxRetryDelayMs: 50 },
  );
}

function joinedCount(nchan: ReturnType<typeof createReconnectNchan>): number {
  return nchan.publishCalls.filter((c) => c.type === "joined").length;
}

describe("Table reconnect re-announces joined", () => {
  it("republishes joined exactly once per replacement connection", async () => {
    const nchan = createReconnectNchan();
    const table = makeTable(nchan);

    await table.join();
    expect(joinedCount(nchan)).toBe(1);

    // Two reconnect cycles → two re-announcements.
    nchan.subscriptions[0].onReconnect?.();
    nchan.subscriptions[0].onReconnect?.();

    expect(joinedCount(nchan)).toBe(3);
    expect(table.closed).toBe(false);
  });

  it("does not re-announce before the initial join completes", async () => {
    const nchan = createReconnectNchan();
    const table = makeTable(nchan);

    table.join(); // not awaited
    // Reconnect fires while the join handshake is still in flight.
    nchan.subscriptions[0].onReconnect?.();

    await table.join();
    // Only the initial joined publish (handleReconnect skipped pre-join).
    expect(joinedCount(nchan)).toBe(1);
  });

  it("spectators do not re-announce joined on reconnect", async () => {
    const nchan = createReconnectNchan();
    const table = makeTable(nchan, { isSpectator: true });

    await table.join();
    nchan.subscriptions[0].onReconnect?.();

    expect(nchan.publishCalls).toHaveLength(0);
  });

  it("does not re-announce on a closed table", async () => {
    const nchan = createReconnectNchan();
    const table = makeTable(nchan);

    await table.join();
    await table.leave({ isTeardown: true });
    nchan.subscriptions[0].onReconnect?.();

    expect(joinedCount(nchan)).toBe(1);
  });

  it("the peer observes the fresh handshake as a rejoin after seeing the leave", async () => {
    const nchanA = createReconnectNchan();
    const nchanB = createReconnectNchan();
    const tableA = makeTable(nchanA, { userId: "user-a" });
    await tableA.join();

    // Peer B (user-b) is fully joined: sees A's and its own handshakes.
    const tableB = makeTable(nchanB, { userId: "user-b" });
    (tableB as any).handleIncomingMessage(
      JSON.stringify({ type: "joined", senderId: "user-a", data: { id: "user-a" } }),
    );
    (tableB as any).handleIncomingMessage(
      JSON.stringify({ type: "joined", senderId: "user-b", data: { id: "user-b" } }),
    );
    await tableB.bothJoined;

    // Opponent leaves, then reconnects: A re-announces joined.
    (tableB as any).handleIncomingMessage(
      JSON.stringify({ type: "table:leave", senderId: "user-a", data: {} }),
    );
    let rejoinCount = 0;
    tableB.onOpponentRejoined(() => rejoinCount++);

    nchanA.subscriptions[0].onReconnect?.();
    expect(joinedCount(nchanA)).toBe(2);

    // B receives the re-announced handshake → rejoin detection fires.
    (tableB as any).handleIncomingMessage(
      JSON.stringify({ type: "joined", senderId: "user-a", data: { id: "user-a" } }),
    );
    expect(rejoinCount).toBe(1);
    expect(tableB.opponentLeft).toBe(false);
  });

  it("a reconnect during the waiting period still lets bothJoined resolve", async () => {
    const nchanA = createReconnectNchan();
    const tableA = makeTable(nchanA);

    // A joins, then reconnects before B ever arrives: A re-announces joined.
    await tableA.join();
    nchanA.subscriptions[0].onReconnect?.();
    expect(joinedCount(nchanA)).toBe(2);

    // B joins late and sees A's re-announced handshake → bothJoined resolves.
    const nchanB = createReconnectNchan();
    const tableB = makeTable(nchanB);
    (tableB as any).handleIncomingMessage(
      JSON.stringify({ type: "joined", senderId: "user-c", data: { id: "user-c" } }),
    );
    (tableB as any).handleIncomingMessage(
      JSON.stringify({ type: "joined", senderId: "user-b", data: { id: "user-b" } }),
    );
    await tableB.bothJoined;
    expect((tableB as any).bothJoinedResolved).toBe(true);
  });
});
