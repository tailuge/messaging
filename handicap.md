# Design Specification: Sagu Player Handicap Sharing

This document describes the design to share player handicaps between both parties during the matchmaking/challenge phase of rules with `handicap: true` (currently Sagu, planned for Three Cushion). The design piggybacks on the existing flat `options` record (`Record<string, string>`) inside `ChallengeMessage` — using per-user keys like `handicap_${userId}`. No JSON encoding, no schema changes.

---

## Progress Summary

| Phase | Description | Status |
|-------|-------------|--------|
| A     | Local storage (ChallengeModal slider persistence) | ✅ Done |
| B     | Offer Phase — challenger translates `handicap` → `handicap_${myId}` | ✅ Done |
| C     | Accept Phase — recipient merges their handicap into options | ✅ Done |
| D     | Game engine integration — parse `handicap_*` from URL params | 🔲 TODO (game project) |
| E     | URL assembly (`appendOptions`) — no changes needed | ✅ Done (already works) |
| F     | Banner display — relabel `handicap_*` keys nicely | ✅ Done |

All library/client-side changes (A/B/C/F) are complete and tested. Only the game engine (Section D) remains.

---

## 1. Context & Objectives

In handicap-enabled rules, players may have different target scores representing their skill level. To start a balanced match:
1. Both players must know each other's handicap before the game begins.
2. The challenger must supply their handicap in the initial `offer` message.
3. The recipient must supply their handicap in the `accept` message.
4. Each player's handicap value is set via the slider in `ChallengeModal` and persisted to `localStorage` with key `handicap_${sectionKey}` (e.g. `handicap_sagu`, `handicap_threecushion`).
5. Once accepted, both handicaps must be propagated to the launched game room (passed via the final redirect URL).

---

## 2. Design: Flat `handicap_${userId}` Keys

Each player adds a key `handicap_${userId}` to the flat `options` record.

### Format

```json
{
  "options": {
    "raceTo": "20",
    "handicap_alice-123": "10",
    "handicap_bob-456": "12"
  }
}
```

No nesting, no JSON string encoding, no escaping. Every value is a plain string.

### Message Flow

1. **Initial Offer (Challenger Alice sends to Bob):**
   - Alice's handicap is loaded from `localStorage.getItem('handicap_sagu')` (default `15` if unset).
   - Alice publishes the offer with her handicap key:

   ```json
   "options": {
     "raceTo": "20",
     "handicap_alice-123": "10"
   }
   ```

2. **Acceptance (Recipient Bob accepts Alice's offer):**
   - Bob's handicap is loaded from `localStorage.getItem('handicap_sagu')`.
   - Bob copies the incoming options and adds his own handicap key:

   ```json
   "options": {
     "raceTo": "20",
     "handicap_alice-123": "10",
     "handicap_bob-456": "12"
   }
   ```

### Evaluation

* **Pros:**
  * Zero serialization overhead — no `JSON.stringify` or `JSON.parse`.
  * Works natively with `Record<string, string>`.
  * Clean URL params: `&handicap_alice-123=10&handicap_bob-456=12`.
  * Banner display just works: "handicap_alice-123: 10".
  * `appendOptions` needs no changes.
  * Self-documenting — the key tells you whose handicap it is.
* **Cons:**
  * Pollutes the options namespace with per-user keys. Game engine must filter keys starting with `handicap_`.

---

## 3. Implementation Plan

### A. Local Storage ✅

The `ChallengeModal` in `src/client/challenge-modal.js` persists handicaps per section:

```javascript
// Loading (in _loadHandicap):
const stored = localStorage.getItem(`handicap_${key}`);  // e.g. handicap_sagu

// Saving (in _onHandicapChange):
localStorage.setItem(`handicap_${this._expanded}`, String(val));
```

### B. Offer Phase (Challenger) ✅

Implemented in `src/client/online-panel.js` — the `@confirm` handler on `<challenge-modal>` translates the flat `handicap` key to a per-user key:

```javascript
@confirm=${e => {
    const opts = { ...e.detail.options };
    if (opts.handicap) {
        opts['handicap_' + this.#myId] = opts.handicap;
        delete opts.handicap;
    }
    this.#challenge(p.userId, e.detail.ruleType, opts);
    this.#pendingChallenge = null;
}}
```

### C. Accept Phase (Recipient) ✅

Implemented in `src/client/online-panel.js` — `#acceptChallenge()` loads the recipient's handicap from localStorage and merges it:

```javascript
const opts = { ...c.options };
if (Object.keys(opts).some(k => k.startsWith('handicap_'))) {
    const myHandicap = localStorage.getItem(`handicap_${c.ruleType}`) || '15';
    opts['handicap_' + this.#myId] = myHandicap;
}
// opts now contains both handicap_alice-123 and handicap_bob-456
```

The merged options flow through both `lobby.acceptChallenge()` and the `CHALLENGE_MSG` dispatch (which builds the game URL).

### D. Game Engine Integration 🔲

**This is the only remaining phase — to be implemented in the game project (e.g. billiards game).**

The library now produces URLs with both players' handicaps as query params.

#### Example URL

After Alice (handicap 18) challenges Bob (handicap 18) to Sagu and Bob accepts, the game engine receives:

```
http://localhost:8080/?websocketserver=ws://localhost:80&userName=Bob&userId=Bob-w4069&ruletype=sagu&tableId=6fc21c55&lod=4&handicap_Alice-w4069=18&handicap_Bob-w4069=18
```

#### Game Engine Code

The game engine must parse `handicap_*` keys from query params to build a per-user handicap map:

```javascript
const params = new URLSearchParams(window.location.search);
const handicaps = {};
for (const [k, v] of params) {
    if (k.startsWith('handicap_')) {
        handicaps[k.replace('handicap_', '')] = v;
    }
}
// handicaps = { "Alice-w4069": "18", "Bob-w4069": "18" }
// My handicap: handicaps[myUserId]    → "18"
// Opponent's handicap: handicaps[opponentUserId]
```

**Key points for game engine integration:**
- Filter all query params starting with `handicap_` — the userId suffix is the handicap owner.
- Values are always strings representing integers.
- A player finds their own handicap via `handicaps[myUserId]`.
- Only handicap-enabled rules (Sagu, future Three Cushion) will produce these params; the game engine can check `ruletype` to decide whether to use them.
- For non-handicap rules, no `handicap_*` params will be present.

### E. URL Assembly — No Changes Needed ✅

The existing `appendOptions` in `src/client/utils.js` already handles this correctly:

```javascript
const appendOptions = (url, options) => options
    ? Object.entries(options).reduce((u, [k, v]) => u + `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`, url)
    : url;
```

With `options = { raceTo: "20", handicap_alice-123: "18", handicap_bob-456: "18" }`, this produces:
```
&raceTo=20&handicap_alice-123=18&handicap_bob-456=18
```

### F. Banner Display ✅

Implemented in `src/client/challenge-banner.js`:
- `formatOptions` accepts `myId` and relabels `handicap_*` keys.
- If the embedded userId matches `myId` → **"Your handicap: 18"**
- Otherwise → **"Handicap: 18"**
- The incoming banner also merges the recipient's handicap from localStorage for display.
