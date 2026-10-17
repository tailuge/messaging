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
      m: "p",
      t: "h",
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

  it("codes challenge type values and decodes them back", () => {
    const offer = { messageType: "challenge", type: "offer", challengerId: "a", challengerName: "A", challengeeId: "b", ruleType: "standard" };
    const wire = JSON.parse(encodeWire(offer));
    expect(wire).toMatchObject({ m: "c", t: "o" });
    expect(JSON.parse(decodeWire(JSON.stringify(wire)))).toEqual(offer);
  });

  it("round-trips every presence and challenge type", () => {
    for (const type of ["join", "heartbeat", "leave"]) {
      const m = { messageType: "presence", type, userId: "u", userName: "n" };
      expect(JSON.parse(decodeWire(encodeWire(m)))).toEqual(m);
    }
    for (const type of ["offer", "accept", "decline", "cancel"]) {
      const m = { messageType: "challenge", type, challengerId: "a", challengerName: "A", challengeeId: "b", ruleType: "r" };
      expect(JSON.parse(decodeWire(encodeWire(m)))).toEqual(m);
    }
  });

  it("leaves unknown type values unchanged", () => {
    const m = { messageType: "presence", type: "someNewType", userId: "u", userName: "n" };
    const wire = JSON.parse(encodeWire(m));
    expect(wire.t).toBe("someNewType");
    expect(JSON.parse(decodeWire(encodeWire(m)))).toEqual(m);
  });

  it("decodes the P1 word form (m and t as words) unchanged", () => {
    const p1 = '{"m":"presence","t":"heartbeat","u":"u1","n":"N"}';
    expect(JSON.parse(decodeWire(p1))).toEqual({ messageType: "presence", type: "heartbeat", userId: "u1", userName: "N" });
  });

  it("does not decode a canonical type value that happens to be a code", () => {
    // Canonical `type` (key "type") is never treated as a wire `t` code.
    const canonical = { messageType: "presence", type: "h", userId: "u", userName: "n" };
    expect(JSON.parse(decodeWire(JSON.stringify(canonical)))).toEqual(canonical);
  });

  it("round-trips chat messages with the coded messageType", () => {
    const chat = { messageType: "chat", senderId: "a", recipientId: "b", text: "hi" };
    expect(JSON.parse(encodeWire(chat)).m).toBe("m");
    expect(JSON.parse(decodeWire(encodeWire(chat)))).toEqual(chat);
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
    expect(wire).toMatchObject({ m: "c", t: "o", u: "a", n: "Alice", e: "b", r: "standard", T: "tbl", w: "a" });
    expect(JSON.parse(decodeWire(JSON.stringify(wire)))).toEqual(challenge);
  });

  it("round-trips chat messages with sender/recipient roles", () => {
    const chat = { messageType: "chat", senderId: "a", recipientId: "b", text: "hi there" };
    const wire = JSON.parse(encodeWire(chat));
    expect(wire).toEqual({ m: "m", u: "a", e: "b", b: "hi there" });
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
    it("sample 1 heartbeat with meta.ts is exactly 170 bytes on the wire (P1 + P2a)", () => {
      expect(bytes(encodeWire(canonicalHeartbeat))).toBe(170);
    });

    it("sample 1 heartbeat without meta.ts is 152 bytes (P1 + P2a)", () => {
      const { ts: _ts, ...meta } = canonicalHeartbeat.meta;
      expect(bytes(encodeWire({ ...canonicalHeartbeat, meta }))).toBe(152);
    });
  });
});
