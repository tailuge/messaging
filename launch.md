# Game Launch Parameters

The game URL is constructed in `src/client/utils.js` using the `gameUrl` helper function (and `spectateUrl` for spectators). It redirects users to the external game client with the following query parameters:

| Parameter | Description |
|-----------|-------------|
| `websocketserver` | The Nchan WebSocket endpoint (e.g., `wss://billiards.onrender.com/`). |
| `tableId` | Unique identifier for the game table/room. |
| `userName` | The user's display name (URL-encoded). |
| `userId` | The user's unique ID. |
| `opponent.userId` | The opponent's unique ID (present on rematch/accept redirects). |
| `opponent.userName` | The opponent's display name, URL-encoded (present on rematch/accept redirects). |
| `ruletype` | The game rule type (e.g., `eightball`, `nineball`, `snooker`). |
| `spectator` | `true` if the user is joining as a spectator. |
| `first` | `true` if the user is the first player (initiator of the challenge). |
| *Dynamic Options* | Any game-specific configuration passed in the `options` object (e.g., `raceTo`, `reds`). |

## Example URL Construction

```javascript
const gameUrl = ({ tableId, userId, userName, ruleType, isFirst, options, bot, lod, flip, custom, opponent }) => {
    let url = `https://billiards.tailuge.workers.dev/?websocketserver=wss://billiards.onrender.com/`
        + `&userName=${encodeURIComponent(userName)}&userId=${userId}&ruletype=${ruleType}`;
    if (!bot) url += `&tableId=${tableId}`;
    if (isFirst) url += '&first=true';
    if (bot) url += `&bot=${encodeURIComponent(bot)}`;
    if (lod !== undefined) url += `&lod=${lod}`;
    if (flip) url += '&flip=true';
    if (options) Object.entries(options).forEach(([k, v]) => url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    if (custom) Object.entries(custom).forEach(([k, v]) => url += `&custom.${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    if (opponent?.userId) {
        url += `&opponent.userId=${encodeURIComponent(opponent.userId)}&opponent.userName=${encodeURIComponent(opponent.userName || '')}`;
        if (opponent.custom) Object.entries(opponent.custom).forEach(([k, v]) => url += `&opponent.custom.${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
    return url;
};
```

> **Note:** Only canonical parameter names are emitted. The game client also accepts legacy aliases (`name`/`playername` → `userName`, `clientId` → `userId`, `opponentId` → `opponent.userId`, `opponentName` → `opponent.userName`), but this project never sends them.

## Option Passing Flow

1. **Challenge Offer**: The challenger selects a game and options in `ChallengeModal`. These are sent in a `challenge` message with `type: "offer"`.
2. **Challenge Acceptance**: The recipient receives the offer and its options. When they click "Accept", the options are passed back in the `challenge` message with `type: "accept"`.
3. **Game Redirect**: Both players' lobby state is updated with the `currentMatch` including the `options`. The `LobbyApp` detects the `tableId` and redirects to the `gameUrl`.
