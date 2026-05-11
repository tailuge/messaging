# Rematch Feature Plan

## Overview

When a game ends, the game page redirects both players back to the lobby with a `?rematch=` URL param containing encoded match context. The lobby automatically re-challenges and re-accepts, sending both players back into a new game without any UI interaction.

## RematchInfo Interface

```typescript
interface RematchInfo {
  opponentId: string;
  opponentName: string;
  ruleType: string;
  lastScores: { userId: string; score: number; }[];
  nextTurnId: string;
  options?: Record<string, string>;
}
```

## Flow

Both players arrive at the lobby with `?rematch=<encodedRematchInfo>`. The flow is **symmetric** — each player runs the same logic regardless of who arrives first:

1. On connect, immediately send a challenge offer to `opponentId` with the full `RematchInfo` as the options payload
2. Simultaneously listen for an incoming offer from `opponentId`
3. Whichever offer arrives first at the other player triggers an auto-accept
4. Both players redirect to the game URL with the rematch data forwarded

There is no pre-assigned challenger/challengee role. The race resolves naturally: one offer wins, the other is ignored by the existing challenge flow.

The **challengee reads rematch data from the challenge message** (`msg.options`), not from their own URL param. This means the flow works even if the challengee's URL param is missing.

## Encapsulation: RematchCoordinator

All rematch logic lives in a single `RematchCoordinator` class in `online-panel.js`:

```js
class RematchCoordinator {
  constructor(rematchInfo) {
    this.info = rematchInfo;
  }

  get opponentId()   { return this.info.opponentId; }
  get ruleType()     { return this.info.ruleType; }
  get options()      { return this.info.options; }
  get rematchParam() { return encodeURIComponent(JSON.stringify(this.info)); }

  async sendChallenge(lobby) {
    return lobby.challenge(this.opponentId, this.ruleType, undefined, this.info);
  }

  shouldAutoAccept(msg) {
    return msg.type === 'offer' && msg.challengerId === this.opponentId;
  }
}
```

`OnlinePanel` holds `#rematch = null` (a `RematchCoordinator | null`). Call sites are single-line guards — no rematch logic leaks into the panel.

## Files Changed

### `online-panel.js`

**Constructor** — parse URL param:
```js
const raw = p.get('rematch');
this.#rematch = raw ? new RematchCoordinator(JSON.parse(decodeURIComponent(raw))) : null;
```

**`_connect()`** — auto-challenge after joining lobby:
```js
if (this.#rematch) await this.#rematch.sendChallenge(this.#lobby);
```

**`onChallenge` handler** — auto-accept incoming offer:
```js
if (this.#rematch?.shouldAutoAccept(msg)) {
  await this.#acceptChallenge(); // c.options carries the rematch data through
  return;
}
```

**`#challenge()` and `#acceptChallenge()`** — forward rematch param to game URL:
```js
rematch: this.#rematch?.rematchParam
```

### `utils.js`

Add `rematch` to `gameUrl`:
```js
if (rematch) url += `&rematch=${rematch}`;
```

## Playwright Tests

Two new tests in `lobby-flow.spec.ts`, following the existing pattern (mock publish endpoint, inject state via `_ctrl.dispatch`, assert without clicking).

**Test 1: challenger auto-challenges on connect**
- Load page with `?rematch=<encoded>` (opponentId: 'bob')
- Inject `CONNECTED` + `USERS_UPDATE` with Bob present
- Assert `_ctrl` state has a pending sent challenge for Bob — no button click

**Test 2: challengee auto-accepts incoming offer**
- Load page with `?rematch=<encoded>` (opponentId: 'alice')
- Inject `CONNECTED` + `USERS_UPDATE`
- Inject `CHALLENGE_MSG` offer from Alice with rematch data in `options`
- Assert redirect to game URL containing `tableId=` and `rematch=` — no button click

Both tests prove automation by the absence of any `click()` call.
