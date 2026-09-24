# Pot & Reveal — Spec

> **Status:** single source of truth. This document **consolidates the retired design draft
> `revealdesign.md`** into the implementation spec; `revealdesign.md` no longer exists — do not
> recreate it, edit this file instead.
> **Audience:** implementers of `src/client/reveal` in this repo, and the sister game repo
> `../billiards` on the other side of the launch/return contract.
> **Implemented in:** `src/client/reveal/index.html`, `src/client/reveal/reveal.js`, and
> `revealGameUrl` / `revealReplayUrl` in `src/client/utils.js`.
> **Last updated:** 2026-09-24 — challenge entries now include a **0–1 `data-rating`**, shown as
> 1–5 small stars on unsolved cards and launched as `reds=floor(rating * 32)`. A success return
> carries **`?image=` and `?state=`**; the state is persisted on the completed card and is the source
> of that card's replay/share link.

---

## 1) Summary

Build a new **English-only Pot & Reveal page** — a lightweight, vertically tight billiards
picture-reveal game — that feels embedded in the existing billiards site. The player pots balls in
the external billiards game; the hidden photograph is progressively revealed per pot. The page's
dominant element is a **dense wall of small mystery cards**; explanatory SEO prose lives tightly
**below** the grid so returning players can play without scrolling.

Completion persists the finished card (small local thumbnail + identifiers + the game's replay
`state`, cap 20) in `localStorage`, which is what makes the card's **Replay** and **Share** actions
work offline of the game. The game itself is not re-implemented here: this repo builds a Lit +
esbuild page that reuses the existing header islands, URL helpers and share/replay patterns, and
negotiates launch/return with the game via `ruletype=reveal&image=` / `?image=` + `?state=` exactly
as the lobby does.

---

## 2) Goals

- **Compact, vertically tight, visually driven, immediately playable** — intro is 1–2 lines, then
  the card collection. No hero, no wall of text, no marketing panels.
- **Feels like part of the site** — header, tokens, typography, dark/light mode match
  `arena.html`/`lobby.html` (Exo 200).
- **Mostly semantic HTML, SEO-friendly, mobile-friendly, accessible** — main explanatory text is
  **real HTML directly in the page** (`index.html`) so a crawler without JS identifies the page (JS
  is assumed for the grid itself).
- **Minimal dependencies** — reuse existing Lit islands and utils; no new framework, no analytics.
- **Reveal contract pinned to existing lobby patterns** — launch URL built exactly like
  `gameUrl()`/`soloUrl()` in `src/client/utils.js`: `&userId&userName&lod&flip&custom.*&lobbyUrl`.
  Return is `?image=` (which picture) **plus `?state=`** (the whole-game replay), both persisted.
- **Replay and share are first-class for a completed card** — the returned `state` is stored so the
  card can rebuild the game's replay link (`?ruletype=reveal&state=…`) with no network call.
- **Lightweight progress** — only completed cards persisted; no partial reveal, no full-res storage,
  no extra Wikimedia fetches for unsolved cards.

---

## 3) Non-goals (v1)

- No per-challenge landing pages (`/reveal/<slug>/`). Single collection page
  `src/client/reveal/index.html` → `/reveal/` only. Per-person pages can be added later reusing the
  same Lit bundle/CSS.
- No daily / streak / daily-challenge mechanic — available pictures in any order.
- No account, login, or analytics.
- No separate sitemap work — sitemap is owned by the sister project `../billiards`.
- No no-JS fallback for the card grid — assume JS present (like lobby). SEO prose is the
  no-JS-visible part, not the grid.
- No server-side or account-backed collection — `localStorage` only, per device.
- No whole-collection sharing — one card, one reveal, one replay link.

---

## 4) Information architecture & priority order

**Above the fold (dominant):**

1. Compact title + one-line description — **Pot & Reveal** + *"Play billiards to uncover hidden
   pictures. Each successful pot reveals another part of the image."*
2. **Card collection grid** — the visually dominant, central element. Users collect favourite cards
   like Pokémon.

**Below the fold (tight, semantic, crawlable):**

3. Explanatory prose — `How to play` / `FAQ` / attribution, in **one** two-column panel (no `About`
   section, no duplicate copy). 4 how-to steps + 5 short FAQs, kept vertically tight.
4. Shared `site-links` footer (as in `arena.html`/`lobby.html`, outside `<reveal-app>` so crawlers
   see it).

Anti-pattern avoided: `H1 → huge paragraph → instructions → FAQ → finally the game`. Instead:
`H1 → collection` first.

---

## 5) Where it lives & build/deploy

### 5.1 Source layout (implemented)

```
src/client/reveal/
  index.html        # canonical shell: theme bootstrap, <reveal-app>, SEO prose directly in HTML,
                    # hidden challenge data (<ul id="challenge-data" hidden>), site-links footer
  reveal.js         # Lit entry <reveal-app> — grid, flip, localStorage, return handling, thumbnails
  # styling lives inside reveal.js via THEME_VARS/SHARED_STYLES (as lobby/arena do), no reveal.css
  # challenge data is embedded in index.html as a hidden HTML element (§6) — no challenges.xml fetch
```

The former `challenges.xml` design is **superseded**: the 47 seed entries are embedded in
`index.html` (§6, §15), so the build copies no data file and the page performs no data fetch.

### 5.2 Build — same strategy as `lobby`

`package.json:build:lit` bundles reveal alongside lobby/arena and emits it in the **directory form**
`reveal/index.html` + `reveal/reveal.js`, which is exactly what the game returns to
(`./reveal/index.html`):

```sh
rm -f docker/html/reveal.html docker/html/reveal.js   # drop the old flat form
npx esbuild src/client/reveal/reveal.js --bundle --minify --outfile=docker/html/reveal/reveal.js
cp src/client/reveal/index.html docker/html/reveal/index.html
```

Docker: `docker/Dockerfile` already `COPY html/ /usr/share/nginx/html/` and
`nginx location / { root …; index index.html; }` — no nginx change. `/reveal/index.html`, `/reveal/`
(directory index) and `/reveal/reveal.js` all resolve.

`crossdeploy` mirrors the same **directory form** into the sister game repo `../billiards`:

```sh
rm -f ../billiards/dist/reveal.html ../billiards/dist/reveal.js
npx esbuild src/client/reveal/reveal.js --bundle --minify --outfile=../billiards/dist/reveal/reveal.js
cp src/client/reveal/index.html ../billiards/dist/reveal/index.html
```

The page therefore lives one level below the site root, so its relative links are written for that
depth: the scripts bundle is `reveal.js` (same directory), the icon/logo is `../assets/…`, and the
header's lobby links are `../lobby.html` (they were `./lobby.html` while the page was flat). All
targets are emitted by the same build, so `../assets/threecushion.png` and `../lobby.html` resolve in
both `docker/html` and `../billiards/dist`.

`.gitignore` (`docker/html/*`) means `docker/html` is ephemeral — acceptable while deployment flows
through `crossdeploy` + Docker build.

### 5.3 Canonical URL & locales

```html
<link rel="canonical" href="https://billiards.tailuge.workers.dev/reveal/">
```

Single English URL for v1. Future locales (`/reveal/ko/`, `/reveal/de/`, `/reveal/tr/`,
`/reveal/nl/`) reuse the same Lit bundle; only `index.html` copy is translated (HTML is the source
of language-specific text, not a JS translation object).

---

## 6) Challenge data — hidden, HTML-native, coder-editable

### 6.1 Decision (pinned to the implemented form)

- **Not** a visible user-facing list, **not** a separate JSON/XML fetch, **not** `<template>` (inert)
  and **not** a `<script type="application/json">` blob.
- **Yes:** a **hidden HTML data element embedded directly in `index.html`** — technically in the
  HTML, diff-friendly per entry, trivial for a coder to edit (one block per person), **not visible
  to the end user**. This is what `reveal.js` reads (`readChallengesFromDOM()`).

The `<ul hidden>` form is chosen over the `challenges.xml`/embedded-XML alternative because links
stay real `<a href>` elements. The XML variant is dropped; do not reintroduce it.

### 6.2 Shape

```html
<!-- Hidden challenge data — one <li> per entry, diff-friendly, not displayed -->
<ul id="challenge-data" hidden aria-hidden="true">
  <li>
    <a
      href="https://en.wikipedia.org/wiki/BoA"
      data-image="https://upload.wikimedia.org/wikipedia/commons/9/95/…png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled"
      >BoA</a
    >
  </li>
  <!-- … one <li> per challenge … -->
</ul>
```

- `data-image` = canonical image URL used for `ruletype=reveal&image=` **and** for `?image=`
  matching on return. This is the **canonical identifier**. Raw `&` is escaped as `&amp;` in HTML;
  the DOM yields the unescaped URL, which is what must match the returned `image` param.
- `data-rating` = a float in `[0, 1]`. The app clamps it, maps it to 1–5 small stars on the
  unsolved card, and sends `reds=floor(rating * 32)` when launching the game.
- `href` = `wikipediaUrl` (English Wikipedia page) for the completed card's secondary action.
- Display name is the anchor text (`BoA`, `Eugene (actress)` … preserved verbatim).
- `slugify(name)` derives the card `id` for dedup/keys.

### 6.3 Seed

**47 entries** (BoA … Shannon Bae) are the v1 content. The full list lives in
`src/client/reveal/index.html` (`<ul id="challenge-data">`) and is the canonical copy — §15 lists
the names in order only. Each entry carries `name`, `imageUrl` (includes `utm_*`), `wikipediaUrl`.

### 6.4 Constraints

- No Wikimedia thumbnail requests for unsolved cards. No per-card fetch to populate mystery tiles.
- Card data is **not** the primary SEO target; the prose in §8 is. The hidden list is present in
  source but not user-visible.
- Editing is per entry: add/remove one `<li>`; no comma bookkeeping. UTF-8, `&amp;` for `&`.

### 6.5 Decks

The page offers more than one deck from a button pair on the title row (so offering the choice costs
**no extra vertical height**):

| Deck | Button | Data list | On-page title |
|---|---|---|---|
| K-idols (default) | `K-idols` | `<ul id="challenge-data">` (47 entries) | `Pot & Reveal` |
| Pokemon (placeholder) | `Pokemon` | `<ul id="pokemon-data">` (one sample entry) | `PokePot` |

- `DECKS` in `reveal.js` is the only place a deck is declared (`id`, button `label`, on-page
  `title`, `dataId`); a deck is added by appending to that array plus its hidden `<ul>`.
- The chosen deck is remembered in `reveal:deck`, so a game launched from a deck returns to that
  deck's wall; `loadDeckId` ignores an unknown id and falls back to the first deck.
- The collection and deleted-ids stay **shared by all decks** (one `reveal:collection`, one
  `reveal:removed`): a picture completed in one deck is still completed when you switch back, and
  `Reset deck` clears progress for every deck.
- The `?image=` return match searches **every** deck and switches to the matching one, so a return
  URL still awards its card if the deck was switched (or the stored deck cleared) since launch.
- A deck whose `<ul>` is present but empty renders "No pictures in this deck yet." instead of the
  "Loading pictures…" state.

---

## 7) Header — mirrors `arena.html`, uses Lit, reuses pathways

Reuse the site's existing header chrome, not a bespoke one:

```html
<header class="topbar">
  <a href="./lobby.html" class="topbrand" aria-label="Billiards lobby"><img src="../assets/threecushion.png" class="logo" alt=""></a>
  <h1><a href="./lobby.html">Billiards</a><a href="https://github.com/tailuge/billiards" class="version">v…</a></h1>
  <trophy-item></trophy-item>
  <user-badge></user-badge>
  <settings-modal @theme-changed=…></settings-modal>
</header>
```

- Tokens: `THEME_VARS` + `SHARED_STYLES` from `src/client/styles.js` — same dark/light
  `—bg/—surface/—border/—text/…`, same `button` treatments. No new colour tokens.
- Theme bootstrap is the same one-liner as `arena.html` (`?theme=` or `localStorage.theme` →
  `document.documentElement` `theme` + `colorScheme`).
- Container: `max-width: 900px; margin: 0 auto;` as in `arena-app`.
- Sticky `topbar` (`position: sticky; top: 0; background: var(--bg)`).
- Typography: **Exo 200 throughout**; Google Fonts `wght@200;600`, `600` used for panel titles to
  keep hierarchy parity (`arena-view` uses the same split).
- Why: crawlers and users see the same brand chrome as everywhere else, and dark mode comes free.
- `<reveal-app>` renders the header inside shadow; the outer `index.html` still includes the
  `<nav class="site-links">` footer outside the app (light DOM) as `arena.html`/`lobby.html` do for
  crawlers.
- The explanatory prose is **not** rendered by the Lit app: it lives once in the light DOM (below),
  styled by `index.html`'s own `<style>`. Rendering it in both places duplicated it on screen.

---

## 8) Page skeleton (HTML-first, SEO prose direct)

`src/client/reveal/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pot & Reveal — Play billiards to uncover hidden pictures</title>
  <meta name="description" content="Free online billiards picture-reveal: pot balls to progressively uncover hidden photographs. No download.">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="https://billiards.tailuge.workers.dev/reveal/">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Exo:wght@200;600&display=swap" rel="stylesheet">
  <link rel="icon" type="image/png" href="../assets/threecushion.png">
  <script>/* theme bootstrap as arena.html */</script>
</head>
<body>
  <h1 hidden>Pot & Reveal — billiards picture-reveal game</h1>
  <reveal-app></reveal-app>
  <!-- Explanatory prose below the grid — real HTML, view-source/crawler visible, no JS needed.
       The single copy: <reveal-app> renders the grid above and no prose below. -->
  <section class="seo-fallback" aria-label="How to play and FAQ">
    <div class="seo-grid">
      <div class="seo-col">
        <h2>How to play</h2>
        <ol>
          <li>Choose a mystery picture from the wall.</li>
          <li>Tap the card to flip it, then press Play.</li>
          <li>Pot balls in the billiards game to progressively reveal the photograph.</li>
          <li>Complete the picture to keep it in your collection.</li>
        </ol>
      </div>
      <div class="seo-col">
        <h2>FAQ</h2>
        <h3>What is Pot &amp; Reveal?</h3><p>…</p>
        <!-- 5 concise FAQs total -->
      </div>
    </div>
    <p class="attribution">Images from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>, individually attributed on the completed card.</p>
  </section>
  <!-- Hidden challenge data is embedded here as §6 (not rendered) -->
  <nav class="site-links" aria-label="Billiards pages">…as arena.html…</nav>
  <script type="module" src="reveal.js"></script>
</body>
</html>
```

`<reveal-app>` renders: sticky `topbar`, compact intro, dense `#card-grid` (from embedded data) and,
below the grid, the deck **Reset** button (shown only when something has been revealed) — **no
prose**, no progress counters. The light-DOM `seo-fallback` is the only copy of the explanatory
text, so it is both what a no-JS crawl (view-source) sees and what the player sees.

Its layout: `.seo-grid` is a panel (`--surface`/`--border`, 6px radius, tight padding) holding two
columns — **How to play** on the left, **FAQ** below/right — collapsing to one column under 600px,
with the attribution line under the panel. There is no `About Pot & Reveal` block.

`<head>` extras: `og:title/description/image` (one static poster, not per-card), `twitter:card`,
`og:type=website`, one `VideoGame` JSON-LD block adapted from `lobby.html`, `theme-color`,
`manifest` as appropriate.

---

## 9) Collection / card UI

### 9.1 Layout

- `display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 4px;`
  - Desktop: wall of ~20–30 cards visible without scrolling.
  - ≤380px: relax to `minmax(76px, 1fr)`.
- Card: `aspect-ratio: 3/4`, `border: 1px solid var(--border)`, `border-radius: 6px`,
  `overflow: hidden`, `background: var(--surface)`, tight padding. Same panel visual language as
  `arena-view`/`active-arenas`.
- Source (fixed, stored) order — **no shuffle**, never was: the grid renders `#challenge-data` as
  written. Completed cards stay in place and simply render as thumbs. Only **deleted** cards are
  filtered out of the list, so the cards after them reflow into the gap (§11).

### 9.2 States

The card is **one unit** — a single 3:4 flip card with a front face and a back face. There is no
thumb strip, no caption row and no tick badge; the whole card is the grid cell, which keeps the wall
dense.

**Front face (no interaction target of its own):**

- **Unsolved:** `?` glyph in `var(--text-faint)`, with a compact gold star rating along the bottom.
  The `[0, 1]` challenge rating maps to 1–5 stars with a minimum of one. No network image request
  and the name is not shown (preserves mystery).
- **Solved:** the **locally stored thumbnail** (`data:` URL from `localStorage`, `object-fit: cover`,
  no network).

**Back face (revealed by the flip):**

- **Unsolved:** a centered **Play** button (`▶ Play`) that navigates to the game.
- **Solved:** the card's name in the middle — the name **is** the Wikipedia link, so there is no
  separate Wikipedia button — plus **one action per corner**: **Share** top-right, **Delete**
  bottom-left, **Replay** bottom-right (see §11). The top-left corner is free.

**Flipping:**

- Tapping/clicking/keyboard on the card flips it, solved or not. CSS-only
  `transform: rotateY(180deg)` with `transform-style: preserve-3d; backface-visibility: hidden;
  transition: transform 220ms ease`. `prefers-reduced-motion` disables animation.
- Interaction is **flip, then press the button** — not tap-twice on the card. Action buttons call
  `stopPropagation` so they neither flip the card back nor launch.
- A11y: the card is a real `<button>` with `role="listitem"`, `aria-pressed` for the flip state, and
  a state-dependent `aria-label` (`Mystery picture — tap to reveal play` / `<name> — completed, tap
  for actions`). Keyboard: Space/Enter flips; the action buttons and the name link are separate tab
  stops. `stopPropagation` on the name link keeps it from flipping the card.
- Restrained visual transition (no confetti).

### 9.3 Negative / scope

- No "Surprise me" random launcher, no extra challenge buttons — **grid is the central element**.
- No visible second "Picture challenges" list section.
- No completed-card `<dialog>`/detail view (superseded by the on-card icons).

---

## 10) Launch / return / persistence contract

### 10.1 Launch — built exactly like `lobby`

Concrete example you gave:

```
http://localhost:8080/?ruletype=reveal&image=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2F4%2F42%2F170611_%EB%9D%BC%EB%B6%90_%EC%88%98%EC%9B%90_%EC%84%B8%EA%B3%84%EB%AC%B8%ED%99%94%EC%B6%95%EC%A0%9C_%282%29.jpg
```

`reveal.js` builds that plus the same lobby keys, via `revealGameUrl()` in `src/client/utils.js`
alongside `gameUrl()`/`soloUrl()` reusing `BASE`/`WS_SERVER`/`appendCustom`:

```
${BASE}?ruletype=reveal&image=<encodeURIComponent(imageUrl)>
  &userId=<userStore.clientId>&userName=<encodeURIComponent(userStore.userName)>
  &lod=<lod>&flip=<flip or omitted>&reds=<floor(clamp(rating, 0, 1) * 32)>
  &custom.<k>=<v>…        // userStore.getCustom() via flattenCustom → custom.cue.colour etc.
  &lobbyUrl=<WS_SERVER>  // when _localhost
```

Launch is a **full navigation** (`window.location.href = url`) — `window.open`/iframe not used. The
game controls the return.

### 10.2 Return — `?image=` **and** `?state=` indicate success

> "the response will have that image url as a query param indicating success, no success returns with
> no param"

The game returns the player to the reveal page. On success the URL carries **both** params (the
game builds it in `../billiards` `src/controller/rules/reveal.ts` → `buildUpdateDeckButton`, which
sets `image` and `state` on `./reveal/index.html`):

```
http://localhost:8080/reveal/index.html?image=https%3A%2F%2Fupload.wikimedia.org%2F…%2FBae_Seul-ki_in_2020.png%3Futm_source%3D…&state=f~vZnbbhs3EI…
```

- `image` — canonical Wikimedia URL, **URL-encoded**, identifying which picture was completed.
- `state` — the **whole-game replay state**: `ReplayEncoder.crush(JSON.stringify(recorder.wholeGame()))`
  then `fullyEncodeURI`. Opaque to this page; must be stored verbatim (§10.3, §10.5) and is the
  source of the card's replay/share link.

**No success / incomplete / abandoned:** no `?image=` (and therefore no useful state) — the page
does nothing.

Algorithm on load (`reveal.js` → `_handleReturnParam()`):

1. Read `image` via `new URLSearchParams(location.search).get('image')`. If absent, stop.
2. **Exact-match** that value (after `decodeURIComponent` and `&amp;` unescaping, both already done
   by `URLSearchParams` + DOM parsing) against the `data-image` values in `#challenge-data`. If no
   entry matches exactly, **ignore** — no card minted, no fetch, console log only. Normalization
   (e.g. stripping `utm_*`) is explicitly not done; the fix is to clean the seed data.
3. Read `state` via `params.get('state') || ''` (decoded once by `URLSearchParams`).
4. If the card is already completed: move it to the front and, when a `state` was returned, refresh
   `entry.state` + `entry.replayUrl`. Then strip the params and stop.
5. Otherwise `fetch`/decode the image **once** (already hot/CDN-cached from the game) with
   `crossOrigin="anonymous"` (Wikimedia sends `Access-Control-Allow-Origin:*`), draw to an offscreen
   `<canvas>` at small size, export `canvas.toDataURL('image/webp', 0.6)` (fallback `image/jpeg`).6. Persist the completed card including the verbatim `state` (§10.5). On any failure (fetch error,
     taint, quota) → **return the card to unsolved** (do not persist), `console.log` the cause, **no
     fuss, no user-visible notification**.
7. `history.replaceState` to strip `?image=` **and** `?state=`. This happens **up front**, as soon
     as the two params have been read (steps 1–3) and before the fetch/canvas work of steps 4–6:
     the return URL is single-use and copyable, so it must not sit in the address bar during the
     async thumbnail generation (or indefinitely, if that image request never settles). Everything
     the later steps need is held in memory, so stripping first does not affect whether the card is
     awarded. Refresh (and a copied URL) therefore cannot re-award, on success or on failure.

If the game ever adds further params alongside these (e.g. a different replay identifier), read and
store them on the card rather than changing the two-param success contract.

### 10.3 Replay link derivation (from the stored state)

A typical game replay link looks like this:

```
https://billiards.tailuge.workers.dev/?ruletype=nineball&state=f%7EtVbLbhtHEPyXPa-Jfk1P…
```

The game builds replay links itself as `${location.href.split("?")[0]}?ruletype=${ruletype}&state=
${ReplayEncoder.fullyEncodeURI(ReplayEncoder.crush(state))}`. Therefore the reveal card's replay
link is that same shape with `ruletype=reveal`:

```
${BASE}?ruletype=reveal&state=<encodeURIComponent(state)>&image=<encodeURIComponent(imageUrl)>
```

- Implemented as `revealReplayUrl({ imageUrl, state })` in `src/client/utils.js` (mirrors
  `revealGameUrl` and the game's own format). Returns `''` when there is no state.
- `state` is stored decoded and re-encoded with `encodeURIComponent` when the link is rebuilt. The
  game reads it back with `URLSearchParams`, so the round trip is lossless for game-produced states
  (`fullyEncodeURI` is `encodeURIComponent` plus a few extra escapes, all of which decode
  identically).
- `image` is echoed in the link as well so the game can re-render the hidden photograph during
  playback.
- The link is derived **locally from storage** — opening Replay or copying Share contacts no server
  beyond the game itself.
- Cards completed before this contract existed have no `state`: their Replay icon renders muted/
  disabled and Share falls back to the Wikipedia link.

### 10.4 Thumbnail

- Generated **only after completion** from the already-loaded `imageUrl`. No thumb for unsolved
  cards, no second fetch for displaying completed cards.
- Target longest edge 160–200px (covers 2× DPR on an 84–100px card), WebP quality 0.6 → ~8–14 KB per
  card as a data URL.
- Never store full-res source. Completed display uses only the local `thumb:` data URL.

### 10.5 `localStorage` schema — capped collection

- Key: `reveal:collection` (the `potRevealCollection` name from the design draft is superseded).
- Value: `JSON.stringify(Array<Entry>)`, **newest first**, trimmed to **20** on write.

```json
[
  {
    "id": "boa",
    "name": "BoA",
    "imageUrl": "https://upload.wikimedia.org/…/BoA…png?utm_…",
    "wikipediaUrl": "https://en.wikipedia.org/wiki/BoA",
    "thumb": "data:image/webp;base64,…",
    "completedAt": 1717000000000,
    "state": "f~vZnbbhs3EI…",
    "replayUrl": "https://billiards.tailuge.workers.dev/?ruletype=reveal&state=f%7E…&image=…"
  }
]
```

- `state` — the verbatim returned replay state (empty string if the game returned none). **Required
  for new completions**; it is the persists-only-what-you-need payload for Replay/Share.
- `replayUrl` — derived from `state` + `imageUrl` at completion time so it is stable and needs no
  recomputation; readers still fall back to deriving it from `state` when absent.
- `id` derived from `<name>` (slugify) — unique per entry; used for dedup and stable keys. Duplicate
  name collisions (e.g. multiple "Lee" variants) are disambiguated by distinct
  `imageUrl`/`wikipediaUrl`.
- On success: if an entry for `id` already exists, move to front (refreshing `state`/`replayUrl` when
  supplied); else `unshift`. If `length > 20`, `pop` the oldest. Wrap `localStorage` + `JSON.parse`
  in `try/catch`; on `QuotaExceededError` drop oldest and retry once. Never throw to the user. No
  partial progress persisted; unsolved cards are not stored.

### 10.6 `localStorage` — deleted cards

- Key: `reveal:removed` — a **separate key** so a deletion can never corrupt the collection (the
  same principle as the stats key in `pokipool.md` §7).
- Value: `JSON.stringify(Array<string>)` of card ids (`"boa"`), in no meaningful order.
- Written by Delete (§11) and cleared by Reset deck; a card completed again is removed from the list
  (a re-completed picture is back in the deck). Read once on mount, then kept in component state.
- A `?` tile is rendered for every entry in `#challenge-data` **except** ids listed here, so the
  deck shrinks by deletions and the remaining cards reflow. With every entry deleted the grid shows
  a short "no pictures left — press Reset deck" line instead of the (empty) wall.
- Both keys live in `try/catch`; a failure degrades to "deletion does not persist" and logs only.

---

## 11) Completed-card actions (corner buttons on the flipped card, no dialog)

A solved card shows its thumbnail until flipped; the flip reveals the name (**a Wikipedia link**) and
three small corner buttons, so nothing obscures the picture and no dialog is needed:

- **Share** — top-right corner, a small inline SVG share glyph; copies the card's **game replay
  link** (`_replayUrlFor(entry)`, i.e. the state-derived URL) via `navigator.clipboard.writeText`;
  falls back to logging for manual copy, and to the Wikipedia link only when no state exists. One
  reveal only; no whole-collection share.
- **Replay** — opens the game replay link in a new tab (`window.open(url, "_blank", "noopener")`).
  Muted/disabled when the card has no `state` (cards completed before the state contract).
- **Wikipedia** — the card's own name, rendered as a real `<a href="wikipediaUrl" target="_blank"
  rel="noopener">` in the middle of the back face (there is no Wikipedia corner button). No extra
  button competes with the picture, and the link supports copy/open-in-new-tab like any link.
- **Delete** — bottom-left corner, `✕`, `aria-label="Remove from collection"`. Destructive: it filters
  the entry out of `reveal:collection` (persisted immediately), adds the id to `reveal:removed`
  (§10.6) so the tile does not return on reload, and clears the flip state when that card was open.
  The tile leaves the wall and the remaining cards reflow into the gap — no layout animation is
  specified yet. Deletion is reversible only via **Reset deck**.
- **Reset deck** — a single button **below the grid** (never per-card), rendered while the collection
  is non-empty **or** a deletion is remembered. It asks for confirmation (`window.confirm`, naming
  how many revealed cards and deleted pictures will be affected), then removes both
  `reveal:collection` and `reveal:removed` and clears the in-memory collection/completed-set/removed
  set/flip state, so the **full source deck** returns to its unsolved `?` state in source order.
- Attribution detail (author/licence) can be added when the game supplies it; for now the Wikipedia
  link plus the attribution line in the prose covers it.

---

## 12) Styling (following `arena.html`, via Lit)

- `reveal.js` imports `THEME_VARS`/`SHARED_STYLES` from `src/client/styles.js` — same pathway as
  `tournament/arena.js`, so reveal never drifts.
- Cards carry a **layered drop shadow** (two soft black layers plus a hairline inset highlight), a
  stronger shadow on `:hover`/`:active`, and the hardest one on the flipped/focused card, so the wall
  reads as a deck of physical cards. The grid `gap` is wide enough (6px, 5px ≤380px) for the shadows
  to read between neighbours, and the panel uses `overflow: visible` so they are not clipped. Solved
  fronts add inner shading (`inset` vignette over the thumbnail); theme tokens are unchanged. The
  name link uses `var(--link)`; no new colour tokens.
- Exo 200 everywhere; headings small (`h1 ~1rem`, `h2 ~0.85rem`, `letter-spacing: .06em`, uppercase
  to match `arena-view`).
- Tight vertical rhythm: `gap: 0.2–0.4rem`, section padding `.4rem` inside panel-like cards, no large
  hero/whitespace. Explanatory copy is deliberately **after** the collection.
- Buttons reuse `SHARED_STYLES` treatments: the Play button is the primary action on the unsolved
  back face; the solved back face uses three 22px `--surface`/`--border` corner buttons
  (`.corner-tr` Share, `.corner-bl` Delete, `.corner-br` Replay — the top-left corner is free) so
  they never overlap the centred name link. Share's glyph is a small inline SVG (Material share
  node, 13px, `fill: currentColor`) — no icon font, no image request; Delete/Replay keep their
  text glyphs.
- `prefers-reduced-motion` disables flip; cards are real `<button>`s with `aria-pressed`/
  `aria-label`, keyboard operable (`Space`/`Enter`), focus rings via `button:focus-visible`.
- Mobile: grid stays dense (no single-column wall), icons keep ≥22px tap targets, no dialog keeps
  mobile simple.

---

## 13) Localization

- English only today. Architecture ready for:

  ```
  /reveal/       # en (this page)
  /reveal/ko/    # same Lit bundle, translated index.html (SEO prose + UI strings)
  /reveal/de/ …
  ```

- In-page language tabs on the prose panel (`index.html`): **English, Korean (`ko`), Turkish
  (`tr`), Chinese (`zh`), Vietnamese (`vi`), Spanish (`es`)**. English holds the real copy; the
  other five panels are `TBD` placeholders until real translations land.
- Same `reveal.js` bundle for all; language-specific text stays in HTML. Any JS string that must
  appear (e.g. "Copied!") reads from `data-i18n-*` on the HTML rather than hard-coding.
- The tabs are **JS-free**: hidden `<input type="radio" name="seo-lang">` elements precede the
  panels, so `#seo-lang-xx:checked ~ …` (plain sibling selectors, no `:has()`) styles the active
  tab and reveals its panel. Every language's copy sits in the DOM — only one is displayed — so a
  crawler without JS still reads all of it, and each panel (and tab label) carries its own `lang`
  code. English is `checked`, so the no-JS default is unchanged.

---

## 14) Dependencies & reuse

- **Lit everywhere** — `reveal.js` is a `<reveal-app>` Lit component bundled with esbuild, same
  toolchain as `lobby.js`/`arena.js`.
- Reuse: `user-store.js` (`clientId`/`userName`/`lod`/`flip`/`custom`), `user-badge` + `trophy-item`
  + `settings-modal`, `utils.js` (`revealGameUrl`, `revealReplayUrl`, `BASE`/`WS_SERVER`/
  `appendCustom`/`lobbyUrl`, `formatVersion`/`CLIENTVERSION`), `styles.js` tokens. Presence uses the
  same `MessagingClient.joinLobby()` path as the lobby.
- No new deps, no analytics, no extra framework. Subtle flip animation only.
- The game lives in the Workers deployment (`BASE`) and `../billiards` — this repo only builds the
  reveal collection page and the launch/return contract.

---

## 15) Seed data (embedded in `index.html`)

The v1 content is **47 entries**, in this fixed source order, embedded as the hidden
`<ul id="challenge-data">` in `src/client/reveal/index.html` (canonical copy, with URLs):

1. BoA
2. Chae Jung-an
3. Eugene (actress)
4. Bada (singer)
5. Byul
6. Chae Ri-na
7. Bae Seul-ki
8. CL (rapper)
9. Choi Soo-young
10. Dana (South Korean singer)
11. Bae Suzy
12. Ahn So-hee
13. Dia (singer)
14. Choi Jung-in
15. Baek A-yeon
16. Yerin Baek
17. Bang Min-ah
18. Ah Young
19. Anda (singer)
20. Bae Woo-hee
21. Elly (rapper)
22. An Ye-seul
23. Ben (South Korean singer)
24. Eunha (singer)
25. Cho Seung-hee
26. Chung Ha
27. Bona (singer)
28. Dahyun
29. Choi Yoo-jung (singer)
30. Miyeon
31. Choi Ye-na
32. Chaeyoung
33. AleXa
34. An Yu-jin
35. Ahn Sol-bin
36. Arin (singer)
37. Lee Chae-yeon
38. Chuu
39. Choerry
40. Dawon (singer)
41. Choi Yu-jin
42. Chaeryeong
43. Danielle (singer)
44. Bora (singer)
45. Jo Aram
46. Dayoung
47. Shannon Bae

Each entry: `name` (verbatim, parentheses preserved), `imageUrl` (upload/thumb.wikimedia URL with
`utm_*`, `&amp;`-escaped in HTML), `wikipediaUrl`. Collection order is the source order; completed
cards pin to the front of `localStorage` by recency but keep their grid position. No stubs, no
seeding beyond this list, no randomization.

---

## 16) Error & edge handling

| Case | Behaviour |
|---|---|
| `?image=` absent on return | No persistence, no thumb, no message. |
| `?image=` present but matches no embedded entry | Ignore — no card minted, console log, no UI (params are still stripped from the URL). Matching stays exact so a bad param cannot create a phantom card. |
| `?state=` absent alongside a valid `?image=` | Card is still completed (thumbnail + name); `state`/`replayUrl` are empty, Replay stays muted, Share falls back to the Wikipedia link. |
| `?state=` present but `?image=` missing | Nothing happens — `image` is the success signal. |
| Thumbnail generation fails (CORS taint, network, decode) | Return card to unsolved, `console.log`, no toast/banner. |
| `localStorage` quota exceeded | Drop oldest entry and retry once; if still full, unsolved (log). |
| `imageUrl` contains encoded Korean filename (`%EB%9D…`) | `decodeURIComponent` before compare; `encodeURIComponent` on launch (via helper). |
| `state` contains URL-hostile characters (`+`, `&`, `#`, `%`) | Stored decoded, re-encoded with `encodeURIComponent` when building the replay link; the game decodes with `URLSearchParams`. |
| Challenges list empty/missing from DOM | Grid shows a "Loading pictures…" line; `console` log; no visible error UI. |
| User with JS disabled | SEO prose still visible (direct HTML fallback); grid not rendered — accepted. |

---

## 17) Observability / logging

- Silent failures log to `console.log`/`console.error` only. No user-facing banners for save/fetch
  failures.
- No analytics events in v1.

---

## 18) Open items (not blocking v1)

1. ~~**Deploy path**~~ — resolved: build and `crossdeploy` now emit the directory form
   `reveal/index.html` + `reveal/reveal.js`, matching the game's `./reveal/index.html` return URL
   (§5.2).
2. ~~**Delete vs new deck**~~ — resolved: both are destructive. Per-card **Delete** filters the card
   out of the deck and remembers it in `reveal:removed` (§10.6, §11); the confirmed **Reset deck**
   button below the grid clears `reveal:collection` **and** `reveal:removed` (§11). Cards reflow
   without animation for now; a minimal CSS reflow transition can be added later without a layout
   change.
3. **Attribution granularity** — seed gives `wikipediaUrl` (English Wikipedia), not Wikimedia
   Commons file pages. A dedicated Commons attribution/licence line can be added once the game
   supplies it.
4. **ImageUrl hygiene** — seed URLs include `utm_source` etc. Keep as-is for exact matching, or
   clean to canonical origin+path if you later prefer stripping `utm_*`. The spec freezes on exact
   match; cleanup is a data edit.
5. **"Copied!" feedback** — Share currently writes silently to the clipboard; a `data-i18n`-driven
   confirmation (per §13) is a nice-to-have.

---

## 19) Verification

- `src/client/reveal/index.html` SEO prose is grep-visible in view-source without JS, and appears
  exactly **once** on screen (the Lit app must not re-render it).
- `npm run build:lit` emits `docker/html/reveal/index.html` + `docker/html/reveal/reveal.js` (and
  removes the old flat pair); served by nginx `location /`, `/reveal/index.html`, `/reveal/` and
  `/reveal/reveal.js` all answer 200, and the page's `../lobby.html` / `../assets/…` links resolve.
- Return flow: opening `…/reveal/index.html?image=<encoded seed url>&state=<crushed state>` mints a
  card, stores `state` + a `replayUrl` of the form `${BASE}?ruletype=reveal&state=…&image=…`, and
  clears both params from the address bar immediately (before the card is minted), so the URL is
  never there to copy and refresh does not re-award. A `?image=` that matches no seed entry is also
  stripped.
- Replay opens that link; Share copies it.
- **Delete** on a solved card removes that tile from the wall immediately, the following cards reflow
  into the gap, and a reload keeps it deleted (`reveal:removed`) — the collection entry is gone too.
- **Reset deck** appears below the grid while anything is revealed or deleted; confirming it empties
  both `reveal:collection` and `reveal:removed` so the full 47-card deck in source order is `?`
  again (no per-card state survives); declining it changes nothing.
- `npm run lint` + `npx oxfmt` / `npm run prettify` pass.
- `npm run screenshot:iphone` / Playwright: header matches `arena.html` (logo + version + trophy +
  user-badge), grid is dense and tight, explanation sits below the grid, no visible duplicate list,
  a solved card shows the picture on its front and the name + four corner buttons on its back, with
  no tick badge and no caption row.

---

## 20) Implementation status

| Piece | State |
|---|---|
| `src/client/reveal/index.html` | Done — theme bootstrap, single light-DOM prose panel (How to play + FAQ, two columns ≥600px) with JS-free language tabs (en/ko/tr/zh/vi/es, non-English copy `TBD`), hidden `<ul id="challenge-data">` (47 entries) and the placeholder `<ul id="pokemon-data">` deck (§6.5), site-links footer. |
| `src/client/reveal/reveal.js` | Done — header islands, deck switch on the title row (`reveal:deck`, titles `Pot & Reveal` / `PokePot`), dense grid; single flip card per entry (front: `?` plus 1–5 stars or picture, back: Play, or the name as a Wikipedia link plus Share/Delete/Replay corner buttons); lobby presence, cross-deck return handling, silent-failure logging. |
| `revealGameUrl()` (`src/client/utils.js`) | Done — adds `reds=floor(clamp(rating, 0, 1) * 32)` to the launch URL. |
| `revealReplayUrl({ imageUrl, state })` (`src/client/utils.js`) | Done — builds the game's replay link from the stored state. |
| `?state=` persistence + replay link on the card | Done — stored in `reveal:collection`, derived link used by Replay/Share. |
| Delete / new-deck behaviour | Done — per-card Delete filters the deck and persists in `reveal:removed`; Reset deck clears both keys (see §10.6, §11). |
| Deploy path (`reveal/index.html` + `reveal/reveal.js`) | Done — emitted by `build:lit` and `crossdeploy`; stale flat `reveal.html`/`reveal.js` removed by both. |

---

## 21) Sources

- Retired design draft `revealdesign.md` (now folded in): Lit+esbuild as lobby, `revealGameUrl` with
  `&userId&userName&lod&flip&custom.*&lobbyUrl`, SEO prose as direct HTML, sitemap owned by
  `../billiards`, hidden challenge data, `?image=` success, XML-not-blob editable seed, no seeded
  stubs → later seed, crossdeploy to `../billiards`, no no-JS grid, flip→Play button not tap-twice,
  thumbnail generated on reveal page, exact `?image=` match, full-page navigate, cap 20 vs
  favourite-collection tension.
- User clarifications (2026-09-23): concrete `ruletype=reveal&image=` launch URL; `?image=` absent =
  no success; **success returns `?image=` and `?state=`, and the state must be stored on the card to
  generate the replay link**; single `/reveal/` (no per-challenge pages); hidden data element not
  visible; no sitemap here; completed-card icons on the card near edges (no dialog); grid-central +
  concise prose below.
- Game side (`../billiards`): `src/controller/rules/reveal.ts` (`buildUpdateDeckButton` sets
  `image` + `state`), `src/utils/replay-encoder.ts` (`crush`/`fullyEncodeURI`),
  `src/view/link-formatter.ts` and `src/container/browsercontainer.ts` (`setReplayLink`) for the
  `?ruletype=<rule>&state=<state>` replay shape.
