# `/api/summary` — migration spec

Reimplement on the messaging stack: `../messaging/docker/api.njs` (njs in nginx),
reading the **same Upstash KV** the scoreboard uses. Replaces
`src/pages/api/summary.ts` on Vercel. CORS is handled by the messaging nginx
config, not by this handler.

## Contract

`GET /api/summary?limitElo=<n>&limitMatches=<n>`

- `limitElo` default `10`, `limitMatches` default `32`.
- No auth.
- `200`:

```jsonc
{
  "hiscores":      { "<ruleType>": [ { "name": "P1", "likes": 3, "id": "abc", "score": 52 } ] },
  "topPlayers":    { "<ruleType>": [ { "name": "P1", "rating": 162, "rd": 31,
                                       "conservativeRating": 100, "gamesPlayed": 12,
                                       "wins": 8, "losses": 4 } ] },
  "recentMatches": [ { "id": "m_xxx", "winner": "P1", "loser": "P2", "winnerScore": 9,
                       "loserScore": 3, "ruleType": "nineball", "timestamp": 1759425566000,
                       "hasReplay": true, "locationCountry": "GB", "locationCity": "London" } ]
}
```

`ruleType` keys (all five always present): `snooker`, `nineball`, `threecushion`,
`eightball`, `sagu`.

## Reads — same KV, same keys

| output | command, per rule type | parse |
|---|---|---|
| `hiscores` | `ZRANGE hiscore<ruleType> 0 9` | member is JSON `ScoreData`; reverse the array |
| `topPlayers` | `HGETALL elo:<ruleType>` | flat `[field, value, …]` → object; value is JSON `PlayerRating` |
| `recentMatches` | `ZREVRANGE match_results 0 <limitMatches-1>` | member is JSON `MatchResult`, already newest-first |

Post-process to exactly the shapes above:

- **hiscores** → `{ name, likes: likes ?? 0, id, score: Math.floor(score) }`, highest
  score first.
- **topPlayers** → decay, rank (below), then `slice(0, limitElo)`.
- **recentMatches** → returned as read (the `ZREVRANGE` bound already applies
  `limitMatches`).

All KV values are JSON strings (the scoreboard writes them through `@vercel/kv`,
which encodes). `api.njs`'s `redis()` returns the raw Upstash `result`, so every
value must be `JSON.parse`d. `HGETALL` comes back as a flat `[field, value, …]`
array — reuse the existing `scoresFromHgetall` pattern to fold it into an object.

## Leaderboard ranking (must match the scoreboard)

`conservativeRating` is computed from a decayed `rd`:

```js
const daysInactive = (Date.now() - p.lastUpdated) / 86_400_000
const rd = Math.min(Math.sqrt(p.rd ** 2 + 50 ** 2 * daysInactive), 350)
const conservativeRating = Math.round(p.rating - 2 * rd)   // rating/rd rounded for display only
```

Sort descending by `conservativeRating`, then `slice(0, limitElo)`. `gamesPlayed`,
`wins`, `losses` are taken straight from the stored `PlayerRating`.

## Caching — njs shared dict

Only `topPlayers` scales with the player base: it reads **every player in every
rule type** and ranks them in JS. Cache just that.

- Add one zone beside the existing ones in `nginx.conf`:

  ```nginx
  js_shared_dict_zone zone=summary_cache:1M type=string timeout=1h;
  ```

- Key `topPlayers:<limitElo>` (per-`limitElo` so `?limitElo=5` and `?limitElo=10`
  don't collide), value `JSON.stringify(result)`, stored with a 3600s timeout.
- On hit, `JSON.parse(ngx.shared.summary_cache.get(key))` and skip all five
  `HGETALL`s.

The shared dict is shared across the nginx workers and persists between requests,
so unlike the scoreboard's per-isolate `Map` this actually hits at low traffic.
`hiscores` and `recentMatches` stay uncached so the lobby still sees new scores
and matches immediately.

## Wiring

One branch in `router(r)`:

```js
if (r.uri === '/api/summary' && r.method === 'GET') return await summary(r);
```

Read params from `r.args`, run the three reads concurrently, return
`json(r, 200, { hiscores, topPlayers, recentMatches })`.

`redis()` is one command per call, so add a tiny pipeline helper for the grouped
reads — otherwise a single summary request is ~11 Upstash round trips:

```js
// POST `${UPSTASH_REDIS_REST_URL}/pipeline` with body=[ [cmd, ...args], ... ]
// returns results in order
```

That makes it **hiscores = 1 pipeline of 5 `ZRANGE`**, **topPlayers = 1 pipeline of
5 `HGETALL`** (cache miss only), **recentMatches = 1 `ZREVRANGE`** — 2 fetches
warm, 3 cold.

## Intentionally dropped from the Vercel route

- **CORS** — owned by the messaging nginx config.
- **`zincrby lobbyUsage`** — the detached write was redundant; messaging already
  exposes `PUT /api/usage/<metric>`.
- **`Cache-Control: s-maxage=120`** — caching moves to the shared dict above.
- **`[summary-timing]` logs** and the `usageMs`/`timed()` wrapper.
