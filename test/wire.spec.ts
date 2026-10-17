import { encodeWire, decodeWire } from "../src/wire";

// UTF-8 byte length without relying on Node globals (Buffer is not typed here).
const bytes = (s: string) => encodeURIComponent(s).replace(/%[0-9A-F]{2}/g, "x").length;

describe("wire codec (P1 keys)", () => {
  const canonicalHeartbeat = {
    messageType: "presence",
    type: "heartbeat",
    userId: "user-vsa4a",
    userName: "Anon-US",
    clientTs: 1792215833126,
    meta: {
      ts: 1792215833126,
      msgId: "7dd7af",
      ua: "macOS Safari",
      origin: "/",
      country: "US",
      city: "Portland",
      version: "v12.53",
    },
  };

  it("round-trips a lobby heartbeat", () => {
    const wire = encodeWire(canonicalHeartbeat);
    expect(JSON.parse(decodeWire(wire))).toEqual(canonicalHeartbeat);
  });

  it("uses short top-level and meta keys on the wire", () => {
    const parsed = JSON.parse(encodeWire(canonicalHeartbeat));
    expect(parsed).toEqual({
      m: "presence",
      t: "heartbeat",
      u: "user-vsa4a",
      n: "Anon-US",
      c: 1792215833126,
      meta: {
        t: 1792215833126,
        i: "7dd7af",
        u: "macOS Safari",
        o: "/",
        c: "US",
        y: "Portland",
        v: "v12.53",
      },
    });
  });

  it("round-trips non-ASCII names, options, custom, seek and null opponent", () => {
    const presence = {
      messageType: "presence",
      type: "heartbeat",
      userId: "주벼리-o3dp9",
      userName: "주벼리",
      ruleType: "threecushion",
      opponentId: null,
      options: { tableSize: "10" },
      custom: { nested: { deep: "value" } },
      seek: { tableId: "t1", ruleType: "eightball" },
      isSpectator: false,
      isLeaving: true,
      clientTs: 1,
    };
    expect(JSON.parse(decodeWire(encodeWire(presence)))).toEqual(presence);
  });

  it("does not rename keys inside options or custom", () => {
    const wire = JSON.parse(
      encodeWire({ messageType: "presence", type: "join", userId: "a", options: { userId: "x", u: "y", t: "z" } }),
    );
    expect(wire.o).toEqual({ userId: "x", u: "y", t: "z" });
  });

  it("round-trips challenge messages with challenger/challengee roles", () => {
    const challenge = {
      messageType: "challenge",
      type: "offer",
      challengerId: "a",
      challengerName: "Alice",
      challengeeId: "b",
      ruleType: "standard",
      tableId: "tbl",
      nextTurnId: "a",
      meta: { ts: 5, msgId: "m1", origin: "/", country: "GB", city: "x", ua: "Chrome", version: "v1" },
    };
    const wire = JSON.parse(encodeWire(challenge));
    expect(wire).toMatchObject({ m: "challenge", t: "offer", u: "a", n: "Alice", e: "b", r: "standard", T: "tbl", w: "a" });
    expect(JSON.parse(decodeWire(JSON.stringify(wire)))).toEqual(challenge);
  });

  it("round-trips chat messages with sender/recipient roles", () => {
    const chat = { messageType: "chat", senderId: "a", recipientId: "b", text: "hi there" };
    const wire = JSON.parse(encodeWire(chat));
    expect(wire).toEqual({ m: "chat", u: "a", e: "b", b: "hi there" });
    expect(JSON.parse(decodeWire(JSON.stringify(wire)))).toEqual(chat);
  });

  it("passes canonical frames (old publishers, auto-leaves) through unchanged", () => {
    const canonicalLeave = {
      messageType: "presence",
      type: "leave",
      userId: "u1",
      userName: "Bob",
      meta: { ts: 9, origin: "internal", msgId: "x" },
    };
    expect(JSON.parse(decodeWire(JSON.stringify(canonicalLeave)))).toEqual(canonicalLeave);
  });

  it("passes table-channel frames through unchanged", () => {
    const table = {
      type: "MOVE",
      senderId: "u1",
      data: { x: 5, y: 10 },
      meta: { ts: 1, msgId: "m1", origin: "/", country: "GB", city: "", ua: "Chrome" },
    };
    expect(JSON.parse(decodeWire(JSON.stringify(table)))).toEqual(table);
  });

  it("returns non-JSON input unchanged", () => {
    expect(decodeWire("not json")).toBe("not json");
  });

  it("does not corrupt prototype-like keys", () => {
    const parsed = JSON.parse(decodeWire('{"__proto__":{"x":1},"constructor":"c"}'));
    expect(Object.keys(parsed)).toEqual(["__proto__", "constructor"]);
    expect(parsed.constructor).toBe("c");
  });

  describe("golden sizes (payload.md §4, phase P1)", () => {
    it("sample 1 heartbeat with meta.ts is exactly 185 bytes on the wire", () => {
      expect(bytes(encodeWire(canonicalHeartbeat))).toBe(185);
    });

    it("sample 1 heartbeat without meta.ts is 167 bytes", () => {
      const { ts: _ts, ...meta } = canonicalHeartbeat.meta;
      expect(bytes(encodeWire({ ...canonicalHeartbeat, meta }))).toBe(167);
    });
  });
});
