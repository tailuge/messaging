# Pot & Reveal — Spec

> **Status:** Design-phase spec distilled from `revealdesign.md` (no code) plus 3 interview rounds (2026-09-23). This is the implementation source of truth. Code changes are deliberately not done in this step.  
> **Audience:** Implementers wiring `src/client/reveal` in this repo and later `../billiards` (game) via `crossdeploy`.

---

## 1) Summary

Build a new **English-only Pot & Reveal page** — a lightweight, vertically tight billiards picture-reveal game — that feels embedded in the existing billiards site. Player pots balls in the external billiards game; the hidden photograph is progressively revealed per pot. The page's dominant element is a **dense wall of small mystery cards**; explanatory SEO prose lives tightly **below** the grid so returning players can play without scrolling. Completion persists only the finished card (small local thumbnail + identifiers, cap 20) in `localStorage`. The game itself is not re-implemented; this repo builds a Lit + esbuild page that reuses existing header islands, URL helpers, and share/replay patterns and negotiates launch/return with the game via `ruletype=reveal&image=` / `?image=` exactly as the lobby does.

---

## 2) Goals

- **Compact, vertically tight, visually driven, immediately playable** — intro is 1–2 lines, then the card collection. No hero, no wall of text, no marketing panels.
- **Feels like part of the site** — header, tokens, typography, dark/light mode match `arena.html`/`lobby.html` (Exo 200).
- **Mostly semantic HTML, SEO-friendly, mobile-friendly, accessible** — main explanatory text is **real HTML directly in the page** (`index.html`) so a crawler without JS identifies the page (JS is assumed for the grid itself).
- **Minimal dependencies** — reuse existing Lit islands and utils; no new framework, no analytics.
- **Reveal contract pinned to existing lobby patterns** — launch URL built exactly like `gameUrl()`/`soloUrl()` in `src/client/utils.js`: `&userId&userName&lod&flip&custom.*&lobbyUrl`. Return is `?image=` indicating success.
- **Lightweight progress** — only completed cards persisted; no partial reveal, no full-res storage, no extra Wikimedia fetches for unsolved cards.

---

## 3) Non-goals (v1)

- No per-challenge landing pages (`/reveal/<slug>/`). Single collection page `src/client/reveal/index.html` → `/reveal/` only. Per-person pages can be added later reusing the same Lit bundle/CSS.
- No daily / streak / daily-challenge mechanic — available pictures in any order.
- No account, login, or analytics.
- No separate sitemap work — sitemap is owned by the sister project `../billiards`.
- No no-JS fallback for the card grid — assume JS present (like lobby). SEO prose is the no-JS-visible part, not the grid.

---

## 4) Information architecture & priority order

**Above the fold (dominant):**
1. Compact title + one-line description — **Pot & Reveal** + *"Play billiards to uncover hidden pictures. Each successful pot reveals another part of the image."*
2. **Card collection grid** — the visually dominant, central element. Users collect favourite cards like Pokémon.

**Below the fold (tight, semantic, crawlable):**
3. Explanatory prose — `How to play` / `About Pot & Reveal` / `FAQ` / attribution. Concise (2–3 short paragraphs + 4–5 FAQ items) and kept vertically tight as originally prioritized. This is the direct-HTML SEO entry point.
4. Shared `site-links` footer (as in `arena.html`/`lobby.html`, outside `<reveal-app>` so crawlers see it).

Anti-pattern avoided: `H1 → huge paragraph → instructions → FAQ → finally the game`. Instead: `H1 → collection` first.

---

## 5) Where it lives & build/deploy

### 5.1 Source layout

```
src/client/reveal/
  index.html        # canonical shell: theme bootstrap, <reveal-app>, SEO prose directly in HTML, hidden challenge data
  reveal.js         # Lit entry <reveal-app> — grid, flip, localStorage, ?image= return handling, thumbnail generation
  # styling is inside reveal.js via THEME_VARS/SHARED_STYLES (as lobby/arena do), no standalone reveal.css
  # challenges are embedded in index.html as a hidden HTML data element (see §6), not a separate JSON/XML file fetch
```

`§15` of `revealdesign.md` lists the 48 seed entries as XML; per latest guidance they are **embedded in `index.html`**, not a separate `challenges.xml` fetch. Build therefore copies no data file.

### 5.2 Build — same strategy as `lobby`

`package.json:build:lit` today:

```sh
npx esbuild src/client/lobby.js --bundle --minify --outfile=docker/html/lobby.js
npx esbuild src/client/tournament/arena.js --bundle --minify --outfile=docker/html/arena.js
cp src/client/*.html docker/html/ ...
```

Add in the same step:

```sh
npx esbuild src/client/reveal/reveal.js --bundle --minify --outfile=docker/html/reveal.js
cp src/client/reveal/index.html docker/html/reveal.html
# or docker/html/reveal/index.html for /reveal/ (nginx: index index.html;)
```

Docker: `docker/Dockerfile` already `COPY html/ /usr/share/nginx/html/` and `location / { root …; index index.html; }` — no nginx change; `/reveal` or `/reveal.html` is served.

`crossdeploy` later mirrors to the sister game repo `../billiards`:

```sh
npx esbuild src/client/reveal/reveal.js --bundle --minify --outfile=../billiards/dist/reveal.js
cp src/client/reveal/index.html ../billiards/dist/reveal.html
# (or ../billiards/dist/reveal/index.html)
```

`.gitignore` (`docker/html/*`) means `docker/html` is ephemeral — acceptable if deployment flows through `crossdeploy` + Docker build; if committing `docker/html/reveal.*` is desired, add `!docker/html/reveal*` exceptions.

### 5.3 Canonical URL

```html
<link rel="canonical" href="https://billiards.tailuge.workers.dev/reveal/">
```

Single English URL for v1. Future locales (`/reveal/ko/`, `/de/`, `/tr/`, `/nl/`) reuse the same Lit bundle; only `index.html` copy is translated (HTML is the source of language-specific text, not a JS translation object).

---

## 6) Challenge data — hidden, HTML-native, coder-editable

### 6.1 Decision (from review + your latest reply)

- **Not** a visible user-facing `<ul>` and **not** a separate JSON blob fetch.
- **Not** `<template>` (inert, not crawlable) and **not** `<script type="application/json">` alone.
- **Yes:** a **hidden HTML data element embedded directly in `index.html`** — technically in the HTML, diff-friendly per entry, trivial for a coder to edit (one block per person), **not visible to the end user**.

### 6.2 Recommended shape

Hidden `<ul>` in HTML (visible to coder/view-source, hidden via `hidden` + `aria-hidden`, not rendered):

```html
<!-- Hidden challenge data — one <li> per entry, diff-friendly, not displayed -->
<ul id="challenge-data" hidden aria-hidden="true">
  <li><a href="https://en.wikipedia.org/wiki/BoA"
         data-image="https://upload.wikimedia.org/wikipedia/commons/9/95/180417_%EB%B3%B4%EC%95%84_03_%28cropped%29_02.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled">BoA</a></li>
  <!-- … one <li> per challenge, 48 in seed … -->
</ul>
```

- `data-image` = canonical image URL used for `ruletype=reveal&image=` **and** for `?image=` matching on return. This is the **canonical identifier**.
- `href` = `wikipediaUrl` (English Wikipedia page) for the completed-card secondary action. Original brief used Wikimedia Commons file pages; seed uses Wikipedia.
- Display name is anchor text (`BoA`, `Eugene (actress)` … preserved verbatim).
- Alternative that also satisfies "XML format, easily editable, not a blob" while staying embedded: wrap the same 48 entries as XML verbatim inside a hidden script block:
  ```html
  <script type="application/xml" id="challenge-data" hidden>
  <?xml version="1.0" encoding="UTF-8"?>
  <challenges><challenge><name>BoA</name><imageUrl>…</imageUrl><wikipediaUrl>…</wikipediaUrl></challenge>…</challenges>
  </script>
  ```
  Either is acceptable; the `<ul hidden>` form is preferred because links remain real `<a href>` elements. Pick **one** at implementation time and drop the other.

### 6.3 Seed

48 entries from your pasted JSON are the initial content (see `revealdesign.md §15.3` for the full list). Entry is `<name>`, `<imageUrl>` (includes `utm_source`/`utm_campaign`/`utm_content`), `<wikipediaUrl>`. In HTML the `&` in `imageUrl` is escaped as `&amp;`. UTF-8, per-entry editable, no comma bookkeeping. No stub seeding beyond these 48.

### 6.4 Constraints

- No Wikimedia thumbnail requests for unsolved cards. No per-card fetch to populate mystery tiles.
- Card data is **not** the primary SEO target; the prose in `§5` skeleton is. The hidden list is coder-editable and present in source but not user-visible.

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

- Tokens: `THEME_VARS` + `SHARED_STYLES` from `src/client/styles.js` — same dark/light `—bg/—surface/—border/—text/…`, same `button` treatments. No new colour tokens.
- Theme bootstrap is the same one-liner as `arena.html` (`?theme=` or `localStorage.theme` → `document.documentElement` `theme` + `colorScheme`).
- Container: `max-width: 900px; margin: 0 auto;` as in `arena-app`.
- Typography: **Exo 200 throughout** (headings, card labels, buttons). Google Fonts `wght@200;600`; `600` only if needed for hierarchy parity.
- `<reveal-app>` renders the header inside shadow; the outer `index.html` still includes the same `<nav class="site-links">` footer outside the app (light DOM) as `arena.html`/`lobby.html` do for crawlers.

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
  <!-- SEO fallback below the grid — real HTML, view-source/crawler visible, no JS needed -->
  <section class="seo-fallback" aria-label="How to play and FAQ">
    <h2>How to play</h2>
    <ol>
      <li>Choose a mystery picture.</li>
      <li>Flip the card and tap Play.</li>
      <li>Pot balls to progressively reveal the photograph.</li>
      <li>Complete the challenge to keep the picture in your collection.</li>
    </ol>
    <h2>About Pot & Reveal</h2>
    <p>Free online billiards that progressively reveals photographs as you play. Runs in the browser, no download.</p>
    <h2>FAQ</h2>
    <h3>What is Pot & Reveal?</h3><p>…</p>
    <!-- 4–5 concise FAQs total -->
    <p class="attribution">Images from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>, individually attributed on reveal.</p>
  </section>
  <!-- Hidden challenge data is embedded here as §6 (not rendered) -->
  <!-- … <ul id="challenge-data" hidden> … 48 entries … </ul> … -->
  <nav class="site-links" aria-label="Billiards pages">…as arena.html…</nav>
  <script type="module" src="reveal.js"></script>
</body>
</html>
```

`<reveal-app>` Lit render (styled, interactive) produces: sticky `topbar`, compact intro, dense `#card-grid` (from embedded data), and the same SEO prose styled inside shadow. The light-DOM `seo-fallback` ensures a no-JS crawl (view-source) sees the prose; with JS the shadow render is the presentation.

`<head>` extras: `og:title/description/image` (one static poster, not per-card), `twitter:card`, `og:type=website`, one `VideoGame` JSON-LD block adapted from `lobby.html`, `theme-color`, `manifest` as appropriate.

---

## 9) Collection / card UI

### 9.1 Layout

- `display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 4–6px;`
  - Desktop: wall of ~20–30 cards visible without scrolling.
  - ≤380px: relax to `minmax(76px, 1fr)`.
- Card: `aspect-ratio: 3/4` (pick one of 3/4 or 1/1 and keep it), `border: 1px solid var(--border)`, `border-radius: 6px`, `overflow: hidden`, `background: var(--surface)`, tight padding. Same panel visual language as `arena-view`/`active-arenas`.

### 9.2 States (per interview)

**Mystery (unsolved):**
- No network image request. Visual `?` glyph in `var(--text-faint)`; name not shown on the card face (preserves mystery).
- A11y: card is a real `<button>` with `aria-label="Mystery picture — tap to reveal play"`. Keyboard: Space/Enter flips.

**Flipped (play affordance):**
- Card flips on tap/click/keyboard to reveal a **Play icon button** (centered `▶` + "Play"). CSS-only `transform: rotateY(180deg)` with `transform-style: preserve-3d; backface-visibility: hidden; transition: transform 220ms ease`. `prefers-reduced-motion` disables animation.
- Interaction is **flip, then press Play** — not tap-twice on the card. After flip, the Play button is focused. Tapping/clicking elsewhere does not launch.

**Completed (kept picture):**
- **Not flippable** — always shows its **locally stored thumbnail** (`data:` URL from `localStorage`), no network.
- Thumbnail + visible name underneath (`font-size: .72rem`, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`) + small completed check.
- **Three small edge icons on the card itself** (near edges to obscure minimal image): **Share**, **Replay**, **Delete**. No dialog — you explicitly asked for no modal. Icons use `replay-button`/`clipboard` patterns; Replay opens the existing replay viewer. Share copies the per-reveal share URL. Delete is deferred in behaviour (see §11) but the affordance is on the card.
- Restrained visual transition (no confetti).

### 9.3 Negative / scope

- No "Surprise me" random launcher, no extra challenge buttons — **grid is the central element**, collecting favourites like Pokémon. Grid-only in v1.
- No visible second "Picture challenges" list section.

---

## 10) Launch / return / persistence contract

### 10.1 Launch — built exactly like `lobby`

Concrete example you gave:

```
http://localhost:8080/?ruletype=reveal&image=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2F4%2F42%2F170611_%EB%9D%BC%EB%B6%90_%EC%88%98%EC%9B%90_%EC%84%B8%EA%B3%84%EB%AC%B8%ED%99%94%EC%B6%95%EC%A0%9C_%282%29.jpg
```

`reveal.js` builds **that plus the same lobby keys**, via a tiny `revealGameUrl({ imageUrl })` helper in `src/client/utils.js` alongside `gameUrl()`/`soloUrl()` reusing `BASE`/`WS_SERVER`/`appendCustom`:

```
${BASE}?ruletype=reveal&image=<encodeURIComponent(imageUrl)>
  &userId=<userStore.clientId>&userName=<encodeURIComponent(userStore.userName)>
  &lod=<lod>&flip=<flip or omitted>
  &custom.<k>=<v>…        // userStore.getCustom() via flattenCustom → custom.cue.colour etc.
  &lobbyUrl=<WS_SERVER>  // when _localhost
```

Add `export const revealGameUrl = ({ imageUrl, userId, userName, lod, flip, custom }) => { … }` mirroring `soloUrl`/`gameUrl` logic. Launch is a **full navigation** (`window.location.href = url`) — `window.open`/iframe not used. This preserves the tab; game controls the return.

### 10.2 Return — `?image=` indicates success

> "the response will have that image url as a query param indicating success, no success returns with no param"

- **Success:** game redirects back to `/reveal/` with `?image=<encodeURIComponent(same wikimedia imageUrl)>` present (potentially with extra params like `&replay=` in future, but `image` alone is the success signal).
  ```
  https://billiards.tailuge.workers.dev/reveal/?image=https%3A%2F%2Fupload.wikimedia.org%2F…%2FFile.jpg…
  ```
- **No success / incomplete / abandoned:** no `?image=` — page does nothing.

Algorithm on load (`reveal.js`, Lit `connectedCallback` / `firstUpdated`):

1. Read `?image=` via `new URLSearchParams(location.search).get('image')`. If absent, stop.
2. **Exact-match** that value (after `decodeURIComponent` and unescaping `&amp;`) against the **`data-image` values in the embedded hidden list** (`#challenge-data`). If no entry matches exactly, **ignore** — do not create a card from the param alone, do not fetch. (You asked for exact match; data may need tidy-up to be clean URLs — spec enforces exact so a stray param cannot mint a card. Normalization like stripping `utm_*` is explicitly not done; fix is to clean the seed data.)
3. On match, `fetch(imageUrl)` **once** (already hot/CDN-cached from the game), decode as `Image` with `crossOrigin="anonymous"` (Wikimedia sends `Access-Control-Allow-Origin:*`), draw to an offscreen `<canvas>` at small size, export `canvas.toDataURL('image/webp', 0.6)` (fallback to `image/jpeg` if WebP unsupported / tainted).
4. Persist the completed card (see §10.4). On any failure (fetch error, taint, quota) → **return card to unsolved state** (i.e. do not persist), `console.log` the cause, **no fuss, no user-visible notification** (your stated preference for both thumbnail and XML-fetch failures).
5. `history.replaceState` to strip `?image=` (and any `&replay=`) so refresh does not re-award.

If in future the game also returns `&replay=`/`replayId=` alongside `?image=`, store it as `replayUrl` on the card so Share/Replay have a per-reveal URL.

### 10.3 Thumbnail

- Generated **only after completion** from the already-loaded `imageUrl`. No thumb for unsolved cards, no second fetch for displaying completed cards.
- Target longest edge 160–200px (covers 2× DPR on an 84–100px card), WebP quality 0.6 → ~8–14 KB per card as data URL.
- Never store full-res source. Completed display uses only the local `thumb:` data URL.

### 10.4 `localStorage` schema — capped collection

- Key: `reveal:collection` (propose this one; `potRevealCollection` alias in `§8` of `revealdesign.md` is superseded).
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
    "replayUrl": "https://…/api/match-replay?id=…&…"
  }
]
```

- `id` derived from `<name>` (slugify) or from the matched entry; used for dedup and stable key. Duplicate name collisions (e.g. multiple "Lee" variants) are disambiguated by distinct `imageUrl`/`wikipediaUrl` — `id` must be unique per entry.
- On success: if an entry for `id` already exists, move to front (update `thumb`/`replayUrl` if provided); else `unshift`. If `length > 20`, `pop` oldest. Wrap `localStorage` + `JSON.parse` in `try/catch`; on `QuotaExceededError` drop oldest and retry once. Never throw to user. No partial progress persisted; unsolved cards are not stored.

---

## 11) Completed-card actions (icons on the card, no dialog)

Per your last answer, a solved card:

- Always shows its thumbnail (not flippable).
- Exposes three small icons **on the card near edges** (Share, Replay, Delete) without overly obscuring the image.

**v1:**
- **Share** — copies the per-reveal share URL (`replayUrl` if present) via `navigator.clipboard.writeText`, fallback to selection. One reveal only; no whole-collection share.
- **Replay** — opens the existing replay viewer (`<replay-button url>` pattern, reusing `src/client/replay-button.js` + `replayUrl()` + `userStore` identity). If no `replayUrl` yet (game does not return it), the icon is muted/hidden.
- **Delete** — deferred hook. Spec the affordance (icon + handler slot) but v1 may no-op or remove from `localStorage` and re-render grid only. You are still deciding between a **"new deck" button** (clear/reset collection when all 48 are completed) and **per-card delete** to curate a favourite Pokémon-like collection. Spec therefore requires:
  - `localStorage` API to already support `remove(id)` and `clear()`.
  - Card renders a Delete affordance with `aria-label="Remove from collection"` even if handler is initially `console.log`/no-op, so styling/metrics can be verified without committing to destructive v1 behaviour.
  - "New deck" (if kept) is a single button below the grid or in a future settings slot, not per-card, resetting `reveal:collection` after confirmation.

This satisfies "build up favourite card collection" while leaving the destructive choice reversible.

---

## 12) Styling (following `arena.html`, via Lit)

- `reveal.js` imports `THEME_VARS`/`SHARED_STYLES` from `src/client/styles.js` — same pathway as `tournament/arena.js`.
- Exo 200 everywhere; headings small (`h1 ~1rem`, `h2 ~0.85rem`, `letter-spacing: .06em`, uppercase if needed to match `arena-view`).
- Tight vertical rhythm: `gap: .4rem`, section padding `.4rem` inside panel-like cards where appropriate, no large hero/whitespace.
- Flip, thumbnail, icon treatments reuse `SHARED_STYLES` button variants (`.btn-challenge` for Play, muted `.btn-leave`-like for Delete).
- `prefers-reduced-motion` disables flip; cards are real `<button>`s with `aria-pressed`/`aria-label`, keyboard operable (`Space`/`Enter`), focus rings via `button:focus-visible`.
- Mobile: grid stays dense (no single-column wall), icons keep `min-height: 28px` tap targets, detail-less (no dialog) keeps mobile simple, `max-width: 92vw` for any future overlay.

---

## 13) Localization

- English only today. Architecture ready for:
  ```
  /reveal/       # en (this page)
  /reveal/ko/    # same Lit bundle, translated index.html (SEO prose + UI strings)
  /reveal/de/ …
  ```
- Same `reveal.js` bundle for all; language-specific text stays in HTML. Any JS string that must appear (e.g. "Copied!") reads from `data-i18n-*` on the HTML rather than hard-coding.

---

## 14) Dependencies & reuse

- **Lit everywhere** (per your instruction this project can use Lit — header and panels can be pulled in to reuse the same pathways).
- Reuse: `user-store.js` (`clientId`/`userName`/`lod`/`flip`/`custom`), `user-badge` + `trophy-item` + `settings-modal`, `replay-button`, `utils.js` (`revealGameUrl` + `BASE`/`WS_SERVER`/`appendCustom`/`lobbyUrl`), `styles.js` tokens.
- No new deps, no analytics, no extra framework. Subtle flip animation only.
- Game is in the Workers deployment (`BASE`) and `../billiards` sister project — this repo only builds the reveal collection page and the launch/return contract.

---

## 15) Seed data (embedded — not fetched)

The 48 entries you pasted (BoA … Shannon Bae) are the v1 content. Each carries `<name>`, `<imageUrl>` (upload/thumb.wikimedia, includes `utm_*`), `<wikipediaUrl>`. In the HTML-embedded form (`§6`) each is one `<li>`; the XML representation from `revealdesign.md §15.3` (one `<challenge><name>/<imageUrl>/<wikipediaUrl>`) is the editable source shape if the script/embedded-XML variant is chosen. Keep diffs per-entry, `&amp;` for `&`, UTF-8.

No seeding, no stub, no randomization beyond `§9.1` "Fixed XML order" (you picked fixed order over seeded/random shuffle — collection order is the source order; completed cards pin to front by recency).

---

## 16) Error & edge handling

| Case | Behaviour |
|---|---|
| `?image=` absent on return | No persistence, no thumb, no message. |
| `?image=` present but matches no embedded entry | Ignore — no card minted, console log, no UI. You said data may need tidy-up; matching stays exact so a bad param cannot create a phantom card. |
| Thumbnail generation fails (fetch CORS taint, network, decode) | Return card to unsolved, `console.log`, no toast/banner. |
| `localStorage` quota exceeded | Drop oldest entry and retry once; if still full, unsolved (log). |
| `imageUrl` contains encoded Korean filename (`%EB%9D…`) | `decodeURIComponent` before compare; `encodeURIComponent` on launch (already via helper). |
| Challenges list empty/missing from DOM | Grid stays empty; `console.error` + log; no visible "Pictures unavailable" error UI (your "silent blank + log" preference for data failures; grid simply shows no cards until the embedded list is present). |
| User with JS disabled | SEO prose still visible (direct HTML fallback); grid not rendered — accepted, as you said assume JS for the game. |

---

## 17) Observability / logging

- Silent failures log to `console.log`/`console.error` only. No user-facing banners for save/fetch failures.
- No analytics events in v1.

---

## 18) Open items (not blocking v1)

1. **Replay/share on return** — does the game also return a replay URL/ID alongside `?image=` on success for the Share/Replay icons? If yes, what param name? Until then, those icons render muted/hidden and cards persist with `thumb` + `name` only.
2. **Delete vs new deck** — you are undecided; v1 specs both as hooks (per-card Delete icon exists, New-deck button slot exists below grid) with non-destructive or log-only handlers. Promote to real behaviour in a follow-up without layout change.
3. **Attribution granularity** — seed gives `wikipediaUrl` (English Wikipedia), not Wikimedia Commons file pages. Completed-card secondary link is "View on Wikipedia" (unobtrusive). A dedicated Commons attribution/licence line can be added once the game supplies it.
4. **ImageUrl hygiene** — seed URLs include `utm_source` etc. Keep as-is for exact matching, or clean to canonical origin+path if you later prefer stripping `utm_*`. Spec freezes on exact match; cleanup is a data edit.

---

## 19) Verification

Not code in this step. When implementation follows:

- `src/client/reveal/index.html` SEO prose is grep-visible in view-source without JS.
- `npx esbuild src/client/reveal/reveal.js --bundle` succeeds; `docker/html/reveal.js` + `reveal.html` served by nginx `location /`.
- `npm run lint` + `npx oxfmt` pass.
- `npm run screenshot:iphone` / Playwright: header matches `arena.html` (logo + version + trophy + user-badge), grid is dense and tight, explanation sits below grid, no visible duplicate list, completed cards show thumb + edge icons without obscuring image.

---

## 20) Sources

- `revealdesign.md` (§§1–15, prior review fixes: Lit+esbuild as lobby, `revealGameUrl` with `&userId&userName&lod&flip&custom.*&lobbyUrl`, SEO prose direct HTML, sitemap owned by `../billiards`, hidden challenge data, `?image=` success).
- User clarifications 2026-09-23: concrete `ruletype=reveal&image=` URL, `?image=` absent = no success, "no per-challenge pages" = single `/reveal/`, hidden data element not visible, XML-not-blob editable, no seeded stubs → later 48 seed, Lit allowed, crossdeploy to `../billiards`, no no-JS grid, no sitemap here, flip→Play button not tap-twice, thumbnail generated on reveal page, fixed XML order, exact `?image=` match, full-page navigate, cap 20 vs favourite-collection tension (new-deck/delete deferred hooks), completed card icons on card near edges (Share/Replay/Delete, no dialog), grid-central + concise prose below, challenges embedded hidden HTML not fetched.
