# Design Specification: Sagu Player Handicap Sharing

This document proposes and evaluates several designs to share player handicaps between both parties during the matchmaking/challenge phase of the `sagu` rule type. The design focuses on simplicity, lightweight payload, and ease of maintenance, without requiring schema migrations or heavy modifications to the messaging library.

---

## 1. Context & Objectives

In the `sagu` rule type, matches are typically played with players having different target scores (handicaps) representing their skill level. To start a balanced match:
1. Both players must know each other's handicap before the game begins.
2. The challenger must supply their handicap in the initial `offer` message.
3. The recipient must supply their handicap in the `accept` message.
4. Each player's handicap value is retrieved from their local client storage (`localStorage`).
5. Once accepted, both handicaps must be propagated to the launched game room (passed via the final redirect URL).

---

## 2. Design Options Analysis

Since the messaging library already provides an `options` record (`Record<string, string>`) inside the `ChallengeMessage`, we can piggyback on this field to communicate handicap data. Below are four design options for formatting this data.

### Option 1: Serialized JSON Array inside `options` (The proposed array format)
This option uses a single key in the `options` record containing a serialized JSON array representing the player handicaps associated with their `userId`.

#### Format:
```json
{
  "options": {
    "raceTo": "20",
    "handicaps": "[{\"id\":\"alice-123\",\"handicap\":10}]"
  }
}
```

#### Message Flow:
1. **Initial Offer (Challenger Alice sends to Bob):**
   - Alice retrieves her handicap (e.g., `10`) from `localStorage.getItem('handicap')`.
   - Alice publishes the offer with:
     ```json
     "options": {
       "raceTo": "20",
       "handicaps": "[{\"id\":\"alice-123\",\"handicap\":10}]"
     }
     ```
2. **Acceptance (Recipient Bob accepts Alice's offer):**
   - Bob retrieves his handicap (e.g., `12`) from his `localStorage.getItem('handicap')`.
   - Bob parses the existing `options.handicaps` array from the received offer message.
   - Bob appends his entry `{"id": "bob-456", "handicap": 12}` to the array.
   - Bob publishes the acceptance with the updated `options.handicaps` serialized string:
     ```json
     "options": {
       "raceTo": "20",
       "handicaps": "[{\"id\":\"alice-123\",\"handicap\":10},{\"id\":\"bob-456\",\"handicap\":12}]"
     }
     ```

#### Evaluation:
* **Pros:**
  * Highly extensible. If more players join (e.g., in a multi-player lobby or spectator scenario), they can simply be appended to the list.
  * Explicitly maps a player's `userId` to their handicap value.
* **Cons:**
  * Requires JSON parsing (`JSON.parse`) and stringifying (`JSON.stringify`) inside the message handlers.
  * Adds minor payload overhead due to JSON escape sequences in string-encoded JSON.

---

### Option 2: Role-based Keys inside `options` (Highly Piggybacked & Recommended)
Since the `ChallengeMessage` structure already identifies who is the `challenger` and who is the `challengee` at top-level fields (`challengerId` and `challengeeId`), we can use explicit role-based keys inside the flat `options` map without any nested arrays.

#### Format:
```json
{
  "options": {
    "raceTo": "20",
    "challengerHandicap": "10",
    "challengeeHandicap": "12"
  }
}
```

#### Message Flow:
1. **Initial Offer (Alice):**
   - Alice reads `localStorage.getItem('handicap')` (e.g., `10`).
   - Alice sends:
     ```json
     "options": {
       "raceTo": "20",
       "challengerHandicap": "10"
     }
     ```
2. **Acceptance (Bob):**
   - Bob reads his handicap (e.g., `12`).
   - Bob copies Alice's options and sets `challengeeHandicap` to his own value.
   - Bob sends:
     ```json
     "options": {
       "raceTo": "20",
       "challengerHandicap": "10",
       "challengeeHandicap": "12"
     }
     ```

#### Evaluation:
* **Pros:**
  * **Extremely lightweight & clean**: No JSON string nesting or string escape sequences.
  * **No deserialization overhead**: Options can be directly queried and mapped.
  * **Self-documenting**: Looking at the flat options map, it is immediately clear who has which handicap based on the challenger/challengee roles.
  * Keeps the payload tiny and highly maintainable.
* **Cons:**
  * Less generic than direct ID-based keys if the game rules allow 3+ players, but perfectly suited for 2-player matches like Sagu.

---

### Option 3: Dynamic User ID Keys inside `options`
In this variation of Option 2, instead of role-based keys, we use user-specific keys directly in the `options` map to pair each value directly with a player's identifier.

#### Format:
```json
{
  "options": {
    "raceTo": "20",
    "handicap_alice-123": "10",
    "handicap_bob-456": "12"
  }
}
```

#### Message Flow:
1. **Initial Offer (Alice):**
   - Alice sends:
     ```json
     "options": {
       "raceTo": "20",
       "handicap_alice-123": "10"
     }
     ```
2. **Acceptance (Bob):**
   - Bob sends:
     ```json
     "options": {
       "raceTo": "20",
       "handicap_alice-123": "10",
       "handicap_bob-456": "12"
     }
     ```

#### Evaluation:
* **Pros:**
  * Avoids JSON parsing.
  * Directly pairs with the `userId` in a flat structure.
* **Cons:**
  * Requires dynamic key parsing (e.g., searching for keys starting with `handicap_` in the options object) to extract the player handicaps.

---

### Option 4: Explicit Schema Expansion (Dedicated top-level field)
Add a dedicated `handicaps` optional dictionary to the `ChallengeMessage` TypeScript interface.

#### Format:
```typescript
interface ChallengeMessage {
  // ... existing fields ...
  handicaps?: Record<string, string>; // e.g. { "alice-123": "10", "bob-456": "12" }
}
```

#### Evaluation:
* **Pros:**
  * Strongly typed at compile-time.
  * Cleaner structure compared to string-serialized option fields.
* **Cons:**
  * Requires modifying core library types in `src/types.ts`.
  * Breakages or updates needed across other game modules if they validate message payloads strictly.
  * More complex to roll out than piggybacking.

---

## 3. Recommended Design: Option 2 (Role-Based Flat Keys)

We recommend **Option 2 (Role-based keys inside `options`)** for its unmatched simplicity, lack of parsing overhead, and compatibility with the existing messaging structure. However, if strict dynamic mapping to user IDs is required by the game engine, **Option 3 (Dynamic User ID Keys)** or **Option 1 (JSON-serialized Array)** are robust alternatives.

### End-to-End Implementation Blueprint for Option 2

This blueprint details how the client components would load and exchange this data.

### A. Local Storage Retrieval
Each client maintains their Sagu handicap in the local store:
```javascript
// Default Sagu handicap is 15 points if not configured
const defaultHandicap = "15";
const myHandicap = localStorage.getItem("handicap") || defaultHandicap;
```

### B. Offer Phase (Challenger)
When the challenger selects Sagu and initiates a challenge via `Lobby.challenge(userId, ruleType, options)`:

1. **Lobby UI Extraction:**
   The `ChallengeModal` (or `OnlinePanel` when triggering a challenge) retrieves the local user's handicap:
   ```javascript
   const myHandicap = localStorage.getItem("handicap") || "15";
   ```
2. **Options Merging:**
   The handicap is injected into the challenge options payload:
   ```javascript
   const challengeOptions = {
       ...selectedRuleOptions, // e.g. { raceTo: "20" }
       challengerHandicap: myHandicap
   };

   // Send challenge
   await lobby.challenge(recipientId, "sagu", challengeOptions);
   ```

### C. Accept Phase (Recipient)
When the recipient views the incoming challenge banner and clicks "Accept":

1. **Lobby UI Extraction:**
   The recipient retrieves their own handicap:
   ```javascript
   const myHandicap = localStorage.getItem("handicap") || "15";
   ```
2. **Options Appending:**
   The recipient appends their handicap to the incoming offer's options map and calls `Lobby.acceptChallenge(...)`:
   ```javascript
   const incomingOptions = incomingChallenge.options || {};
   const updatedOptions = {
       ...incomingOptions,
       challengeeHandicap: myHandicap
   };

   await lobby.acceptChallenge(
       incomingChallenge.challengerId,
       incomingChallenge.ruleType,
       incomingChallenge.tableId,
       updatedOptions,
       incomingChallenge.challengerName
   );
   ```

### D. Game Launcher URL Assembly (`utils.js`)
When matchmaking resolves and `OnlinePanel` redirects the user to the active Sagu game, the options are automatically appended to the game URL:

```javascript
// In utils.js / gameUrl utility:
export const gameUrl = ({ tableId, userId, userName, ruleType, isFirst, options, bot, lod, flip }) => {
    let url = `${BASE}?websocketserver=${WS_SERVER}`
        + `&userName=${encodeURIComponent(userName)}&userId=${userId}&ruletype=${ruleType}`;
    if (!bot) url += `&tableId=${tableId}`;
    if (isFirst) url += '&first=true';
    if (bot) url += `&bot=${encodeURIComponent(bot)}`;
    if (lod !== undefined) url += `&lod=${lod}`;
    if (flip) url += '&flip=true';
    return appendOptions(url, options); // Appends &raceTo=20&challengerHandicap=10&challengeeHandicap=12
};
```

This guarantees that the game engine loading at the destination URL has immediate access to both players' handicaps directly from its query parameters:
* `challengerHandicap`: Handicap score of the challenger.
* `challengeeHandicap`: Handicap score of the recipient.

---

## 4. Alternative Implementation Blueprint: Option 1 (JSON Array Format)

For scenarios where the game engine specifically demands the array format `handicaps: [{id: xyz, handicap: 10}]`, here is the corresponding implementation.

### A. Offer Phase
```javascript
const myId = userStore.clientId;
const myHandicap = parseInt(localStorage.getItem("handicap") || "15", 10);

const challengeOptions = {
    ...selectedRuleOptions,
    handicaps: JSON.stringify([{ id: myId, handicap: myHandicap }])
};

await lobby.challenge(recipientId, "sagu", challengeOptions);
```

### B. Accept Phase
```javascript
const myId = userStore.clientId;
const myHandicap = parseInt(localStorage.getItem("handicap") || "15", 10);

let handicapsList = [];
if (incomingChallenge.options && incomingChallenge.options.handicaps) {
    try {
        handicapsList = JSON.parse(incomingChallenge.options.handicaps);
    } catch (e) {
        console.error("Failed to parse challenger handicaps:", e);
    }
}

// Append current player's entry
handicapsList.push({ id: myId, handicap: myHandicap });

const updatedOptions = {
    ...(incomingChallenge.options || {}),
    handicaps: JSON.stringify(handicapsList)
};

await lobby.acceptChallenge(
    incomingChallenge.challengerId,
    incomingChallenge.ruleType,
    incomingChallenge.tableId,
    updatedOptions,
    incomingChallenge.challengerName
);
```

### C. Game Engine Integration
The game engine can read the query parameter `handicaps`, parse it, and associate each handicap directly with the corresponding participant's `userId`.
```javascript
const params = new URLSearchParams(window.location.search);
const handicapsStr = params.get("handicaps");
let handicaps = [];
if (handicapsStr) {
    try {
        handicaps = JSON.parse(handicapsStr);
    } catch(e) {
         console.error(e);
    }
}
// Retrieve: handicaps.find(h => h.id === userId)?.handicap
```
This is fully functional, highly descriptive, and maintains dynamic player mapping inside a standard flat query/options dictionary.
