# Design Specification: Sagu Player Handicap Sharing

This document describes the design to share player handicaps between both parties during the matchmaking/challenge phase of rules with `handicap: true` (currently Sagu, planned for Three Cushion). The design piggybacks on the existing flat `options` record (`Record<string, string>`) inside `ChallengeMessage` — using per-user keys like `handicap_${userId}`. No JSON encoding, no schema changes.

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

### A. Local Storage (already implemented)

The `ChallengeModal` in `src/client/challenge-modal.js` already persists handicaps per section:

```javascript
// Loading (in _loadHandicap):
const stored = localStorage.getItem(`handicap_${key}`);  // e.g. handicap_sagu

// Saving (in _onHandicapChange):
localStorage.setItem(`handicap_${this._expanded}`, String(val));
```

### B. Offer Phase (Challenger)

When the challenger clicks a handicap rule button in `ChallengeModal`, the `confirm` event fires with `options` including `handicap: "15"` (the flat key used by the modal internally).

The challenge handler (in `online-panel.js`) must translate this to the per-user key:

```javascript
const myId = userStore.clientId;
const myHandicap = options.handicap;  // comes from ChallengeModal confirm event

const challengeOptions = {
    ...options,                         // e.g. { raceTo: "20" }
    ['handicap_' + myId]: myHandicap,  // add per-user key
};
delete challengeOptions.handicap;       // remove the generic key

await lobby.challenge(recipientId, ruleType, challengeOptions);
```

### C. Accept Phase (Recipient)

When the recipient clicks "Accept" on an incoming challenge banner:

```javascript
const myId = userStore.clientId;
const myHandicap = localStorage.getItem(`handicap_${ruleType}`) || "15";

const updatedOptions = {
    ...(incomingChallenge.options || {}),
    ['handicap_' + myId]: myHandicap,
};

await lobby.acceptChallenge(
    incomingChallenge.challengerId,
    incomingChallenge.ruleType,
    incomingChallenge.tableId,
    updatedOptions,
    incomingChallenge.challengerName
);
```

### D. Game Engine Integration

The game engine reads handicaps from query params by filtering keys starting with `handicap_`:

```javascript
const params = new URLSearchParams(window.location.search);
const handicaps = {};
for (const [k, v] of params) {
    if (k.startsWith('handicap_')) {
        handicaps[k.replace('handicap_', '')] = v;
    }
}
// handicaps = { "alice-123": "10", "bob-456": "12" }
// My handicap: handicaps[myUserId]
```

### E. URL Assembly — No Changes Needed

The existing `appendOptions` in `src/client/utils.js` already handles this correctly:

```javascript
const appendOptions = (url, options) => options
    ? Object.entries(options).reduce((u, [k, v]) => u + `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`, url)
    : url;
```

With `options = { raceTo: "20", handicap_alice-123: "10", handicap_bob-456: "12" }`, this produces:
```
&raceTo=20&handicap_alice-123=10&handicap_bob-456=12
```

### F. Future: `formatOptions` Banner Display

The `formatOptions` function in `src/client/challenge-banner.js` currently renders every option key as-is (e.g. "handicap_alice-123: 10"). For a nicer display, it could filter or relabel `handicap_*` keys in a future pass (out of scope for this plan).
