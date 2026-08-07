# Customisation Plan: Extensible `custom` Dictionary (Zero-Code-Extension Design)

This document outlines an extensible design for passing custom settings (e.g. `custom.cue`, `custom.skin`, etc.) for both the player and opponent to the game launch URL.

**Key principle: adding a new `custom.whatever` field should require NO transport/URL code changes — only the settings UI needs a new control.**

---

## 1. Concrete Goal & Requirements

- **Initial Field**: `custom.cue` (numeric value `0` or `1`, default `0`).
- **Generic Transport**: A `custom` dictionary (`Record<string, string | number>`) on challenge offer/accept messages — any key-value pair flows through automatically. Defined on both `PresenceMessage` and `ChallengeMessage` types for future use, but only populated on challenge messages.
- **URL Parameter Output**:
  - Local player: `&custom.cue=0&custom.skin=red` (all keys flattened from the `custom` dict)
  - Opponent: `&opponent.userId=...&opponent.userName=...&opponent.custom.cue=1&opponent.custom.skin=blue`
  - Standard player identifiers: `&userId=...&userName=...`
- **Settings UI**: A toggle in `SettingsModal` for Cue (`0` or `1`). New fields only need a new UI control — no other code.

---

## 2. Data Structure & Serialization

- **In State & Messages**: A `custom` dictionary — `{ cue: 0, skin: 'red' }` — stored as a field on `ChallengeMessage` (also added to `PresenceMessage` for future extensibility, but not populated on presence messages).
- **Query String Mapping** (generic, key-iteration based):
  - `custom: { cue: 0, skin: 'red' }` → `&custom.cue=0&custom.skin=red`
  - Opponent's `custom: { cue: 1 }` → `&opponent.custom.cue=1`
- **No hardcoded field names anywhere in the transport/URL layer.**

---

## 3. Implementation Steps

### Step 1: Type Definitions (`src/types.ts`)
- Add `custom?: Record<string, string | number>` to `PresenceMessage`.
- Add `custom?: Record<string, string | number>` to `ChallengeMessage`.

### Step 2: `UserStore` — Generic Custom Persistence (`src/client/user-store.js`)
- Add public `custom` property, loaded on init from `localStorage.getItem('custom')` (JSON.parse, default `{}`).
- Add `getCustom()` → returns the full custom object (shallow copy).
- Add `setCustom(key, value)` → sets the key, JSON.stringify → localStorage, dispatches `change` event.
- When `isVercel` is true, also clear `localStorage.removeItem('custom')` along with the existing `userId`/`userName` clears.
- **No per-field getters/setters.** Adding a new custom field = calling `userStore.setCustom('newField', val)` from anywhere.

> **Note:** `custom` is NOT included on presence messages (join/heartbeat/leave). It is only sent on challenge offer/accept messages, since it's only needed when a game starts.

### Step 3: URL Generator — Generic Flattening (`src/client/utils.js`)
- Update `gameUrl()` to accept optional `custom` (Record) and `opponent` ({ userId, userName, custom }) params.
  - Iterates over `custom` keys → appends `&custom.key=value`.
  - If `opponent.userId` is present: append `&opponent.userId=...&opponent.userName=...`.
  - Iterates over `opponent.custom` keys → appends `&opponent.custom.key=value`.
- Update `INITIAL_STATE` comment to reflect new `currentMatch` shape: `{ tableId, ruleType, options, isFirst, opponentId, opponentName, opponentCustom }`.
- **No hardcoded field names in the URL builder.** Any key in the dict becomes a query param.

### Step 4: Online Panel — Challenge Messages & URLs (`src/client/online-panel.js`)
- On `#challenge(...)`: include `custom: userStore.getCustom()` in the `lobby.challenge()` call.
- On `#acceptChallenge(...)`: include `custom: userStore.getCustom()` in the `lobby.acceptChallenge()` call and in the synthetic `CHALLENGE_MSG` dispatch payload (so `m.custom` is available to the challenger in reduce).
- **Bot path**: In `#challenge()`, the bot branch calls `gameUrl()` directly — must also pass `custom: userStore.getCustom()`.
- On game launch (redirect in `render()`): pass `userStore.getCustom()` as `custom` to `gameUrl()`. Read opponent info from `currentMatch.opponentId` / `opponentName` / `opponentCustom`.
- Add `#opponentId`, `#opponentName`, `#opponentCustom` accessors reading from `this.#state.currentMatch`.

> **Note:** `custom` is NOT included in presence join/heartbeat messages or in the `CHALLENGE_SENT` dispatch payload. It only flows through challenge offer/accept messages.

### Step 5: Challenge Flow — How Opponent Custom Reaches Each Player

This is the critical piece. Here's how custom data travels through the challenge handshake:

**Data carried on messages:**
- The `offer` ChallengeMessage carries the **challenger's** `custom`.
- The `accept` ChallengeMessage carries the **accepter's** `custom`.

**In `utils.js` reduce, when an `accept` is processed, `currentMatch` gets three new fields:**
- `opponentId` — the other player's userId
- `opponentName` — the other player's userName
- `opponentCustom` — the other player's `custom` dict

Derivation depends on which side we're on:

| We are the... | Opponent is... | opponentCustom source |
|---|---|---|
| **Challenger** (our id === m.challengerId) | The accepter (m.challengeeId) | `m.custom` (from the accept message) |
| **Accepter** (our id === m.challengeeId) | The challenger (m.challengerId) | `pending.custom` (from the original offer stored in `C[id]`) |

```js
// Pseudocode in reduce (accept branch):
const weAreChallenger = action.myId === m.challengerId;
const opponentId = weAreChallenger ? m.challengeeId : m.challengerId;
const opponentCustom = weAreChallenger ? m.custom : (pending.custom || {});
// opponentName comes from challenge data, not users-list lookup:
const opponentName = weAreChallenger
    ? pending.recipientName       // CHALLENGE_SENT stores challengee's name as recipientName
    : pending.challengerName;     // incoming offer stores challenger's name

currentMatch: {
    tableId, ruleType, options, isFirst,
    opponentId, opponentName, opponentCustom,
}
```

**In `online-panel.js` render(), the game URL is built with:**
```js
const match = this.#state.currentMatch;
gameUrl({
    ...,
    custom: userStore.getCustom(),
    opponent: {
        userId: match.opponentId,
        userName: match.opponentName,
        custom: match.opponentCustom,
    }
});
```

**Also:**
- `lobby.challenge()` and `lobby.acceptChallenge()` both accept and pass a `custom` parameter through to `nchan.publishChallenge()` (see Step 6).
- The accepter's `pending.custom` comes from the incoming offer message (`{ ...m }` captures all fields including `custom`). No special handling needed.
- The challenger's `m.custom` comes from the accept message. The synthetic dispatch in `#acceptChallenge()` must include `custom`.

### Step 6: Lobby — Accept `custom` Parameter (`src/lobby.ts`)
- Add `custom?: Record<string, string | number>` parameter to `challenge()` and `acceptChallenge()`.
- Both methods pass `custom` through to their `nchan.publishChallenge()` call.

> **Note:** `hasMeaningfulChange()` does NOT need updating — `custom` is not on presence messages, so there's nothing to compare. `acceptChallenge()` does NOT pass `custom` to `updatePresence()`.

### Step 7: Settings UI (`src/client/settings-modal.js`)
- Add a cue toggle (`0` / `1`) bound to `userStore.getCustom().cue` / `userStore.setCustom('cue', val)`.
- Handle `undefined` gracefully: `(userStore.getCustom().cue ?? '0')` as the default.
- **Future fields:** just add another control calling `userStore.setCustom('newField', val)`. No other files touched.

---

## 4. Target URL Example

```
https://game-url.example.com/?websocketserver=...&userId=user-123&userName=Alice&custom.cue=0&opponent.userId=user-456&opponent.userName=Bob&opponent.custom.cue=1
```

---

## 5. Adding a New Custom Field (Illustrative)

To add e.g. `custom.skin`:
1. In `settings-modal.js`: add a new toggle/select calling `userStore.setCustom('skin', val)`.
2. **That's it.** The field automatically flows through challenge messages and the game URL as `&custom.skin=red` and `&opponent.custom.skin=blue`.

---

## 6. Verification

1. **Unit Test**: Verify presence/challenge messages convey `custom` dict correctly.
2. **URL Formatting Test**: Test `gameUrl()` with `custom: { cue: '0', extra: 'x' }` produces `&custom.cue=0&custom.extra=x`.
3. **Opponent URL Test**: Test `gameUrl()` with `opponent: { userId: 'b', userName: 'Bob', custom: { cue: '1' } }` produces `&opponent.custom.cue=1`.
