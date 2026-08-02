import { Table } from "../src/table";
import { MessagingClient } from "../src/messagingclient";

/**
 * Unit tests for Work Item A (idempotent join + single creation path).
 *
 * Uses a mock NchanClient so join/reconnect behaviour can be asserted
 * deterministically without a container.
 */

function createMockNchan(
  overrides: { subscribeTable?: jest.Mock } = {},
): any {
  return {
    setVersion: jest.fn(),
    record: jest.fn(),
    subscribeTable:
      overrides.subscribeTable ??
      jest.fn().mockReturnValue({
        stop: jest.fn(),
        ready: Promise.resolve(),
      }),
    publishTable: jest.fn().mockResolvedValue(undefined),
    subscribePresence: jest.fn().mockReturnValue({
      stop: jest.fn(),
      ready: Promise.resolve(),
    }),
    publishPresence: jest.fn().mockResolvedValue(undefined),
    publishChallenge: jest.fn().mockResolvedValue(undefined),
    publishChat: jest.fn().mockResolvedValue(undefined),
  };
}

function createClient(nchan: any): MessagingClient {
  return new MessagingClient({ baseUrl: "http://nchan.test", nchan });
}

describe("Table.join idempotency", () => {
  it("concurrent join() calls share one subscription and one joined handshake", async () => {
    const nchan = createMockNchan();
    const table = new Table(nchan, "table-a", "user-a");

    await Promise.all([table.join(), table.join(), table.join()]);

    expect(nchan.subscribeTable).toHaveBeenCalledTimes(1);
    expect(nchan.publishTable).toHaveBeenCalledTimes(1);
    const message = nchan.publishTable.mock.calls[0][1];
    expect(message.type).toBe("joined");
    expect(message.data.id).toBe("user-a");
  });

  it("repeated join() after readiness is a no-op", async () => {
    const nchan = createMockNchan();
    const table = new Table(nchan, "table-a", "user-a");

    await table.join();
    await table.join();
    await table.join();

    expect(nchan.subscribeTable).toHaveBeenCalledTimes(1);
    expect(nchan.publishTable).toHaveBeenCalledTimes(1);
  });

  it("concurrent join() while the subscription is connecting shares one in-flight promise", () => {
    const nchan = createMockNchan({
      subscribeTable: jest.fn().mockReturnValue({
        stop: jest.fn(),
        ready: new Promise(() => {}), // never resolves
      }),
    });
    const table = new Table(nchan, "table-a", "user-a");

    const p1 = table.join();
    const p2 = table.join();

    expect(p1).toBe(p2);
    expect(nchan.subscribeTable).toHaveBeenCalledTimes(1);
  });

  it("join() rejects after leave() (closed)", async () => {
    const nchan = createMockNchan();
    const table = new Table(nchan, "table-a", "user-a");

    await table.join();
    await table.leave();

    await expect(table.join()).rejects.toThrow(/closed/);
    expect(nchan.subscribeTable).toHaveBeenCalledTimes(1);
  });

  it("leave() during a connecting join defers the close so the server-side leave fires", async () => {
    // Simulates the early-resolve joinTable race: the consumer calls leave()
    // while the subscription's socket is still connecting. Closing a
    // connecting socket would abort the server-side subscription before it
    // exists, so the unsubscribe table:leave would never fire. Instead the
    // in-flight join must close it once ready.
    const stop = jest.fn();
    let resolveReady: () => void = () => {};
    const nchan = createMockNchan({
      subscribeTable: jest.fn().mockReturnValue({
        stop,
        ready: new Promise<void>((r) => {
          resolveReady = r;
        }),
      }),
    });
    const table = new Table(nchan, "table-a", "user-a");

    const joinPromise = table.join();
    // leave() (teardown) while the socket is still connecting
    const leavePromise = table.leave({ isTeardown: true });

    // The socket was NOT closed directly by leave() — the join owns it.
    expect(stop).not.toHaveBeenCalled();
    expect(table.closed).toBe(true);

    // The socket opens; the in-flight join observes closed and stops it.
    resolveReady();
    await joinPromise;
    await leavePromise;

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("a failed joined handshake is retried by the control path until accepted", async () => {
    const publishTable = jest
      .fn()
      .mockRejectedValueOnce(new Error("server down"))
      .mockResolvedValue(undefined);
    const nchan = createMockNchan();
    nchan.publishTable = publishTable;
    const table = new Table(nchan, "table-a", "user-a", undefined, false, undefined, undefined, undefined, {
      initialRetryDelayMs: 10,
      maxRetryDelayMs: 50,
    });

    // The control path retries the handshake (it does not reject on a
    // transient failure), so join() completes once the server accepts.
    await table.join();
    expect(publishTable).toHaveBeenCalledTimes(2);
    expect((table as any).isJoined).toBe(true);
  });

  it("spectators do not publish a joined handshake", async () => {
    const nchan = createMockNchan();
    const table = new Table(nchan, "table-a", "user-s", undefined, true);

    await table.join();

    expect(nchan.subscribeTable).toHaveBeenCalledTimes(1);
    expect(nchan.subscribeTable.mock.calls[0][3]).toEqual({ isSpectator: true });
    expect(nchan.publishTable).not.toHaveBeenCalled();
  });
});

describe("MessagingClient.joinTable session management", () => {
  it("resolves as soon as the session exists, before the subscription handshake completes", async () => {
    const nchan = createMockNchan({
      subscribeTable: jest.fn().mockReturnValue({
        stop: jest.fn(),
        ready: new Promise(() => {}), // subscription never becomes ready
      }),
    });
    const client = createClient(nchan);

    const table = await client.joinTable("table-a", "user-a");

    expect(table).toBeDefined();
    expect(table.tableId).toBe("table-a");
    // The background handshake was kicked off (subscription initiated) even
    // though joinTable itself did not wait for readiness.
    expect(nchan.subscribeTable).toHaveBeenCalledTimes(1);

    await client.stop();
  });

  it("concurrent joinTable() calls share one in-flight promise and one table instance", async () => {
    const nchan = createMockNchan();
    const client = createClient(nchan);

    const [t1, t2] = await Promise.all([
      client.joinTable("table-a", "user-a"),
      client.joinTable("table-a", "user-a"),
    ]);

    expect(t1).toBe(t2);
    expect(nchan.subscribeTable).toHaveBeenCalledTimes(1);

    await client.stop();
  });

  it("returns the existing table instance for a later same-identity call", async () => {
    const nchan = createMockNchan();
    const client = createClient(nchan);

    const t1 = await client.joinTable("table-a", "user-a");
    const t2 = await client.joinTable("table-a", "user-a");

    expect(t1).toBe(t2);
    expect(nchan.subscribeTable).toHaveBeenCalledTimes(1);

    await client.stop();
  });

  it("later joinTable calls do not add listeners to an existing table", async () => {
    const nchan = createMockNchan();
    const client = createClient(nchan);

    const onMessage = jest.fn();
    const t1 = await client.joinTable("table-a", "user-a", { onMessage });
    await client.joinTable("table-a", "user-a", { onMessage: jest.fn() });

    expect((t1 as any).messageListeners).toHaveLength(1);
    await client.stop();
  });

  it("same-tableId with a different user rejects", async () => {
    const nchan = createMockNchan();
    const client = createClient(nchan);

    await client.joinTable("table-a", "user-a");
    await expect(client.joinTable("table-a", "user-b")).rejects.toThrow(/already/);

    await client.stop();
  });

  it("same-tableId with a different role (spectator vs player) rejects", async () => {
    const nchan = createMockNchan();
    const client = createClient(nchan);

    await client.joinTable("table-a", "user-a");
    await expect(client.spectateTable("table-a", "user-a")).rejects.toThrow(/already/);

    await client.stop();
  });

  it("joins after leave() create a fresh session", async () => {
    const nchan = createMockNchan();
    const client = createClient(nchan);

    const t1 = await client.joinTable("table-a", "user-a");
    await t1.leave();
    const t2 = await client.joinTable("table-a", "user-a");

    expect(t1).not.toBe(t2);
    expect(t1.closed).toBe(true);
    expect(t2.closed).toBe(false);
    expect(nchan.subscribeTable).toHaveBeenCalledTimes(2);

    await client.stop();
  });
});
