/**
 * Compact wire codec for lobby messages (payload.md, phase P1: keys only).
 *
 * Top-level keys, the nested `seek` object and the `meta` object are renamed to
 * short codes. Values are not coded in P1. Keys and values with no table entry
 * pass through unchanged, so canonical frames from older publishers, server
 * auto-leaves and table-channel frames all decode to themselves.
 *
 * `encodeWire` is applied to lobby publishes only. `decodeWire` is applied to
 * every inbound frame.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);

const invert = (m: Map<string, string>): Map<string, string> => new Map([...m].map(([a, b]) => [b, a]));

/** Context-free top-level keys, canonical -> wire. `meta` is deliberately not renamed. */
const TOP_ENCODE = new Map<string, string>([
  ["messageType", "m"],
  ["type", "t"],
  ["ruleType", "r"],
  ["tableId", "T"],
  ["arenaId", "A"],
  ["options", "o"],
  ["custom", "z"],
  ["seek", "s"],
  ["isSpectator", "S"],
  ["isLeaving", "L"],
  ["clientTs", "c"],
  ["nextTurnId", "w"],
  ["text", "b"],
]);
const TOP_DECODE = invert(TOP_ENCODE);

/** Role keys: the wire code is shared, the canonical name depends on messageType. */
const ROLE_ENCODE = new Map<string, string>([
  ["userId", "u"],
  ["challengerId", "u"],
  ["senderId", "u"],
  ["userName", "n"],
  ["challengerName", "n"],
  ["challengeeId", "e"],
  ["opponentId", "e"],
  ["recipientId", "e"],
]);
const ROLE_DECODE = new Map<string, Map<string, string>>([
  [
    "presence",
    new Map([
      ["u", "userId"],
      ["n", "userName"],
      ["e", "opponentId"],
    ]),
  ],
  [
    "challenge",
    new Map([
      ["u", "challengerId"],
      ["n", "challengerName"],
      ["e", "challengeeId"],
    ]),
  ],
  [
    "chat",
    new Map([
      ["u", "senderId"],
      ["e", "recipientId"],
    ]),
  ],
]);

/** Keys inside `meta` (server-stamped and client-stamped alike). */
const META_ENCODE = new Map<string, string>([
  ["ts", "t"],
  ["msgId", "i"],
  ["ua", "u"],
  ["origin", "o"],
  ["country", "c"],
  ["city", "y"],
  ["version", "v"],
]);
const META_DECODE = invert(META_ENCODE);

/** Keys inside the nested `seek` object. */
const SEEK_ENCODE = new Map<string, string>([
  ["tableId", "T"],
  ["ruleType", "r"],
]);
const SEEK_DECODE = invert(SEEK_ENCODE);

/** Renames keys via `map`; unmapped keys are kept. Uses fromEntries so `__proto__` stays a plain key. */
function mapKeys(obj: Obj, map: Map<string, string>): Obj {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [map.get(k) ?? k, v]));
}

function mapIfObj(v: unknown, map: Map<string, string>): unknown {
  return isObj(v) ? mapKeys(v, map) : v;
}

/** Canonical lobby message -> compact JSON string. */
export function encodeWire(msg: Obj): string {
  const out = Object.fromEntries(
    Object.entries(msg).map(([k, v]) => {
      const key = ROLE_ENCODE.get(k) ?? TOP_ENCODE.get(k) ?? k;
      const value = k === "meta" ? mapIfObj(v, META_ENCODE) : k === "seek" ? mapIfObj(v, SEEK_ENCODE) : v;
      return [key, value];
    }),
  );
  return JSON.stringify(out);
}

/**
 * Compact or canonical frame -> canonical JSON string. Anything not in a table
 * passes through unchanged. Non-JSON input is returned as-is.
 */
export function decodeWire(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!isObj(parsed)) return raw;

  const messageType = typeof parsed.m === "string" ? parsed.m : parsed.messageType;
  const roles = typeof messageType === "string" ? ROLE_DECODE.get(messageType) : undefined;

  const out = Object.fromEntries(
    Object.entries(parsed).map(([k, v]) => {
      const key = roles?.get(k) ?? TOP_DECODE.get(k) ?? k;
      const value = k === "meta" ? mapIfObj(v, META_DECODE) : k === "s" ? mapIfObj(v, SEEK_DECODE) : v;
      return [key, value];
    }),
  );
  return JSON.stringify(out);
}
