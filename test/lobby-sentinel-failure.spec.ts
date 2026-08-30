import { Lobby } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";

// Test case: Sentinel message fails to arrive, keeping users in unsettled blue state
describe("Lobby - Sentinel Failure", () => {
  it("should keep users in unsettled state when sentinel never arrives", async () => {
    let onMessage: ((data: string) => void) | undefined;
    
    // Mock Nchan that simulates the scenario where sentinel is missing
    const mockNchan: Partial<NchanClient> = {
      subscribePresence: jest.fn((_userId: string, callback: (data: string) => void) => {
        onMessage = callback;
        return { stop: jest.fn(), ready: Promise.resolve() };
      }),
      publishPresence: jest.fn().mockResolvedValue(undefined),
      publishChallenge: jest.fn().mockResolvedValue(undefined),
      publishChat: jest.fn().mockResolvedValue(undefined),
    };
    
    // Create lobby with current user Alice
    const lobby = new Lobby(
      mockNchan as unknown as NchanClient,
      {
        messageType: "presence" as const,
        type: "join" as const,
        userId: "Alice-gny7b",
        userName: "Alice",
      },
      { heartbeatInterval: 999999 },
    );
    
    // Join lobby - this publishes our sentinel with a specific clientTs
    await lobby.join();
    expect(onMessage).toBeDefined();
    if (!onMessage) throw new Error("onMessage not set");
    
    // Verify the sentinel was published 
    expect(mockNchan.publishPresence).toHaveBeenCalled();
    const mockNchanWithMock = mockNchan as unknown as { publishPresence: { mock: { calls: any[] } } };
    const sentinelCall = mockNchanWithMock.publishPresence.mock.calls[0][0];
    expect(sentinelCall.type).toBe("join");
    expect(sentinelCall.userId).toBe("Alice-gny7b");
    expect(sentinelCall.clientTs).toBeDefined();
    const expectedSentinelTs = sentinelCall.clientTs;
    
    console.log("Sentinel published with clientTs:", expectedSentinelTs);
    
    // Simulate the problematic Nchan buffer replay:
    // - Multiple users leave (simulating network disconnect/reconnect)
    // - Then all users rejoin with new clientTs (simulating reconnection)
    // - BUT the sentinel itself never arrives!
    const messages = [
      // Bob, Alice, and Carol leave (old connections)
      {
        messageType: "presence",
        type: "leave",
        userId: "Bob-gny7b",
        userName: "Bob",
        clientTs: 1782321463184,
        meta: { ts: 1782321463253, origin: "http://localhost", version: "v4.98" }
      },
      {
        messageType: "presence", 
        type: "leave",
        userId: "Alice-gny7b", 
        userName: "Alice",
        clientTs: 1782321463181,
        meta: { ts: 1782321463254, origin: "http://localhost", version: "v4.98" }
      },
      {
        messageType: "presence",
        type: "leave",
        userId: "Carol-gny7b", 
        userName: "Carol",
        clientTs: 1782321463187,
        meta: { ts: 1782321463258, origin: "http://localhost", version: "v4.98" }
      },
      // Alice, Bob, Carol rejoin (new connections) - DIFFERENT clientTs
      {
        messageType: "presence",
        type: "join",
        userId: "Alice-9dds3",
        userName: "Alice", 
        clientTs: 1782321463278,
        meta: { ts: 1782321463280, origin: "http://localhost", version: "v4.99" }
      },
      {
        messageType: "presence",
        type: "join", 
        userId: "Bob-9dds3",
        userName: "Bob",
        clientTs: 1782321463282,
        meta: { ts: 1782321463284, origin: "http://localhost", version: "v4.99" }
      },
      {
        messageType: "presence",
        type: "join",
        userId: "Carol-9dds3", 
        userName: "Carol",
        clientTs: 1782321463295,
        meta: { ts: 1782321463297, origin: "http://localhost", version: "v4.99" }
      },
      // Heartbeats
      {
        messageType: "presence",
        type: "heartbeat",
        userId: "Alice-9dds3",
        userName: "Alice",
        clientTs: 1782321466285,
        meta: { ts: 1782321466287, origin: "http://localhost", version: "v4.99" }
      },
      {
        messageType: "presence",
        type: "heartbeat",
        userId: "Bob-9dds3",
        userName: "Bob", 
        clientTs: 1782321466288,
        meta: { ts: 1782321466290, origin: "http://localhost", version: "v4.99" }
      },
      {
        messageType: "presence",
        type: "heartbeat",
        userId: "Carol-9dds3",
        userName: "Carol",
        clientTs: 1782321466302,
        meta: { ts: 1782321466303, origin: "http://localhost", version: "v4.99" }
      },
      // Carol leaves twice (one internal, one normal)
      {
        messageType: "presence",
        type: "leave",
        userId: "Carol-9dds3",
        meta: { ts: 1782321476993, ua: "nchan-auto-leave", origin: "internal" }
      },
      {
        messageType: "presence",
        type: "leave",
        userId: "Carol-9dds3",
        userName: "Carol", 
        clientTs: 1782321476992,
        meta: { ts: 1782321476998, origin: "http://localhost", version: "v4.99" }
      }
    ];
    
    // Feed the messages into the lobby - simulating Nchan buffer replay
    for (const msg of messages) {
      onMessage(JSON.stringify(msg));
    }
    
    // CRITICAL ASSERTION: 
    // The lobby should NOT be settled because the sentinel never arrived
    expect(lobby.settled).toBe(false);
    console.log("Lobby is NOT settled (correct) because sentinel never arrived");
    
    // Users remain in unsettled state (blue) - this is the bug
    // Access the private member through type assertion since we're in the same test file
    const lobbyWithPrivateAccess = lobby as any;
    console.log("Users in unsettled buffer:", lobbyWithPrivateAccess.unsettledPresenceMessages.length);
    
    // Users are NOT yet visible in the lobby list because settle hasn't happened
    const currentUsers = lobby.getUsers();
    console.log("Current visible users:", currentUsers);
    console.log("Alice-9dds3 in users:", currentUsers.some(u => u.userId === "Alice-9dds3"));
    console.log("Bob-9dds3 in users:", currentUsers.some(u => u.userId === "Bob-9dds3"));
    console.log("Carol-9dds3 in users:", currentUsers.some(u => u.userId === "Carol-9dds3"));
    
    // ASSERT: Users should NOT be visible yet because settle never triggered
    expect(currentUsers.length).toBe(0); // No users visible until settle
    expect(lobbyWithPrivateAccess.unsettledPresenceMessages.length).toBeGreaterThan(0); // Messages in buffer
    
    // Additional diagnostic: Check that the sentinel was NOT received
    // (if it had been received, lobby.settled would be true)
    expect(lobbyWithPrivateAccess.joinSentinelTs).toBe(expectedSentinelTs);
  });
});
