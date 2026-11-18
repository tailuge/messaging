import { Lobby } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";

describe("presence heartbeat migration", () => {
  it("posts heartbeat payloads to the registry endpoint", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    try {
      const client = new NchanClient("https://example.test");
      await client.publishPresenceHeartbeat({
        type: "heartbeat",
        userId: "user-1",
        userName: "Player",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/api/presence/heartbeat");
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
        m: "p",
        t: "h",
        u: "user-1",
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses the HTTP endpoint for heartbeat syncs and Nchan for joins", async () => {
    const nchan = {
      publishPresence: jest.fn().mockResolvedValue(undefined),
      publishPresenceHeartbeat: jest.fn().mockResolvedValue(undefined),
    };
    const lobby = new Lobby(nchan as any, {
      messageType: "presence",
      type: "join",
      userId: "user-1",
      userName: "Player",
    });

    await lobby.updatePresence({ userName: "Updated" });
    await lobby.syncPresence();

    expect(nchan.publishPresenceHeartbeat).toHaveBeenCalledTimes(1);
    expect(nchan.publishPresenceHeartbeat.mock.calls[0][0]).toMatchObject({
      type: "heartbeat",
      userName: "Updated",
    });
    expect(nchan.publishPresence).toHaveBeenCalledTimes(1);
    expect(nchan.publishPresence.mock.calls[0][0]).toMatchObject({ type: "join" });
  });
});
