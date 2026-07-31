import { Table } from "../src/table";
import { NchanClient } from "../src/nchanclient";

describe("Table Rejoin Detection (Option A)", () => {
  let mockNchan: jest.Mocked<NchanClient>;
  let table: Table;

  beforeEach(() => {
    mockNchan = {
      subscribeTable: jest.fn().mockReturnValue({
        stop: jest.fn(),
        ready: Promise.resolve(),
      }),
      publishTable: jest.fn().mockResolvedValue(undefined),
    } as any;

    table = new Table(mockNchan, "test-table", "user-a");
  });

  it("should trigger onOpponentRejoined and reset opponentLeft when opponent sends a joined message after leaving", async () => {
    let opponentLeftCalled = 0;
    let opponentRejoinedCalled = 0;

    table.onOpponentLeft(() => {
      opponentLeftCalled++;
    });

    table.onOpponentRejoined(() => {
      opponentRejoinedCalled++;
    });

    await table.join();

    // Symmetrical join flow
    // First, user-a joined
    // Simulate user-a sending their joined message
    const handleMessage = (table as any).handleIncomingMessage.bind(table);

    handleMessage(JSON.stringify({
      type: "joined",
      senderId: "user-a",
      data: { id: "user-a" }
    }));

    // Now simulate user-b (opponent) joining for the first time
    handleMessage(JSON.stringify({
      type: "joined",
      senderId: "user-b",
      data: { id: "user-b" }
    }));

    // bothJoined should resolve and bothJoinedResolved should be true
    expect((table as any).bothJoinedResolved).toBe(true);
    expect(table.opponentLeft).toBe(false);

    // Now simulate opponent leaving
    handleMessage(JSON.stringify({
      type: "table:leave",
      senderId: "user-b",
      data: {}
    }));

    expect(table.opponentLeft).toBe(true);
    expect(opponentLeftCalled).toBe(1);
    expect(opponentRejoinedCalled).toBe(0);

    // Simulate opponent rejoining
    handleMessage(JSON.stringify({
      type: "joined",
      senderId: "user-b",
      data: { id: "user-b" }
    }));

    expect(table.opponentLeft).toBe(false);
    expect(opponentLeftCalled).toBe(1);
    expect(opponentRejoinedCalled).toBe(1);
  });
});
