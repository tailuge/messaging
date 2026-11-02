# Registering a sagu HiScore directly from the challenge page

Status: design note only — no code changes yet.

Goal: `dist/challenge/` should register a sagu HiScore itself, with the player's
current username, instead of sending the player to
`https://scoreboard-tailuge.vercel.app/hiscore.html?...`. Everything the hiscore
page does for the upload has to happen on the challenge page.

## 1. What the hiscore page does today

Source: `../scoreboard/public/hiscore.html`. Its whole upload is these lines:

```js
const params = new URLSearchParams(globalThis.location.search)
const url = new URL("/api/hiscore", globalThis.location.origin)
const details = new URLSearchParams()
details.append("ruletype", params.get("ruletype"))
details.append("id", input.value) // the form's initials, maxlength=3
url.search = details.toString()
await postData(url, globalThis.location.search) // body = the page's own query string
globalThis.location.replace("/leaderboard")
```

with

```js
fetch(url, {
  method: "POST",
  mode: "cors",
  cache: "no-cache",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  redirect: "follow",
  referrerPolicy: "no-referrer",
  body: data,
})
```

So the contract the server sees is:

| Part           | Value                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| URL            | `https://scoreboard-tailuge.vercel.app/api/hiscore?ruletype=sagu&id=<username>`                                                            |
| Method         | `POST`                                                                                                                                     |
| `Content-Type` | `application/json` (although the body is a query string)                                                                                   |
| Body           | the raw query string, **leading `?` included**, exactly as it appeared on the hiscore page: `?ruletype=sagu&state=<encoded>&score=<n>&v=1` |
| Redirect       | none expected; the page ignores the response and goes to `/leaderboard` itself                                                             |

The four query parameters are the ones `LinkFormatter.getHiScoreUri()` produces
(`src/view/link-formatter.ts:19`):

- `ruletype` — `sagu`
- `state` — the compressed replay, already URL-encoded once by
  `ReplayEncoder.fullyEncodeURI(ReplayEncoder.crush(json))`
- `score` — the break/run score
- `v` — `1`

Because the hiscore page re-posts its own `location.search` verbatim, `state`
must **not** be encoded twice: build the body by string concatenation (or reuse
`getHiScoreUri()` and take its query substring), not by feeding an
already-encoded `state` into `URLSearchParams`.

## 2. What the challenge page does today

Files: `dist/challenge/index.html`, `dist/challenge/challenge.js` (there is no
TypeScript source for this page in this repo).

- `#play-sagu` loads `#sagu-frame` with
  `../index.html?ruletype=sagu&speedrun&practice&raceTo=32&cushionModel=…&init=…&initShot=…`
  (the `$s` constant). The score is therefore capped at 32, shown as `/ 32`.
- The game posts `speedrun-result` to its parent at the end of every run:
  - **fail** (`src/controller/playshot.ts`, the `if (speedrunEnd)` block):
    `{ type, status: "fail", reason, break, score }`
  - **complete** (`src/controller/end.ts`, the `Session.isSpeedrunMode()` block):
    `{ type, status: "complete", matchResult, replayUrl, break, score }`
    where `matchResult.replayData` is the whole-game compressed state.
- The page's `message` listener only calls `ks(e.score)` (clamps to 32, keeps the
  session best `G`, repaints `#score-display` / `#sagu-result` / gallery) and, on
  fail, `Mt()` which sets the iframe to `about:blank`.
- The rail is filled by `_s()`: `GET ${L}/api/hiscores/sagu`, where `L` is
  `""` on localhost and `https://billiards-network.onrender.com` otherwise. It
  renders `name` and `score` into `#break-list`.
- **Nothing is uploaded.** The only HiScore path in the game itself is the
  `hiscore.html` link this work removes.

## 3. Endpoint facts (verified against the deployed services)

- `OPTIONS https://scoreboard-tailuge.vercel.app/api/hiscore` with
  `Origin: https://billiards.tailuge.workers.dev` returns
  `204` with `access-control-allow-origin: https://billiards.tailuge.workers.dev`,
  `access-control-allow-methods` including `POST`, and a preflight cache of
  86400 s. A cross-origin POST from the game origin is allowed.
- `GET https://scoreboard-tailuge.vercel.app/api/hiscores/sagu` → **404**.
- `GET https://billiards-network.onrender.com/api/hiscores/sagu` → `200` with
  `{ "ruleType": "sagu", "hiscores": [ { "name": "LKY", "likes": 2, "id": "68cde4c7", "score": 10 }, … ] }`.

So writes go to the scoreboard host while the sagu leaderboard is currently
read from the arena host. See §7.

## 4. Data the challenge page must have for the upload

1. **`ruletype`** — literal `"sagu"`.
2. **`score`** — already in the `speedrun-result` message (`e.score`).
3. **`username`** — the page's `UserStore` instance (`u` inside
   `challenge.js`) has `u.userName`; it is seeded from `?userName=` and
   `localStorage.userName`, and always has a value. Use it verbatim (trimmed),
   not the hiscore page's 3-character initials box.
4. **`state`** — `e.replayData`, the compressed whole-game replay. This is now
   sent on **every** `speedrun-result` message, for all ruletypes and on both
   outcomes (see §5). A failed run keeps the shots played before the miss, which
   is exactly the break a sagu hi-score needs. The state also carries the
   player names (`Recorder.getPlayerNames()`), so strip `players`, `userName`
   and `userId` before posting: this mirrors `LinkFormatter.getHiScoreUri()`,
   which deliberately omits the recorder's identity from a publicly shared
   replay.
5. **`v=1`**.

## 5. Replay data in `speedrun-result` (already implemented)

Every speedrun outcome now carries `replayData`, using
`Recorder.getWholeGameCompressed()` (`ReplayEncoder.crush(wholeGame())`):

- **fail** — `src/controller/playshot.ts` includes `replayData` next to
  `reason`, `break` and `score`. A player who makes a break of 5 and then misses
  still sends the five shots' replay.
- **complete** — `src/controller/end.ts` includes `replayData` next to
  `matchResult` and `replayUrl`, reusing `matchResult.replayData` and falling
  back to `getWholeGameCompressed()` when it is absent.

Compression is wrapped in `try/catch` on both paths, so a serialisation problem
leaves `replayData` undefined rather than breaking the game over. Consumers that
do not care about the replay simply ignore the field.

The message must carry the data itself: on fail the parent immediately calls
`Mt()`, which destroys the iframe, so the challenge page cannot ask the game for
the replay afterwards.

## 6. What `challenge.js` has to do

1. **Add a scoreboard base constant**, separate from `L`:
   `const SCOREBOARD_BASE = "https://scoreboard-tailuge.vercel.app"` (and the
   local/dev override the page already uses for its replay frame).
2. **Trigger the upload from the existing `message` listener**, after
   `ks(e.score)` and before `Mt()` on fail, so the fetch starts before the
   iframe is unloaded:
   `void maybeUploadSaguScore(e)`.
3. **`maybeUploadSaguScore(e)`** should:
   - ignore anything that is not an eligible run: `e.status === "complete"` is
     always eligible; `e.status === "fail"` is eligible only when
     `e.score >= 2` (matching `BallTray.addBreak()`, which only offers a hi-score
     for breaks of 2+) and `e.replayData` exists;
   - **top-20 gate:** skip the upload unless the score would enter the top 20 of
     the hiscores already loaded for the rail (the `_s()` result for
     `ruletype=sagu`). Compare against the 20th-ranked score in that list; a
     score lower than the 20th is not uploaded; a tie with the 20th is uploaded.
     The check uses only the list already in memory and does not fetch again.
     With fewer than 20 rows loaded, always upload (§7.10).
   - skip when the score is not an improvement on the last uploaded score for
     this client. Persist it, e.g.
     `localStorage["sagu.hiscore." + u.clientId]`, because `G` is only an
     in-memory session best that resets on reload;
   - skip duplicates within one run (a run can emit more than one message on
     odd teardown paths) with a per-run flag or the score+timestamp pair;
   - pick the name: `u.userName.trim()`, limited to 12 characters, falling back to `"Anon"` when empty;
     URL-encode it for the `id` parameter (`encodeURIComponent`);
   - build the request exactly as §1:
     ```js
     const body = `?ruletype=sagu&state=${encodeState(replayData)}&score=${score}&v=1`
     const url = `${SCOREBOARD_BASE}/api/hiscore?ruletype=sagu&id=${encodeURIComponent(name)}`
     ```
     where `encodeState` is `ReplayEncoder.fullyEncodeURI` applied to the
     already-crushed string (copy the helper, or port it — do not
     `encodeURIComponent` an already-encoded state);
   - `POST` with the same fetch options as the hiscore page;
   - on `response.ok`: record the uploaded score, refresh the rail with `_s()`,
     and show a short success note in `#sagu-result` (e.g. "HiScore uploade").
     Do **not** navigate to `/leaderboard` or `hiscore.html`;
   - on failure (network error, non-2xx): keep the local best, show a retry note,
     and retry once with a short backoff. Never lose the run because the upload
     failed.
4. **Refresh the rail**: `_s()` already re-reads `GET ${L}/api/hiscores/sagu`;
   call it after a successful upload so the new row appears without a reload.
5. **Keep the overlay behaviour**: fail still closes the overlay; complete still
   leaves it open until the player closes it. The upload must not block either.
6. **No username prompt** is required for the first version: use the current
   username. If a later version lets the player edit it, reuse `u.set(id, name)`
   so the lobby and the challenge page stay in sync (that is the same store the
   rest of the page uses).

Sketch (not applied):

```js
async function uploadSagu({ score, replayData, status }) {
  if (!(score >= 2) || !replayData) return
  if (status === "fail" && !replayData) return
  const name = (u.userName || "Anon").trim() || "Anon"
  const key = `sagu.hiscore.${u.clientId}`
  if (Number(localStorage.getItem(key) || 0) >= score) return

  const url = `${SCOREBOARD_BASE}/api/hiscore?ruletype=sagu&id=${encodeURIComponent(name)}`
  const body = `?ruletype=sagu&state=${fullyEncodeURI(replayData)}&score=${score}&v=1`
  const res = await fetch(url, {
    method: "POST",
    mode: "cors",
    cache: "no-cache",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    referrerPolicy: "no-referrer",
    body,
  })
  if (res.ok) {
    localStorage.setItem(key, String(score))
    _s()
  }
}
```

## 7. Open questions / risks to settle before coding

1. **Shared storage: confirmed.** Writes to `scoreboard-tailuge.vercel.app/api/hiscore`
   and reads from `billiards-network.onrender.com/api/hiscores/sagu` share storage.
   The rail keeps reading from the arena host.
2. **`id` length: decided.** The full username is uploaded, up to 12 characters,
   applied on the client before sending. Initials are not used.
3. **Response shape and status codes.** `hiscore.html` ignores the response; a
   direct upload should treat `res.ok` as success and log the body for
   diagnosis. Confirm whether the endpoint returns 200/201 JSON and whether it
   rejects an invalid `state`.
4. **Server-side validation.** Score and replay are client-supplied; the server
   should decode `state`, replay it and derive the score rather than trust
   `score`. Out of scope for the challenge page, but it decides whether an
   upload is meaningful.
5. **CORS origins.** Preflight succeeds for `https://billiards.tailuge.workers.dev`.
   `dist/challenge/index.html` also ships from other hosts (the Docker image and
   `../billiards/dist`, per its own header comment), so those origins must be
   allowed too or the upload will fail there.
6. **Localhost/dev: decided.** Uploads are not skipped on localhost. They go to
   `SCOREBOARD_BASE` like in any other environment.
7. **Privacy.** The posted `state` is public (the scoreboard renders it as a
   replay). Strip `players`/`userName`/`userId` like `LinkFormatter` does, even
   though the display name is included separately as `id`.
8. **Ties and ranking.** The rail does not sort; the server does. After the
   first successful upload, check where an equal score lands.
9. **Top-20 gate: ties decided.** A score equal to the 20th-ranked score is uploaded.
10. **Top-20 gate: fewer than 20 decided.** With fewer than 20 rows loaded
    (including an empty list after a failed fetch), the upload always goes ahead.
11. **Top-20 gate: stale list decided.** The gate uses the list already loaded and
    does not re-read it. A stale list may occasionally skip or allow an upload
    incorrectly; this is accepted.

## 8. Test plan

- Unit-level: assert the built URL and body strings for a fixed score/state
  (URL has `ruletype=sagu`, `id` encoded; body starts with `?ruletype=sagu`,
  contains `score=` and a single-encoded `state=`).
- Manual, deployed: play sagu until the break ends with a score of 5 → POST
  returns 2xx, `#sagu-result` shows the success note, rail shows the row without
  a reload, replay opens from the scoreboard with the right name, and no
  navigation away from the challenge page.
- Complete run (`raceTo=32`): still uploads the `matchResult.replayData` state
  and keeps the existing overlay behaviour.
- Failure paths: offline, 4xx, repeated run with a lower score (no second POST),
  reload (local best resumes), and `?userName=` override.
- Top-20 gate: with 20 loaded scores, a score below the 20th does not POST; a
  score above or equal to it does. With fewer than 20 loaded, it always POSTs.
- Regression: the other rules' HiScore flow (`hiscore.html`) is untouched.
