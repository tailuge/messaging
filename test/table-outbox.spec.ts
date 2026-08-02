import { Table } from "../src/table";

/**
 * Unit tests for Work Item B (one bounded outbox in Table.publish()).
 *
 * Uses a mock NchanClient. Publishes auto-resolve by default; the subscription
 * `ready` can be deferred to hold the readiness gate open.
 */

interface OutboxMockNchan {
  setVersion: jest.Mock;
  record: jest.Mock;
  subscribeTable: jest.Mock;
  publishTable: jest.Mock;
  subscribePresence: jest.Mock;
  publishPresence: jest.Mock;
  publishCalls: { type: string; data: unknown }[];
}

function createOutboxNchan(opts: { ready?: Promise<void> } = {}): OutboxMockNchan {
  const publishCalls: { type: string; data: unknown }[] = [];
  const publishTable = jest.fn((_tableId: string, message: { type: string; data: unknown }) => {
    publishCalls.push({ type: message.type, data: message.data });
    return Promise.resolve();
  });
  return {
    setVersion: jest.fn(),
    record: jest.fn(),
    subscribeTable: jest.fn().mockReturnValue({
      stop: jest.fn(),
      ready: opts.ready ?? Promise.resolve(),
    }),
    publishTable,
    subscribePresence: jest.fn().mockReturnValue({ stop: jest.fn(), ready: Promise.resolve() }),
    publishPresence: jest.fn().mockResolvedValue(undefined),
    publishCalls,
  };
}

function makeTable(
  nchan: OutboxMockNchan,
  opts: { maxSize?: number; initialRetryDelayMs?: number; maxRetryDelayMs?: number } = {},
): Table {
  return new Table(nchan as any, "table-b", "user-b", undefined, false, undefined, undefined, undefined, {
    maxSize: opts.maxSize ?? 1000,
    initialRetryDelayMs: opts.initialRetryDelayMs ?? 10,
    maxRetryDelayMs: opts.maxRetryDelayMs ?? 50,
  });
}

describe("Table publish outbox", () => {
  it("publishes issued during initial join are held until the subscription is live", async () => {
    let resolveReady: () => void = () => {};
    const nchan = createOutboxNchan({
      ready: new Promise<void>((r) => {
        resolveReady = r;
      }),
    });
    const table = makeTable(nchan);

    const joinP = table.join();
    const publishP = table.publish("app1", { n: 1 });

    // Socket not established yet: nothing has been posted.
    expect(nchan.publishCalls).toHaveLength(0);

    resolveReady();
    await joinP;
    await publishP;

    // Control `joined` first, then the held application publish.
    expect(nchan.publishCalls.map((c) => c.type)).toEqual(["joined", "app1"]);
  });

  it("multiple early publishes settle in order after readiness", async () => {
    let resolveReady: () => void = () => {};
    const nchan = createOutboxNchan({
      ready: new Promise<void>((r) => {
        resolveReady = r;
      }),
    });
    const table = makeTable(nchan);

    const joinP = table.join();
    const p1 = table.publish("m1", { i: 1 });
    const p2 = table.publish("m2", { i: 2 });
    const p3 = table.publish("m3", { i: 3 });

    resolveReady();
    await joinP;
    await Promise.all([p1, p2, p3]);

    expect(nchan.publishCalls.map((c) => c.type)).toEqual(["joined", "m1", "m2", "m3"]);
  });

  it("publish failure triggers retry with backoff until accepted", async () => {
    const publishTable = jest
      .fn()
      .mockResolvedValueOnce(undefined) // joined
      .mockRejectedValueOnce(new Error("server hiccup")) // app1 first attempt
      .mockResolvedValue(undefined); // app1 retry
    const nchan = createOutboxNchan();
    nchan.publishTable = publishTable;

    const table = makeTable(nchan, { initialRetryDelayMs: 10, maxRetryDelayMs: 50 });
    await table.join();

    await expect(table.publish("app1", { n: 1 })).resolves.toBeUndefined();
    expect(publishTable).toHaveBeenCalledTimes(3); // joined + app1 twice
  });

  it("explicit leave during pending retries settles/clears the queue", async () => {
    const publishTable = jest.fn().mockRejectedValue(new Error("server down"));
    const nchan = createOutboxNchan();
    nchan.publishTable = publishTable;

    const table = makeTable(nchan, { initialRetryDelayMs: 10, maxRetryDelayMs: 50 });
    const joinP = table.join();
    const publishP = table.publish("app1", { n: 1 });

    const leaveP = table.leave({ isTeardown: true });
    // Attach handlers to all promises immediately (leave() rejects the held
    // publish synchronously; a delayed handler would be an unhandled rejection).
    // join() may fulfill as a no-op if leave() lands while the join is still
    // establishing — the queue clearing is what this test verifies.
    const [joinResult, publishResult, leaveResult] = await Promise.allSettled([
      joinP,
      publishP,
      leaveP,
    ]);

    expect(publishResult.status).toBe("rejected");
    if (publishResult.status === "rejected") {
      expect(String(publishResult.reason)).toMatch(/closed/);
    }
    expect(leaveResult.status).toBe("fulfilled");
    expect(table.closed).toBe(true);
    expect(joinResult.status).toMatch(/fulfilled|rejected/);
  });

  it("queue capacity rejects without disturbing existing holds", async () => {
    let resolveReady: () => void = () => {};
    const nchan = createOutboxNchan({
      ready: new Promise<void>((r) => {
        resolveReady = r;
      }),
    });
    const table = makeTable(nchan, { maxSize: 2 });

    const joinP = table.join();
    const p1 = table.publish("m1", {});
    const p2 = table.publish("m2", {});

    // Queue is full (m1, m2 held behind the readiness gate).
    await expect(table.publish("m3", {})).rejects.toThrow(/full/);

    // Existing holds are unaffected and delivered in order.
    resolveReady();
    await joinP;
    await Promise.all([p1, p2]);
    expect(nchan.publishCalls.map((c) => c.type)).toEqual(["joined", "m1", "m2"]);
  });

  it("publish after leave rejects immediately", async () => {
    const nchan = createOutboxNchan();
    const table = makeTable(nchan);
    await table.join();

    await table.leave({ isTeardown: true });
    await expect(table.publish("m", {})).rejects.toThrow(/closed/);
  });

  it("publishes settle in order on a healthy server", async () => {
    const nchan = createOutboxNchan();
    const table = makeTable(nchan);

    await table.join();
    const p1 = table.publish("a", {});
    const p2 = table.publish("b", {});

    await Promise.all([p1, p2]);
    expect(nchan.publishCalls.map((c) => c.type)).toEqual(["joined", "a", "b"]);
  });
});
