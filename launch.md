# Game Launch Parameters

The game URL is constructed in `docker/html/lobby.html` using the `gameUrl` helper function. It redirects users to the external game client with the following query parameters:

| Parameter | Description |
|-----------|-------------|
| `websocketserver` | The Nchan WebSocket endpoint (e.g., `wss://billiards.onrender.com/ws`). |
| `tableId` | Unique identifier for the game table/room. |
| `userName` | The user's display name (URL-encoded). |
| `clientId` | The user's unique ID. |
| `ruletype` | The game rule type (e.g., `eightball`, `nineball`, `snooker`). |
| `spectator` | `true` if the user is joining as a spectator. |
| `first` | `true` if the user is the first player (initiator of the challenge). |
| *Dynamic Options* | Any game-specific configuration passed in the `options` object (e.g., `raceTo`, `reds`). |

## Example URL Construction

```javascript
const gameUrl = ({ tableId, userId, userName, ruleType, spectating, isFirst, options }) => {
    let url = `https://billiards.tailuge.workers.dev/?websocketserver=wss://billiards.onrender.com/ws`
        + `&tableId=${tableId}&userName=${encodeURIComponent(userName)}&clientId=${userId}&ruletype=${ruleType}`;
    if (spectating) url += '&spectator=true';
    else if (isFirst) url += '&first=true';
    if (options) Object.entries(options).forEach(([k, v]) => url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return url;
};
```

## Option Passing Flow

1. **Challenge Offer**: The challenger selects a game and options in `ChallengeModal`. These are sent in a `challenge` message with `type: "offer"`.
2. **Challenge Acceptance**: The recipient receives the offer and its options. When they click "Accept", the options are passed back in the `challenge` message with `type: "accept"`.
3. **Game Redirect**: Both players' lobby state is updated with the `currentMatch` including the `options`. The `LobbyApp` detects the `tableId` and redirects to the `gameUrl`.
