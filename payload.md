# Compact wire payload

> **Status (implemented: P1 keys + P2a type codes):** `src/wire.ts` codec wired into `NchanClient`; `docker/nchan_meta.js` emits compact meta keys (`t,i,u,o,c,y,v`), anchored `extractClientVersion`, dual-form counters (`"m":"p"` / `"t":"l"` and canonical words), and `mergeMeta` removed. P2a codes `messageType` (`p`/`c`/`m`) and presence/challenge `type` values. Measured heartbeat: 170 B with `meta.ts` (152 B without). That is 15 B below P1 (185 B), not the 7 B the P2a row in §6 predicts. P2b (`meta.ts` ua codes) and §11.1 (positional meta) remain deferred.

> Spec for shrinking nchan publish/subscribe payloads **without changing the library's public message types and without any server-side compression**.
> Scope: the **lobby channel only** (presence, challenge, chat). Table-channel game messages are out of scope. Back-compat policy: **decode-side only** — see §6.
> All byte figures are UTF-8 bytes of `JSON.stringify(msg)` (`Buffer.byteLength`), measured against the two live messages captured on 2026-10-17. P1 and P2a are implemented (see the status note at the top); P2b and §11.1 are deferred.

---

## 1. Why

The lobby fan-out is the dominant bandwidth cost:

- 521 MB of WebSocket responses in 17 days (≈30.6 MB/day), out of 1,005 MB total.
- Presence is broadcast to every lobby subscriber (game pages included, because they call `joinLobby()`), so daily egress is `1440 × N × (N−1) × bytes` per presence message series.
- At N≈12 that is ≈190,080 deliveries/day. Message size is therefore the dominant lever that does not change behaviour.
- Every publish also **echoes the whole enriched message back** as its HTTP response (`docker/nchan_meta.js:219` does `r.return(res.status, body)`) and nothing reads it — `NchanClient.publish` branches on `response.ok` alone. At the 60 s heartbeat interval (`src/lobby.ts:67`) that is 17,280 publishes/day × 243–309 B ≈ **4.2–5.3 MB/day of dead response body** at N=12 (2.8–3.6 MB after this spec; zero with §7.7).

`nchan_deflate_message_for_websocket` was removed in `51f9e08` because zlib cost too much CPU on a 0.25 vCPU instance. Short keys cost no CPU and recover the same bytes: on the synthetic baseline the compact heartbeat is 169 B against 168 B deflated (≈30.6 MB/day either way), and on the live samples below it is smaller still (142–160 B).

## 2. Constraints

1. **Public API unchanged.** `PresenceMessage`, `ChallengeMessage`, `ChatMessage`, `TableMessage`, `Meta` in `src/types.ts` stay as they are. Encode/decode live inside `NchanClient`, so `lobby.ts`, `table.ts`, `src/client/**` and external consumers of the `tailuge/messaging` framework all read the same canonical shapes as today — **no consumer change**.

2. **Scope: the lobby channel only.** Presence, challenge and chat on `/publish|subscribe/presence/lobby` are ~95% of the egress (§1). Table-channel game messages keep their canonical keys (`senderId`, `type`, app-owned `type` values, `data`) and are passed straight through by the decoder; `publishTable` never runs the codec. (Table messages still receive server-injected `meta`, which does become compact — §7.1, §6.)

3. **No server compression, minimal server work.** No zlib, no server-side re-encoding of frames, no `nchan.conf` changes, no per-subscriber translation. The only server changes are the ones in `docker/nchan_meta.js` listed in §7 (createMeta's key names, `extractClientVersion`, the counter greps, and — §7.7 — emptying the unused publish response), plus the optional one-line delimiter change if §11.1 is adopted.

4. **App-owned payloads are opaque.** The lookup tables are applied **shallowly**: top level, the `meta` object, and the nested `seek` object only. Nothing inside `options`, `custom`, or `data` — at any depth — is renamed or rewritten; `text` values are unchanged.

5. **Server-enriched `meta` keeps working.** `meta.ts`, `meta.msgId`, `meta.origin === "internal"`, `meta.country`, `meta.city`, `meta.ua` are all restored by decode before any consumer reads them.

6. **Back-compatibility: decode-side, not publish-side.** The decoder accepts both shapes forever, for free (§3.1 pass-through). Publishing frames that *old* subscribers could also read would cost **all** of the savings — such a frame must contain every legacy byte (§6) — so it is explicitly not done: during rollout old subscribers silently miss frames from upgraded tabs. Accepted, with the direction-by-direction analysis and rollout order in §6.

7. **The debug surface stays readable.** `NchanClient.recordedMessages` is parsed by tests (`test/debug-dedup.spec.ts:66,75`, `test/messagingclient.spec.ts:754`) and must keep returning canonical JSON.

## 3. Design

### 3.1 Codec boundary

New module `src/wire.ts`. The whole codec is lookup tables plus pass-through — no per-message branching on frame shape. Implemented in `src/wire.ts` (P1 + P2a; the tables there are `TOP_*`, `ROLE_*`, `META_*`, `SEEK_*`, `MESSAGE_TYPE_*` and `TYPE_*`). The `ua` table in §3.3 is not implemented:

```ts
KEYS        // canonical -> wire: context-free top-level keys (§3.2)
ROLE_KEYS   // canonical -> wire: top-level u/n/e; which canonical key each maps from
            // depends on messageType (§3.2)
META_KEYS   // canonical -> wire: keys inside meta (§3.4)
VALUES      // canonical -> wire: value codes grouped by context — messageType,
            // presence type, challenge type, ua (§3.3)

encodeWire(msg: Record<string, unknown>): string  // canonical -> compact JSON (implemented)
decodeWire(raw: string): string           // compact | canonical -> canonical JSON
```

- `encodeWire` renames top-level keys via `KEYS`/`ROLE_KEYS`, maps values via the context group, and recurses into `meta` and `seek` only. **Anything not found in a table is copied byte-for-byte.**
- `decodeWire` inverts the same tables; **keys and values not in any table pass through unchanged**. That single rule replaces all shape detection: canonical frames from old publishers, canonical server auto-leaves (`publish_auto_leave`), and out-of-scope table frames all decode to themselves — so there is **no `kind` parameter and no sniffing**.
- `NchanClient.publish()` calls `encodeWire` after injecting `version` into `meta`, before the POST body is built (lobby publishers only — `publishTable` is out of scope, §2.2).
- `NchanClient.subscribe()` calls `decodeWire(event.data)` in `onmessage`; the same function serves both subscriptions — table frames are canonical and pass through untouched.
- `_recordedMessages` keeps the **raw** frame; the `recordedMessages` getter decodes lazily with the same `decodeWire`. The array is a mix of lobby and table frames: lobby frames are normalised, table frames pass through — canonical JSON either way (constraint 7).

### 3.2 Key table (top level)

> **Status: implemented (P1)** — every row below is in `src/wire.ts`.

| Canonical | Wire | Used by | Notes |
|---|---|---|---|
| `messageType` | `m` | presence, challenge, chat | value coded, see §3.3 |
| `type` | `t` | presence, challenge | values coded (§3.3) |
| `userId` / `challengerId` / `senderId` | `u` | presence, challenge, chat | always **the actor** |
| `userName` / `challengerName` | `n` | presence, challenge | always the actor's display name |
| `challengeeId` / `opponentId` / `recipientId` | `e` | challenge, presence, chat | always **the counterparty** |
| `ruleType` | `r` | presence, challenge, seek | value unchanged |
| `tableId` | `T` | presence, challenge, seek | |
| `arenaId` | `A` | presence | |
| `options` | `o` | presence, challenge | value opaque (§3.5) |
| `custom` | `z` | presence, challenge | value opaque (§3.5) |
| `seek` | `s` | presence | nested: `tableId`→`T`, `ruleType`→`r` |
| `isSpectator` | `S` | presence | |
| `isLeaving` | `L` | presence | |
| `clientTs` | `c` | presence | keep on `join` (sentinel), see §10 |
| `nextTurnId` | `w` | challenge | |
| `text` | `b` | chat | value unchanged |
| `meta` | `meta` | all | **deliberately not renamed**, see §3.4 |

Role-based naming keeps the mapping small and unambiguous: `u`/`n` always describe the message's actor, `e` always the other party, so a challenge and a presence message share one vocabulary. On decode, `ROLE_KEYS` is resolved by `messageType`: challenge → `challengerId`/`challengerName`/`challengeeId`; presence → `userId`/`userName`/`opponentId`; chat → `senderId`/`recipientId`. (`data`/`d` and `senderId`-on-table are omitted: the table channel is out of scope, §2.2.)

### 3.3 Value codes

> **Status:** `messageType` and presence/challenge `type` values are implemented (P2a). The `meta.ua` table is **deferred (P2b)** and is not in the code.

`messageType`:

| Canonical | Wire |
|---|---|
| `presence` | `p` |
| `challenge` | `c` |
| `chat` | `m` |

`type` when `messageType` is `"presence"`:

| Canonical | Wire |
|---|---|
| `join` | `j` |
| `heartbeat` | `h` |
| `leave` | `l` |

`type` when `messageType` is `"challenge"`:

| Canonical | Wire |
|---|---|
| `offer` | `o` |
| `accept` | `a` |
| `decline` | `d` |
| `cancel` | `x` |

Values outside these tables pass through unchanged (forward compatibility).

**`meta.ua`** is encoded as two characters, `<os><browser>`:

| OS (from `parseUA`) | Code | Browser (from `parseUA`) | Code |
|---|---|---|---|
| Mac | `m` | Chr (Chrome) | `c` |
| Win | `w` | Saf (Safari) | `s` |
| Lnx | `l` | Fir (Firefox) | `f` |
| And | `a` | Edg (Edge) | `e` |
| iOS | `i` | Opr (Opera) | `o` |
| Tau (Tauri) | `t` | Sam (Samsung Internet) | `g` |
| Chr (ChromeOS) | — | Chro (Chromium) | — |

So `"Mac Saf"` → `"ms"`, `"Win Chr"` → `"wc"`, `"Lnx Chr"` → `"lc"`.

OS and browser labels are three characters each, and are independent namespaces, so
Chrome on ChromeOS is `"Chr Chr"` and needs no extra disambiguation. A fourth letter is
only added to split a family: Chromium is `Chro`, Chrome is `Chr`. The OS parser reads
`Chr` (ChromeOS) from the `X11;` platform comment — the token after it, or the one after a
legacy `U` marker. Other X11 platform tokens keep the first three letters of the token as
reported: Ubuntu → `Ubu`, Fedora → `Fed`, FreeBSD → `Fre`. `Chr` and `Chro` still need a
code when P2b lands (`C` is free).

- **Server side** the code is derived from the `(os, browser)` pair `parseUA()` already produces — pass `parsedUA` (computed in `buildMeta`, `docker/nchan_meta.js:97`) into `createMeta` instead of re-running `reduceUA`; no string lookup, no extra CPU. The long form stays in the `ip_cache` value (`country|city|count|origins|os|browser`) for `/api/stats`; an `os`/`browser` field that `parseUA()` could not classify holds the raw user agent instead of the `Unknown` keyword (`classifyForCache`, kept for diagnosing the regexes from real traffic), and only an empty header still stores `Unknown`.
- **Client side** the code is mapped back to `"<os> <browser>"` during decode, so `loc-ua` in `user-list.js` and everything downstream see the same string as today.
- **Fallback / literal path:** `reduceUA` strips `Unknown` before it reaches `meta`, so the values that actually arrive are: a full pair (`"Mac Saf"` → `ms`, `"Win Chr"` → `wc`), a single half (`"Chr"`, `"Mac"` — the other half was `Unknown`), `"Tau Tau"` (`parseUA` sets *both* halves to `Tauri`, but the browser table has no code for it), or — when both halves are `Unknown` — the raw UA header verbatim. Everything that is not a known 2-char code is sent and decoded as a literal, so all of these round-trip unchanged. One strictly theoretical edge: a raw-UA fallback that happens to be exactly two characters matching a code (`"ms"`) would decode to the wrong string — real UA headers are tens of bytes; logged in §10.

### 3.4 `meta`

> **Status: keys implemented (P1).** `meta.ua` keeps its long form until P2b.

The key name stays `meta`:

- `injectMetaString` in `docker/nchan_meta.js` locates the existing `"meta"` object and splices in the server's own JSON. Keeping the name means **no change to that function**.
- Renaming it saves 3 bytes/message but requires changing the injection lookup, and any publisher that still sends the old key produces a message with **two** meta objects (the function appends a second `"meta"` when it cannot find one).

`meta` keys:

| Canonical | Wire | Notes |
|---|---|---|
| `ts` | `t` | server-stamped (`createMeta`); clients must never set it |
| `msgId` | `i` | required by `table.ts` dedup (`src/table.ts:418`) |
| `ua` | `u` | coded (§3.3) |
| `origin` | `o` | `"internal"` drives auto-leave suppression |
| `country` | `c` | 2 chars, unchanged |
| `city` | `y` | free text, unchanged |
| `version` | `v` | free text, unchanged |

`meta` is its own namespace: `t` there means `ts`, not `type`.

- **Optional positional form:** see §11.1 — if adopted, the table above describes *positions* instead of key names and nothing else in the design changes.
- `Meta` in `src/types.ts` also declares `ip` and `method`; the server never emits them, and an unmapped key passes through `decodeWire` untouched (§3.1), so no row is needed.

### 3.5 Frozen by design

Never renamed or rewritten:

- the contents of `options` and `custom`, at any depth (e.g. `"o":{"tableSize":"10"}` — `tableSize` stays `tableSize`);
- `data` on table messages, and table-message `type` **values** (`MOVE`, `joined`, `table:leave`, …) — the whole table channel never reaches the codec (§2.2);
- `text`, `userId`, `userName`, `city`, `version`, `country`, `origin`, and all channel/table ids;
- `ruleType` values.

## 4. Worked examples (live)

### 4.1 Sample 1 — Anon-US

Canonical, **224 B**:

```json
{"messageType":"presence","type":"heartbeat","userId":"user-vsa4a","userName":"Anon-US","clientTs":1792215833126,"meta":{"msgId":"7dd7af","ua":"macOS Safari","origin":"/","country":"US","city":"Portland","version":"v12.53"}}
```

Wire, **142 B** (−82 B, −36.6%):

```json
{"m":"p","t":"h","u":"user-vsa4a","n":"Anon-US","c":1792215833126,"meta":{"i":"7dd7af","u":"ms","o":"/","c":"US","y":"Portland","v":"v12.53"}}
```

| Field | Wire | Before | After | Saved |
|---|---|---|---|---|
| messageType | m | 24 | 7 | 17 |
| type | t | 18 | 7 | 11 |
| userId | u | 21 | 16 | 5 |
| userName | n | 20 | 13 | 7 |
| clientTs | c | 24 | 17 | 7 |
| meta.msgId | meta.i | 16 | 12 | 4 |
| meta.ua | meta.u | 19 | 8 | 11 |
| meta.origin | meta.o | 12 | 7 | 5 |
| meta.country | meta.c | 14 | 8 | 6 |
| meta.city | meta.y | 17 | 14 | 3 |
| meta.version | meta.v | 18 | 12 | 6 |
| structural (`{}`, commas) | — | 7 | 7 | 0 |

### 4.2 Sample 2 — KR, threecushion, with options

Canonical, **290 B**:

```json
{"messageType":"presence","type":"heartbeat","userId":"주벼리-o3dp9","userName":"주벼리","ruleType":"threecushion","options":{"tableSize":"10"},"clientTs":1792214700097,"meta":{"msgId":"148b70","ua":"Windows Chrome","origin":"/","country":"KR","city":"Seoul","version":"261013.12-4"}}
```

Wire, **193 B** (−97 B, −33.4%):

```json
{"m":"p","t":"h","u":"주벼리-o3dp9","n":"주벼리","r":"threecushion","o":{"tableSize":"10"},"c":1792214700097,"meta":{"i":"148b70","u":"wc","o":"/","c":"KR","y":"Seoul","v":"261013.12-4"}}
```

| Field | Wire | Before | After | Saved |
|---|---|---|---|---|
| messageType | m | 24 | 7 | 17 |
| type | t | 18 | 7 | 11 |
| userId | u | 26 | 21 | 5 |
| userName | n | 22 | 15 | 7 |
| ruleType | r | 25 | 18 | 7 |
| options | o | 28 | 22 | 6 |
| clientTs | c | 24 | 17 | 7 |
| meta.msgId | meta.i | 16 | 12 | 4 |
| meta.ua | meta.u | 21 | 8 | 13 |
| meta.origin | meta.o | 12 | 7 | 5 |
| meta.country | meta.c | 14 | 8 | 6 |
| meta.city | meta.y | 14 | 11 | 3 |
| meta.version | meta.v | 23 | 17 | 6 |
| structural (`{}`, commas) | — | 9 | 9 | 0 |

`options` saves 6 B from the key rename only; `"tableSize"` and `"10"` are untouched, as required.

> Note: both live samples omit `meta.ts`, while `createMeta` in `docker/nchan_meta.js` (HEAD) always emits it. Sizes with `ts` present are 243 → 160 B and 309 → 211 B. If the deployed build genuinely omits `ts`, that is a separate bug — `MessageDeduplicator` and `shouldIgnoreAutoLeave` read `msg.meta?.ts`.

## 5. Measured result

| Variant | Sample 1 | Sample 2 | Saving |
|---|---|---|---|
| Canonical, as captured | 224 B | 290 B | — |
| Compact wire | **142 B** | **193 B** | −36.6% / −33.4% |
| Canonical + `meta.ts` | 243 B | 309 B | — |
| Compact + `meta.ts` | **160 B** | **211 B** | −34.2% / −31.7% |

Fan-out at N=12 (190,080 deliveries/day):

| Variant | Sample 1 | Sample 2 |
|---|---|---|
| Canonical + `ts` | 44.0 MB/day | 56.0 MB/day |
| Compact + `ts` | **29.0 MB/day** | **38.2 MB/day** |

This is the range that replaces the measured 30.6 MB/day of deflated traffic with zero server CPU.

The savings hold on the other lobby types: join 305 → 208 B (−32%), challenge 296 → 187 B (−37%). (Table shot measured 258 → 206 B (−20%, game payload dominates) — recorded for reference only, table channel is out of scope, §2.2. Join and challenge are pinned to the golden fixtures in §9.2.)

## 6. Compatibility and rollout

Nchan stores one message and fans the **identical bytes** out to every subscriber — there is no per-subscriber transform. Compatibility therefore splits by reader generation — new readers handle both shapes for free, old readers cannot be helped at an acceptable cost — and the design buys only the free half:

| Direction | Works? | Why |
|---|---|---|
| Old publisher → new subscriber | **Yes, free** | pass-through decode (§3.1): unknown keys and values are copied through, so canonical frames — including server-generated auto-leaves — decode to themselves. |
| New publisher → old subscriber | **No — accepted** | an old build has no inverse table: lobby frames fail `isPresenceMessage()` / `!msg.type` guards and are silently dropped (missing roster entries / missed moves, no error). Affected readers: tabs running a pre-codec bundle (statics ship in the image via `COPY html/` in `docker/Dockerfile:62`, so an image rebuild refreshes them but already-open tabs keep the old JS until reload) and npm consumers pinned to an older `tailuge/billiards`. |
| Server-stamped `meta` → old subscriber | **No — accepted** | `injectMetaString` rewrites `meta` on **every** publish, whatever the publisher's version, so after §7.1 old readers lose `meta.msgId` (table replay dedup → possible duplicate game events), `meta.origin`/`meta.ts` (auto-leave suppression) and `meta.ts` timing — including on table channels, whose frames otherwise stay canonical. Reload / version bump fixes it. Old↔old pairs still parse each other, but show the 2-char `ua` code in the `loc-ua` tooltip. |

**Why publisher-side compatibility is not kept.** A frame an old reader can still understand must, by definition, contain every legacy key and value — it is at least today's 224 B, i.e. **100% of the saving is spent**; carrying the compact keys *as well* exceeds canonical (two separate frames would be exactly 224 + 142 = 366 B, +63%). And the gap cannot be closed server-side: serving a compact buffer to new subscribers and canonical to old ones needs a per-subscriber re-encode (nchan sends one buffer verbatim) or a relay — both are the server work §2.3 forbids, for a window that is unbounded (pinned npm versions, sleeping tabs). Decision: pay 0 B for the decode side, accept the rollout window above.

**Rollout:**

1. Ship the decoder-capable client and rebuild the image so the statics in `docker/html/` pick up the codec. Already-open tabs degrade per the table until reloaded.
2. Land the `docker/nchan_meta.js` changes (§7) in the same deploy if the direction-3 degradation is acceptable; otherwise ship §7.1 in a second deploy — that staggering only protects old readers' `meta.msgId`/`meta.ts` (mainly table channels), nothing else.
3. No staging between lobby message types is required (same channel, same codec) — which is also why **no table-channel phase exists**: it is out of scope (§2.2), not deferred.

**Detection:** none — table inversion + pass-through (§3.1) covers every shape. **No explicit wire-version field:** a `w:2` marker costs 4 B/message and buys nothing while both shapes decode anyway. If legacy support is ever dropped, nothing needs to change either — pass-through is unconditional, so old publishers keep working even after a hypothetical cleanup.

**Phasing (step by step).** Ship the **complete decoder** with the first release — inverse tables cost zero bytes, so no reader ever encounters a code it cannot expand (a keys-only decoder would silently drop a P2 frame: pass-through would leave `m:"p"` unreadable by `isPresenceMessage`). Only the **encoder** and the **server** are then flipped, in three independently shippable steps:

| Step | Encoder / server | Heartbeat on the wire (§4 samples, with `meta.ts`) | Saving |
|---|---|---|---|
| 0 | canonical (today) | 243 B / 309 B | — |
| **P1 keys** ✅ implemented | top-level + `meta` key renames only — values stay words (`"m":"presence"`, `"u":"Mac Saf"`); server: §7.1 key names + §7.2 + §7.3 | **185 B / 238 B** | **−24% / −23% (≈70% of the win)** |
| P2a type codes ✅ implemented | + `messageType` / `type` value codes (§3.3) | 170 B measured (sample 1); sample 2 not measured | −15 B vs P1 on sample 1 (table predicted −7 B) |
| P2b ua codes (deferred) | + server-side 2-char `meta.ua` (§3.3, §7.1 `ua` line) — full §4/§5 state | 160 B / 211 B | −34% / −32% |

P1 is the recommended first step: one flat map + inverse, no value groups, no fallback semantics — ~70% of the bytes for a fraction of the risk. P2b goes last: it is the only step with fallback rules (single-half UAs, Tauri, literal pass-through). `ROLE_KEYS` resolution is step-invariant — the decoder expands `m`'s value (word or code) before resolving `u`/`n`/`e`. Golden fixtures (§9.2) pin the state of whichever step the repo is on (P1 = 185/238). A presence-only kill switch can still be used inside any step.

## 7. Server changes (`docker/nchan_meta.js`)

Only this file — no `nchan.conf` changes (§2.3).

1. **Keys done (P1):** `createMeta` emits `{t, i, u, o, c, y, v}`. **Deferred (P2b):** `ua` is the 2-char code built from the `(os, browser)` pair passed in from `buildMeta` (§3.3). `reduceUA`/`parseUA` stay for the `ip_cache` and stats.
2. **Done (P1).** `extractClientVersion` now accepts `v` or `version`, inside the `meta` object only. Original analysis: `extractClientVersion` (`docker/nchan_meta.js:144`) matched `"version"` today. Two changes: accept the compact `"v"` as well, and **anchor the match to the message's `meta` object** — a bare `"v":` can appear inside opaque `options`/`custom`/`data` (constraint 4), unlike the current low-risk `"version"`. The `setVersion` call sites are unchanged (`online-panel.js:115`, `topbar.js:329`).
3. **Counters — done (P1 + P2a).** Original analysis: `publish()` currently counts presence with `reqText.includes('"messageType"') && reqText.includes('"presence"')`, and leaves with `reqText.includes('"type"') && reqText.includes('"leave"')` — separate substring tests, no adjacency (`nchan_meta.js:213-215`). With compact keys these silently stop counting; add `"m":"p"` and `"t":"l"` variants while keeping the legacy checks for old publishers. Assert in §9.5.
4. `injectMetaString` is unchanged (the key is still `meta`). Two notes: (a) its brace-matching loop walks to the first balanced `}` after the `"meta"` key, so a meta *value* containing `{`/`}` would break it — keep `v` short and plain; (b) if §11.1's positional meta is adopted, the same walk must accept `[`/`]` as the delimiter — a one-line change. (A `custom`/`options` value containing the literal key `"meta"` is a pre-existing hazard, out of scope.)
5. `publish_auto_leave` (server-generated leave, and `table:leave` from `table_unsub`) bypasses the publish path. **Updated:** the presence auto-leave on disconnect (`publish_leave`) now emits the compact form (`m:"p"`, `t:"l"`, meta `t/i/u/o`); `table:leave` stays canonical (table channel out of scope, §2.2). `docker/autoleave-check.mjs` (run by `testnchan.sh`) verifies a WebSocket disconnect produces the compact leave. The decoder still passes canonical frames through unchanged.
6. **Done.** `mergeMeta` (line 135) was dead code after `51f9e08`; delete it — along with the stale reference at `src/table.ts:60` — or bring it in line with `createMeta` so it cannot drift.
7. **Empty the publish response — done, ~4–5 MB/day saved.** (The text below describes the pre-change code.) `nchan_meta.js:219` currently echoes the **entire enriched message** back to the publisher (`r.return(res.status, body)`) while nchan's own internal response text is already discarded (line 217). Replace with `r.return(res.status, "")` and drop the `Content-Type` line 218 — return **status code only**. Verified readers: none. `NchanClient.publish` checks `response.ok` alone and never parses the body (same for the `sendBeacon` path); no `.json()`/`.text()` read of a publish response exists in `src/`, `test/`, or `playwright/`; the only reader anywhere is three assertions in `docker/testnchan.sh` (handled by §9.7). Status codes — including nchan 4xx/5xx — still propagate, and even today's *error* responses carry the published message rather than nchan's error text, so no diagnostic content is lost. Response headers (CORS via `cors.conf`, `Vary: Origin` via `metadata_headers.conf`) are untouched; only bodies go to zero. Savings: ≈4.2–5.3 MB/day from heartbeats alone at N=12 (2.8–3.6 MB after §4/§5); joins, chats and **table moves** add on top — size them by sampling `publish_requests_total` (already counted, `/api/stats`) over 24 h × average body bytes. The non-JSON passthrough (line 203) forwards nchan's small status body — test-only traffic, optionally trimmed the same way.

## 8. Client changes

**None for anyone using the framework.** `encodeWire`/`decodeWire` sit inside `NchanClient`; by the time `lobby.ts`, `table.ts`, `src/client/**` or an external `tailuge/messaging` consumer reads a message it is canonical again — same field names, same named `meta`, same `ua` display strings. `MESSAGING_SPEC.md` and `SKILL.md` examples keep working unamended. `src/client/**` needs no diff at all.

The readers that *do* change are old builds — that is §6's subject, not §8's: a pre-codec tab silently drops compact frames from upgraded tabs and loses the named `meta` fields on every frame once §7.1 lands. Accepted (§6), recoverable by reload or the image rebuild that ships the new statics.

## 9. Validation

1. **Round-trip property test — implemented** (`test/wire.spec.ts`): for every **lobby** message type, `decodeWire(encodeWire(m))` deep-equals `m`. Cover: non-ASCII `userId`/`userName`, `options`, `custom`, `seek`, `opponentId: null`, `isSpectator`, `isLeaving`, omitted optional fields.
2. **Golden byte fixtures — partly implemented.** `test/wire.spec.ts` pins sample 1 at 170 B with `meta.ts` and 152 B without (P1 + P2a). The §4/§5 figures (142/193, 160/211) are the P2b end state and are not yet pinned; join 208 B and challenge 187 B are not pinned.
3. **Size ceiling test:** a bare heartbeat as delivered on the wire — no `ruleType`/`options`, `meta.ts` present (HEAD always stamps it) — must encode to **≤ 170 B**, **Met at P1 + P2a: the test pins it at 170 B; without `meta.ts` it is 152 B.** The 160 B / 142 B figures apply after P2b. The ceiling applies post-injection so a new field cannot quietly push past the compact budget. Heartbeats carrying `ruleType`/`options` are covered by the fixtures in §4, not by the ceiling.
4. **Legacy fixture:** a canonical-shaped frame (old tab) and a canonical server auto-leave must decode to themselves — this also covers out-of-scope table frames in the shared `recordedMessages` array.
5. **Server counters — done** (`testnchan.sh` asserts a compact leave increments `presence_leave_total`; the Meta checks now target `/presence/lobby`). Original requirement: after a compact publish, `presence_publish_total` / `presence_leave_total` still increment (extend `./docker/testnchan.sh`, which asserts neither today). While in that file: its `Meta: … ts` assertions `grep` for `"ts":`, which §7.1 renames away, and several target `/publish/lobby/*` — a location `nchan.conf` does not define (`/publish/presence/lobby` does), so audit and repoint rather than assuming they pass today; the `Publish response contains …` ones are replaced by §9.7.
6. **Existing suite — passing** (`npm run test`, `npm run lint`): `npm run test` against the testcontainers nchan, plus `npm run lint`. The two tests that read `recordedMessages` must pass unchanged — that is the acceptance test for the lazy-decode getter.
7. **Publish response is empty (§7.7) — implemented, checked by `testnchan.sh`:** `curl -sS -D - -o /dev/null -w '%{http_code}' -X POST -H 'Origin: http://localhost' -d '{"messageType":"presence","type":"leave","userId":"probe"}' http://localhost/publish/presence/lobby` must return **2xx with `Content-Length: 0`**, while `Access-Control-Allow-Origin` still appears on the response (implemented as the `Publish response: 2xx, empty body, CORS header` test). It replaces the three `Meta: Publish response contains …` assertions — which already failed at baseline (they target `/publish/lobby/*`, a stale location; §9.5) — instead of the `Subscribe receives meta/ts …` twins, which do prove enrichment end-to-end.

## 10. Risks and gotchas

| Risk | Handling |
|---|---|
| Duplicate `meta` objects | Keep the `meta` key name (§3.4). Never rename it. |
| Counter greps silently stop | §7.3 — update in the same commit; add the test in §9.5. |
| `clientTs` sentinel breaks | Keep `clientTs` on `join`; `Lobby.fireSettled` matches `msg.clientTs === joinSentinelTs` exactly. |
| `msgId` dedup breaks | Decoder restores `meta.msgId` on new builds (`src/table.ts:418`); old builds lose it after §7.1 — §6, accepted. |
| Auto-leave suppression breaks | Decoder must restore `meta.origin`; `MessageDeduplicator` compares `origin === "internal"`. |
| Non-ASCII sizes | Budget in UTF-8 bytes, not characters: `"주벼리-o3dp9"` is 9 characters but 15 bytes. |
| `ua` table drift | Unknown pairs / single halves / Tauri pass through as literals; the decoder accepts any non-code value (§3.3). |
| Old publishers keep sending long keys | Pass-through decode, permanent (§6) — free, one code path, no shape branch. |
| **Old subscribers drop compact frames** | **Accepted, not fixed (§6):** image rebuild refreshes `docker/html` statics; already-open tabs need a reload; pinned npm consumers need a version bump. Publisher-side compat was costed and rejected (100% of the saving). |
| **Old readers lose compact `meta` (incl. table channels)** | Same table, third row (§6): `injectMetaString` rewrites `meta` for every publisher; new builds restore every name inside `decodeWire`. |
| Compacted key inside opaque payload | Impossible: tables apply top-level + `meta` + `seek` only (constraint 4); nothing inside `options`/`custom`/`data` is touched. |
| Positional `meta` order drifts (if §11.1 adopted) | Single producer (`createMeta`), positions pinned by the §9.2 golden fixture; `decodeWire` expands `[…]` back to named fields before any consumer runs. |
| Publish echo removed (§7.7) breaks a response-body reader | Audited: `NchanClient.publish` is `response.ok`-only, no publish-response `.json()`/`.text()` read exists in `src/`, `test/`, or `playwright/`; only `docker/testnchan.sh:101,106,111` read it — replaced by the §9.7 empty-body assertion. |
| 2-char literal collides with a `ua` code | Theoretical only: only a both-halves-`Unknown` raw-UA fallback can be two characters (`"ms"`), and real UA headers are tens of bytes (§3.3). |
| `recordedMessages` growth | `_recordedMessages` is an unbounded array today; keep recording raw and decode lazily rather than adding per-message re-serialisation. |

## 11. Discussion and deferred options

### 11.1 `meta` as a positional array — recommended

With `meta.ts` present, for sample 1 / sample 2:

| Variant | Sample 1 | Sample 2 | Requires |
|---|---|---|---|
| Compact (this spec) | 160 B | 211 B | — |
| **+ `meta` as positional array** | **132 B** | **183 B** | `injectMetaString` accepts `[…]` (§7.4b); order part of the contract |
| + drop `clientTs` on heartbeats | 142 B | 193 B | `meta.ts` covers timing; sentinel stays on `join` |
| + statics only on `join` (`n`, `city`, `version`) | 100 B | 147 B | merge-on-heartbeat in `applyPresence`, longer presence retention or a roster snapshot for late joiners |
| Event-driven presence (no periodic heartbeat) | — | — | Presence drops to joins/leaves/state changes; `/internal/presence/unsub` already publishes a synthetic leave, so `nchan_websocket_ping_interval` covers liveness |

Discussion — wire form `"meta":[ts, msgId, ua, origin, country, city, version]`, exactly **−28 B (−17.5%)**: seven `"x":` keys plus their separators disappear on both samples (160→132, 211→183, reproduced byte-exact):

- **Why it fits the constraints right now:** back-compat with old readers is already conceded and fully documented (§6), and this adds ~0 extra cost to that concession — an old reader sees `meta.* === undefined` either way (key rename vs array). Meanwhile `decodeWire` expands the array back to the named `META` object, so **framework consumers still change nothing**.
- **Server work stays "minimal meta injection changes":** one delimiter branch in `injectMetaString` (§7.4b — accept `[`/`]` where it accepts `{`/`}`). Crucially, the *client's outgoing* `meta` can stay a named object (`{"version": …}`) because the server replaces the whole field anyway — so `extractClientVersion` (§7.2) needs nothing positional, and `NchanClient.publish` needs no change either.
- **Costs:** raw frames in logs/`recordedMessages` (pre-decode) stop being self-describing, and position becomes part of the contract. Mitigate with the §9.2 golden fixture and one constant array in `src/wire.ts`; a single producer (`createMeta`) owns the order.
- **Independence:** nothing in §3–§9 depends on it, so it can ship as its own phase (1b) or be dropped with zero rework — the choice is about log readability, not about risk or migration cost.

### 11.2 Still deferred

The remaining rows above (dropping `clientTs` on heartbeats, statics-only-on-join, event-driven presence) are behavioural changes — timing semantics, roster retention — not encoding changes, and stay out of this work.

## 12. Measurement method

```
bytes  = Buffer.byteLength(JSON.stringify(message), "utf8")
egress = 1440 × N × (N − 1) × bytes per day   (N = concurrent presence subscribers, currently ≈12)
```

The per-field tables in §4 sum exactly to the measured totals (82 B and 97 B), so any future change can be diffed against them.

**Units:** the `MB/day` figures divide by 1048576 (i.e. MiB — 46.2/30.4/58.7/40.1 would be MB). They are only comparable to §1's "30.6 MB/day" if the dashboard that produced 521 MB reports the same unit — worth one check when the doc is first used.
