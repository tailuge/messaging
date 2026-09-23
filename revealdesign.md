# Pot & Reveal — Design Doc

> **Scope of this doc:** design only, no code. Covers the new English-only `src/client/reveal` page — an HTML-first, immediately-playable billiards picture-reveal collection that reuses the existing billiards/replay/share stack and follows `arena.html` / `lobby.html` visual language. First task is this doc; implementation follows after approval.

---

## 1) Goal

A lightweight, SEO-friendly, mobile-friendly page at `src/client/reveal` (single v1 page, no per-challenge pages yet) that:

- feels embedded in the existing site, not a marketing site
- puts the **mystery-card collection + Play** above the fold so a returning player can start without scrolling
- carries the main explanatory copy as **real HTML directly in the page** (How to play / About / FAQ / attribution) so crawlers without JS can identify the page — interaction (card grid) assumes JS is present, copy does not
- reuses the existing reveal/billiards game and replay/share infrastructure (external Workers game) — this repo does **not** re-implement the game
- builds with the **same Lit + esbuild strategy as `lobby`** so header islands and URL helpers reuse existing pathways, with styling following `arena.html` (logo + `user-badge`, trophy, version, theme)
- persists only completed cards (max 20, small local thumbnails, `localStorage`)

---

## 2) Non-goals (v1)

- No per-challenge landing pages — v1 is a **single collection page** (`/reveal/`). The original prompt suggested a crawlable list like `/reveal/kim-yuna/`, `/reveal/iu/` and future individual SEO pages per person; v1 skips that and keeps one page with one semantic `<ul>` of challenges. Per-person pages can be added later without changing this page's contract.
- No daily/streak/daily-challenge mechanic. Pictures are available in any order.
- No account/login or analytics.
- No partial-reveal persistence. Only completed cards are persisted.
- No separate marketing hero, large whitespace, or heavy JS framework.

---

## 3) Where it lives (proposed)

```
src/client/reveal/
  index.html      # canonical English page — semantic HTML shell with SEO copy directly in HTML (JS assumed for grid)
  reveal.js       # Lit entry (e.g. <reveal-app>) — bundled with esbuild like src/client/lobby.js; reuses header islands & utils
  challenges.xml  # hidden XML data (see §15) — one <challenge> per entry, fetched at runtime to build #card-grid, not rendered
```
Styling/CSS lives with the Lit component (imports `THEME_VARS`/`SHARED_STYLES` from `src/client/styles.js`); no standalone `reveal.css` — same pattern as `lobby`/`arena` where CSS is in JS.

Build/deploy follows the **same strategy as `lobby`** (`package.json:build:lit` / `build`):

```
npx esbuild src/client/reveal/reveal.js --bundle --minify --outfile=docker/html/reveal.js
cp src/client/reveal/index.html docker/html/reveal.html   # or docker/html/reveal/index.html for /reveal/ (nginx `index index.html`)
mkdir -p docker/html/reveal && cp src/client/reveal/challenges.xml docker/html/reveal/challenges.xml
```
Docker serves it via `location / { root /usr/share/nginx/html; index index.html; }` (`COPY html/ /usr/share/nginx/html/` in `docker/Dockerfile`). Later, `crossdeploy` will mirror it into the sister project `../billiards` (the game repo) — e.g.:
```
npx esbuild src/client/reveal/reveal.js --bundle --minify --outfile=../billiards/dist/reveal.js
cp src/client/reveal/index.html ../billiards/dist/reveal.html
mkdir -p ../billiards/dist/reveal && cp src/client/reveal/challenges.xml ../billiards/dist/reveal/challenges.xml
```
Sitemap is managed by that other project — not handled here.

- Canonical URL: `https://billiards.tailuge.workers.dev/reveal/` with `<link rel="canonical">` — single English URL for v1.
- Future locales reuse the same Lit bundle:
  ```
  src/client/reveal/ko/index.html
  src/client/reveal/de/index.html
  ```
  where only the HTML copy (SEO prose) is translated.

Game URL shape is concrete (your example in §8 below); `challenges.xml` supplies the image URLs and `revealGameUrl()` builds `&userId&userName&lod&flip&custom.*&lobbyUrl` exactly like `gameUrl()`/`soloUrl()` in `utils.js`. Challenge entries are in `§15` — not seeded inline.

---

## 4) Visual reference — header (mirrors `arena.html`)

Reuse the site's existing header, not a bespoke one. Compare:

- **Lobby** (`src/client/lobby.js`): `.topbar` with `.topbrand` logo (32px, `filter: grayscale(100%)` / `opacity .7` → `1` on hover), `h1` with "Billiards" + version pill `formatVersion(CLIENTVERSION)`, `<trophy-item>`, `<user-badge>`, `<settings-modal>` for theme switcher.
- **Arena management** (`src/client/tournament/arena.js` + `arena.html`): same `.topbar` pattern, **additionally** "Back to lobby" button, sticky `topbar` (`position: sticky; top: 0; background: var(--bg)`), container `max-width: 900px` centred, `font-family: 'Exo'` throughout.

**Reveal header = arena header adapted:**

```html
<header class="topbar">
  <a href="./lobby.html" class="topbrand" aria-label="Billiards lobby">
    <img src="../assets/threecushion.png" class="logo" alt="">
  </a>
  <h1>
    <a href="./lobby.html">Billiards</a>
    <a href="https://github.com/tailuge/billiards" class="version" …>vX.XX</a>
  </h1>
  <trophy-item></trophy-item>
  <user-badge></user-badge>
  <settings-modal @theme-changed=…></settings-modal>
  <!-- or minimal "Back to lobby" button if we don't want the full settings modal on this page -->
</header>
```

- Import maps: reuse `THEME_VARS` (+ `SHARED_STYLES` for buttons) from `src/client/styles.js` so dark/light mode, borders, and button treatments stay identical. No new colour tokens.
- Theme script is the same one-liner as `arena.html` (read `?theme=` or `localStorage.theme`, set `document.documentElement` `theme` + `colorScheme`).
- Page wrapper: `.container { max-width: 900px; margin: 0 auto; }` — same as `arena-app`.
- Font: `Exo 200` everywhere on this page (headings, card labels, buttons). Arena/lobby use `Exo 200` with occasional `600` for `panel-title`; reveal will use `200` for the collection + body copy and `600` only if needed to keep hierarchy consistent with the site's conventions. The Google Fonts link stays `wght@200;600`.

Why this matters: crawlers and users see the same brand chrome as everywhere else, and we get dark-mode for free.

---

## 5) Priority order & page skeleton (HTML-first)

**Above the fold:** title → compact description → game collection (the dominant visual).
**Below the fold:** explanatory SEO copy → attribution/footer.

This avoids the anti-pattern `H1 → huge paragraph → instructions → FAQ → finally the game`.

Skeleton (`src/client/reveal/index.html`) — SEO prose is **direct HTML** (crawler-visible without JS); grid is a Lit app (JS assumed, like lobby):

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pot & Reveal — Play billiards to uncover hidden pictures</title>
  <meta name="description" content="Free online billiards picture-reveal: pot balls to progressively uncover hidden photographs. No download.">
  <link rel="canonical" href="https://billiards.tailuge.workers.dev/reveal/">
  <link rel="preconnect" href="https://fonts.googleapis.com">… Exo 200;600
  <link rel="icon" href="../assets/threecushion.png">
  <script>/* same theme bootstrap as arena.html (read ?theme or localStorage.theme) */</script>
</head>
<body>
  <h1 hidden>Pot & Reveal — billiards picture-reveal game</h1>
  <reveal-app></reveal-app>
  <!-- Fallback SEO prose below the fold — real HTML, no JS needed for crawlers.
       Also rendered inside <reveal-app> shadow for styled layout, but duplicated here
       in light DOM so a no-JS crawl (or view-source) sees it. -->
  <section class="seo-fallback" aria-label="How to play">
    <h2>How to play</h2>
    <ol><li>Choose a mystery picture…</li>…</ol>
    <h2>About Pot & Reveal</h2><p>Free online billiards… runs in the browser, no download…</p>
    <h2>FAQ</h2>
    <h3>What is Pot & Reveal?</h3><p>…</p>
    …
    <p class="attribution">Images from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>, individually attributed on replay.</p>
  </section>
  <!-- Hidden XML data is NOT inlined — separate file src/client/reveal/challenges.xml
       fetched by reveal.js to build the card grid (see §7/§15). -->
  <nav class="site-links" aria-label="Billiards pages">…shared footer like arena.html…</nav>
  <script type="module" src="reveal.js"></script>
</body>
</html>
```
`<reveal-app>` (Lit, bundled via esbuild — same pathway as `<lobby-app>`/`<arena-app>`) renders: sticky `topbar` header (logo + version + `trophy-item` + `user-badge` + `settings-modal`), compact intro (`Pot & Reveal` + one-line description), the dense `#card-grid` (built from `challenges.xml`), and the same SEO prose styled inside shadow. The light-DOM `seo-fallback` above ensures crawl without JS; with JS the Lit render is the styled, interactive presentation.

Key choices (per your instructions):

- **SEO copy is direct HTML** — How to play / About / FAQ / attribution live verbatim in `index.html`, not injected by JS, so crawlers without JS identify the page. No `no-JS` fallback for the card grid is needed (JS always present for the game); the grid is JS-only and built from `challenges.xml`.
- **Project can use Lit** — header and panels reuse the same Lit components/pathways as `lobby` (`user-badge`, `trophy-item`, `settings-modal`, `THEME_VARS`/`SHARED_STYLES`, `user-store`, `utils.js`). Reveal is not a plain-HTML island; it is a small Lit app like `arena`.
- **The mystery-card grid is the only visible collection UI** — challenge links stay in `challenges.xml` (hidden from the user, §7/§15), not as a second visible `Picture challenges` list. The explanatory prose below the game is the crawlable text.
- Text is semantic (`h2`/`h3`/`ol`/`p`), concise, not keyword-stuffed — priority order stays intro → game/collection → explanatory copy.

---

## 6) Collection / card UI

### Dense, small-card grid

- `display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 4–6px;`
  - Desktop: a wall of ~20–30 cards visible without scrolling.
  - Mobile: natural dense grid (not full-width panels). Media query relaxes `minmax` to ~76px on ≤ 380px.
- Cards: `aspect-ratio: 3 / 4` (or 1:1 — pick one and keep it), `border: 1px solid var(--border)`, `border-radius: 6px`, `overflow: hidden`, `background: var(--surface)`, tight padding.
- Shared row: uses the same panel/visual language as `arena-view` / `active-arenas`.

### Three states

1. **Mystery (unsolved)** — no network image request at all.
   - Visual: subtle pattern or `?` glyph in `var(--text-faint)`, no name (to preserve mystery). Name stays only in the SEO list lower on the page, not on the card face.
   - A11y: card is a `<button role="listitem" aria-label="Mystery picture — tap to reveal play">`.

2. **Flipped (revealed play affordance)** — still compact.
   - On click/tap/keyboard (Space/Enter) the card flips (CSS only: `transform: rotateY(180deg)` with `transform-style: preserve-3d; backface-visibility: hidden; transition: transform 220ms ease`).
   - Back face: centered `▶` + "Play" (button). No modal or large menu.
   - Interaction is a class toggle (`is-flipped`) — one line of JS. Flip respects `prefers-reduced-motion` (no animation).
   - After flip, "Play" is focused for keyboard users.

3. **Completed (thumbnail)** — locally stored image.
   - Shows `img` from localStorage (data URL), `alt=""`-ish with visible name underneath (`font-size: .72rem`, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`), small "completed" check/tick.
   - Visually rewarding but restrained (no confetti).

### Click targets

- Mystery → flip on the card itself.
- Flipped → "Play" button launches the game.
- Completed → opens compact detail/replay view (see §8). Completed cards do **not** flip.

---

## 7) Challenge data & SEO contract (hidden XML, SEO prose in HTML)

- **Challenge entries** live in a **separate, hidden, coder-editable XML file** `src/client/reveal/challenges.xml` (see §15) — one `<challenge><name>/<imageUrl>/<wikipediaUrl>` per entry (48 in seed). It is **not visible to the end user** and **not inlined as a visible list** in `index.html`; the page fetches it at runtime (`fetch('challenges.xml')` + `DOMParser`) to build `#card-grid`. Editing is per-entry (add/remove one `<challenge>` block), `&amp;` escaped, UTF-8 — not a JSON blob.
  - `<imageUrl>` = canonical Wikimedia (or `thumb.wikimedia`) image URL used for `ruletype=reveal&image=` launch and for `?image=` success matching (§8). **Canonical identifier** (slug is derived from `<name>` if needed).
  - `<wikipediaUrl>` = English Wikipedia page (secondary, for completed-card “View on Wikipedia” link).
  - Not a JSON array; XML keeps diffs per-line-per-field and validates with any XML tool. Copied verbatim by the build (see §3).
- **SEO text** (How to play / About / FAQ / attribution) is **real HTML directly in `index.html`** (light-DOM fallback + Lit shadow render) so crawlers without JS can identify the page — this is your main requirement. Card data (names/URLs) is not required to be crawlable as prose; the prose is the entry point. The `challenges.xml` fetch is JS-only by design (you said assume JS for the game).
- The **only visible collection is the Lit-built mystery-card grid** (`#card-grid`). No second visible “Picture challenges” list section.
- No Wikimedia thumbnail requests for the collection. No per-card fetch for mystery tiles.
- `<head>` SEO: `title`, `description`, `canonical`, `og:title/description/image` (single static poster, not per-card), `twitter:card`, `og:type=website`, one `VideoGame` JSON-LD block (as in `lobby.html`) adapted for Pot & Reveal, `robots=index,follow`. Sitemap is managed by the sister `../billiards` project — not handled here.
- "No per-challenge pages" means: v1 is **only `/reveal/`** — we are not creating `/reveal/<slug>/` per person. That idea is deferred.

---

## 8) Play / completion / persistence contract

### Launch — concrete (from your example, built as lobby does)

You provided the canonical game URL:

```
http://localhost:8080/?ruletype=reveal&image=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2F4%2F42%2F170611_%EB%9D%BC%EB%B6%90_%EC%88%98%EC%9B%90_%EC%84%B8%EA%B3%84%EB%AC%B8%ED%99%94%EC%B6%95%EC%A0%9C_%282%29.jpg
```

For v1 the reveal page builds **that shape plus the same lobby params as `gameUrl()`/`soloUrl`** (per your review response), using the same `BASE` switching as `src/client/utils.js` (`http://…:8080/` locally, `https://billiards.tailuge.workers.dev/` in prod):

```
${BASE}?ruletype=reveal&image=<encodeURIComponent(wikimedia imageUrl)>
  &userId=<userStore.clientId>&userName=<encodeURIComponent(userStore.userName)>
  &lod=<lod>&flip=<flip or omitted>
  &custom.<k>=<v>…        // from userStore.getCustom(), via appendCustom (dot-notation flatten)
  &lobbyUrl=<WS_SERVER>  // when _localhost, same as soloUrl
```

- Implementation adds a tiny `revealGameUrl({ imageUrl })` helper in `src/client/utils.js` alongside `gameUrl()`/`soloUrl()` — same `BASE`/`WS_SERVER`/`appendCustom`/`lobbyUrl` pathway, not a one-off concatenation — so it reuses tested code and matches the `../billiards` game’s expected keys (`&userId&userName&lod&flip&custom.*&lobbyUrl` exactly as you specified).
- Launch is a **navigation** (`window.location.href = url`), same as solo/arena — not an iframe/modal.
- A challenge entry is `<imageUrl>` from `challenges.xml` (canonical identifier for `&image=` and for `?image=` return matching, §15). Display `<name>` is for the completed card label; slug is derived if needed.

### Return / completion — concrete (from your example)

> "the response will have that image url as a query param indicating success, no success returns with no param"

Interpreted as:

- **Success:** game redirects back to the reveal page with `?image=<encodeURIComponent(same wikimedia URL)>` preserved in the URL. Example:
  ```
  https://billiards.tailuge.workers.dev/reveal/?image=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2F4%2F42%2F170611_…jpg
  ```
  (If the game also returns a replay/share param, e.g. `&replay=` or `&replayId=`, it will be read as well — see below — but the presence of `image` alone is the success signal per your description.)
- **No success / incomplete / abandoned:** game returns to the reveal page **without** an `image` param (or navigates elsewhere). The reveal page does nothing — no persistence, no thumbnail, no state change.

- `reveal.js` (Lit) on load: if `?image=` is present, it **matches that image URL** against `<imageUrl>` values in `challenges.xml` (decoded, `&amp;` unescaped) to resolve the challenge name. It then `fetch`es that Wikimedia image **once** (already hot from the game), draws it to an offscreen `<canvas>` with `crossOrigin="anonymous"` (Wikimedia sends `Access-Control-Allow-Origin:*`; on taint fallback to persist without thumb), exports `canvas.toDataURL('image/webp', 0.6)` (fallback `image/jpeg`), and persists the completed card. After persisting it calls `history.replaceState` to strip the query param(s) so refresh doesn't re-award. If `?image=` is absent, nothing happens.
- If the game ever adds a `replay`/`replayId` param alongside `image`, `reveal.js` will store it as `replayUrl` on the persisted card so the detail view can offer **Replay reveal** / **Share replay** (reusing `replay-button` / `replayUrl()`). If no replay param is returned, the card still persists as completed with just the thumbnail + name — replay/share simply won't be shown until the game provides it.

### Thumbnail generation

- Produce the thumbnail **only after completion**, from the already-loaded `data-image`. No separate thumbnail request for unsolved cards, no unsolved thumbnails.
- Size: target longest edge ~160–200px (fits card at `devicePixelRatio` 2 without being heavy), WebP, quality ~0.6. Budget: ~8–14 KB per card as a data URL, so 20 cards stay well under localStorage limits.
- Do **not** store full-res source. Do **not** make a second fetch for collection display of completed cards.

### localStorage schema (cap 20, most recent first)

- Key: `potRevealCollection` (or `reveal:collection` — pick one; doc proposes `reveal:collection` to match `arena_*` namespacing).
- Value: JSON array, newest first, trimmed to 20 on write.

  ```json
  [
    {
      "id": "son-heung-min",
      "name": "Son Heung-min",
      "wikimediaPage": "https://commons.wikimedia.org/wiki/File:…",
      "imageUrl": "https://upload.wikimedia.org/…/File:….jpg",
      "thumb": "data:image/webp;base64,…",
      "completedAt": 1717000000000,
      "replayUrl": "https://…/api/match-replay?id=…&…"
    }
  ]
  ```

- On return, new entry is `unshift`ed; if an entry for `id` already exists it is moved to front (update thumb/replay if provided). If `length > 20`, `pop` the oldest.
- Guard: quote `try/catch` around `localStorage` + `JSON.parse`, and on `QuotaExceededError` drop the oldest entry and retry. Never throw to the user.
- No persistence of partial progress. Unsolved cards are not stored.

---

## 9) Completed-card detail / replay

Clicking a completed card opens a compact `<dialog>`:

- Large-ish local thumbnail (reusing the stored data URL — no network).
- Name/title.
- **Replay reveal** — `<replay-button url="…">` reusing `src/client/replay-button.js` + `replayUrl()` pattern. The URL is the `replayUrl` stored at completion (or composed from `replayId`). Opens the existing replay viewer.
- **Share replay** — same URL, with a **Copy link** button (`navigator.clipboard.writeText`, fallback select). This is a per-reveal share (shot-by-shot replay), not whole-collection sharing — matches the existing game share model.
- **View on Wikimedia** — small secondary link to the `wikimediaPage`. Unobtrusive, not front-and-centre.
- Attribution line: "Image: Wikimedia Commons / <author> / <license>" — muted, below the actions.

Closed with Esc, click outside, or close button. Focus is trapped in the dialog (native `<dialog>` handles this).

---

## 10) Styling (following `arena.html`, via Lit)

- **Single source:** `reveal.js` imports `THEME_VARS`/`SHARED_STYLES` from `src/client/styles.js` (same tokens as lobby/arena: `--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--text-dim`, `Exo`) so reveal never drifts — same pathway as `tournament/arena.js`. Button treatments reuse SHARED_STYLES (`.btn-challenge`-like “Play” on the flipped face, `.btn-leave`-like “Cancel flip”).
- **Exo 200 throughout** — headings, card labels, buttons. Headings are small (`h1 ~1rem`, `h2 ~0.85rem` with `letter-spacing: .06em; text-transform: uppercase` if needed to match `arena-view`'s `h1` treatment).
- **Tight vertical rhythm** — page `gap: 0.4rem`, section `padding: 0.4rem` inside `.panel`-like cards where needed, minimal outer margin. Avoid giant hero.
- **Explanatory copy** is deliberately **after** the collection; no large intro paragraph before the game. The intro is 1–2 lines.
- **Accessibility:** flip cards are real `<button>`s, `aria-pressed` / `aria-label`, keyboard operable, focus rings via `button:focus-visible` from `SHARED_STYLES`, motion respects `prefers-reduced-motion`.
- **Mobile:** grid stays dense (no single-column wall), detail dialog is `max-width: min(28rem, 92vw)`, buttons have `min-height: 28px` for tap targets.

---

## 11) Localization (English only today, architecture for tomorrow)

As requested: keep language-specific text in **HTML**, not in a JS translation object, so future pages can translate by copying HTML.

- `reveal.js` / `reveal.css` are language-agnostic: they read labels they need from `data-*` or from the SEO list's anchor text, and all UI verbs that must be translated ("Play", "Surprise me", FAQ copy, titles) live in `index.html`.
- If a JS string must appear (e.g. "Copied!"), it reads it from a `data-i18n-*` attribute on the HTML rather than hard-coding.
- Future routing (as you listed):
  ```
  /reveal/       # en (this page)
  /reveal/ko/
  /reveal/de/
  /reveal/tr/
  /reveal/nl/
  ```
  all share `../reveal.css` + `../reveal.js`. No per-locale JS bundle.

---

## 12) Dependencies & reuse (Lit, same pathways as lobby)

- **Project can use Lit** — `reveal.js` is a Lit component (`<reveal-app>`) bundled with esbuild, same toolchain as `lobby.js`/`arena.js`. It reuses existing Lit islands/pathways: `userStore` (`user-store.js`) for `clientId`/`userName`/`lod`/`flip`/`custom`, `user-badge` + `trophy-item` + `settings-modal` for the header, `replay-button` for replay/share, and `utils.js` (`revealGameUrl` alongside `gameUrl()`/`soloUrl()`, same `BASE`/`WS_SERVER`/`appendCustom`/`lobbyUrl` logic). SEO prose stays as direct HTML in `index.html` (not Lit-rendered), card/grid logic is Lit — exactly your requested split.
- **No new deps.** No analytics, no extra framework. Subtle flip animation only; otherwise no decorative motion.
- **Existing reveal/game:** inspected — this repo has no `reveal` game code today (no `File:` or `wikimedia` references outside this design). The game is on the Workers deployment (`BASE` in `utils.js`, `../billiards` sister project). The design therefore keeps the game out of this repo and only specifies the launch/return contract above.

---

## 13) Open contracts — updated after your concrete URL

- **Launch/return contract is now pinned:** `ruletype=reveal&image=<encoded wikimedia URL>` to launch; success is signalled by `?image=` on return, absence means no completion. No further param-name confirmation needed for `image`.
- Remaining small clarifications before implementation:
  1. **Challenge list** — you will supply it separately (no stubs). For each entry we need: display name + canonical Wikimedia image URL (used as `data-image` and as the key for matching the `?image=` return). A `data-challenge` slug + optional Commons page URL are nice-to-have but not required for correctness. Drop it in as real `<li><a …>` entries inside `#challenge-data` when ready.
  2. **Replay/share on return** — does the game also return a replay URL/ID alongside `?image=` on success (for the completed-card **Replay reveal** / **Share replay** buttons)? If yes, what is the param name? If not, v1 will persist completed cards with thumbnail + name only, and replay/share will be added when the game provides it.
  3. **Return threshold for "completed"** — does the game consider completion = all balls potted / break finished, or a looser threshold? Not needed for persistence (the page just trusts `?image=`), but useful for the FAQ wording.

---

## 14) Verification checklist

- No code in this step — just this doc for review.
- After you approve, the implementation PR will:
  - add `src/client/reveal/index.html` (SEO prose directly in HTML) + `src/client/reveal/reveal.js` (Lit `<reveal-app>`, `THEME_VARS`/`SHARED_STYLES`) + `src/client/reveal/challenges.xml` (§15, 48 entries)
  - wire `package.json:build:lit`/`build` with the same esbuild pathway as lobby (`esbuild reveal.js --bundle --minify --outfile=docker/html/reveal.js` + `cp reveal/index.html` + `challenges.xml`; `docker/Dockerfile` already `COPY html/ /usr/share/nginx/html/` serves it; later `crossdeploy` mirrors to `../billiards/dist/`), and ensure `docker/html/reveal/` is not ignored (adjust `.gitignore` or keep `docker/html` ephemeral)
  - pass `npm run lint` and `npx oxfmt` / `prettify`
  - verify `npm run screenshot:iphone` (or Playwright) shows the header + dense card wall + tight spacing on iPhone 15 size

Future per-person SEO pages (if we ever want `/reveal/<slug>/` for a person) can be added as thin static HTML shells reusing the same bundle once v1 is live — but v1 has only `/reveal/` (sitemap owned by the sister project).

---

## 15) Addendum — Seed challenge data (XML, hidden, coder-editable)

You supplied 48 entries as a JSON blob. Per your latest instruction they are **not a visible list and not an inline JSON blob** — they live as a **separate, human-editable XML file** that is hidden from the end user but trivial for a coder to edit (one `<challenge>` per person, diff-friendly, no giant array to scroll).

### 15.1 File

```
src/client/reveal/challenges.xml   # source of truth — one <challenge> per entry
```

Copied verbatim by the build (`cp src/client/reveal/challenges.xml docker/html/reveal/challenges.xml`, see §3). Not inlined into `index.html`, so `index.html` stays small and the data stays independently editable. The reveal page fetches it at runtime (`fetch('challenges.xml')` + `DOMParser`) to build `#card-grid`; until the fetch completes the grid is empty (intentionally — no visible fallback list). A `<link rel="alternate" type="application/xml" href="challenges.xml">` in `<head>` makes the file discoverable without rendering it.

Why XML, not JSON: validates with any XML tool, each field has an explicit tag (no quoting/escaping surprises), and Git diffs are per-line-per-field rather than per-blob.

### 15.2 Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<challenges>
  <challenge>
    <name>BoA</name>
    <imageUrl>https://upload.wikimedia.org/…</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/BoA</wikipediaUrl>
  </challenge>
  …
</challenges>
```

- `<name>` — display name as on Wikipedia (preserved verbatim, including parentheses like `Eugene (actress)`).
- `<imageUrl>` — canonical Wikimedia image URL used for `ruletype=reveal&image=` launch and for `?image=` success matching (§8). Contains `&` which is escaped as `&amp;` in XML.
- `<wikipediaUrl>` — English Wikipedia page (secondary, for the completed-card “View on Wikipedia” link; not Wikimedia Commons file page, so no separate `page` vs `wikipediaUrl` confusion).
- No attributes for the long URLs (avoids attribute-escaping), no CDATA, no `<challenge id="…">` — slug can be derived from `<name>` if needed.

### 15.3 Full seed file (48 entries)

Drop the following as `src/client/reveal/challenges.xml` verbatim:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<challenges>
  <challenge>
    <name>BoA</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/9/95/180417_%EB%B3%B4%EC%95%84_03_%28cropped%29_02.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/BoA</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Chae Jung-an</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/3/3d/Chae_Jung-an_in_September_2025.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Chae_Jung-an</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Eugene (actress)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/b/b8/Eugene_in_Feb_2021.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Eugene_(actress)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Bada (singer)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/3/33/Bada_%28SES%29_in_March_2024.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Bada_(singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Byul</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/3/36/20230112_%EB%B3%84_Byul.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Byul</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Chae Ri-na</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/0/03/%EC%B1%84%EB%A6%AC%EB%82%98.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Chae_Ri-na</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Bae Seul-ki</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/d/d7/Bae_Seul-ki_in_2020.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Bae_Seul-ki</wikipediaUrl>
  </challenge>
  <challenge>
    <name>CL (rapper)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/7/78/CL_%EC%8A%A4%ED%83%80%EC%9D%BC_%EC%96%B4%EC%9B%8C%EC%A6%88_2024_%281%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/CL_(rapper)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Choi Soo-young</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/250807_%EC%88%98%EC%98%81_%27%EC%95%85%EB%A7%88%EA%B0%80_%EC%9D%B4%EC%82%AC%EC%99%94%EB%8B%A4%27_VIP_Premiere_06_%28cropped%29.jpg/1280px-250807_%EC%88%98%EC%98%81_%27%EC%95%85%EB%A7%88%EA%B0%80_%EC%9D%B4%EC%82%AC%EC%99%94%EB%8B%A4%27_VIP_Premiere_06_%28cropped%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Choi_Soo-young</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Dana (South Korean singer)</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ad/Dana_Hong_at_the_Bonnie_%26_Clyde_Press_Conference.jpg/1280px-Dana_Hong_at_the_Bonnie_%26_Clyde_Press_Conference.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Dana_(South_Korean_singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Bae Suzy</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/4/40/Suzy_at_the_Longines_2026_new_product_presentation%2C_25_March_2026_04.png/1280px-Suzy_at_the_Longines_2026_new_product_presentation%2C_25_March_2026_04.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Bae_Suzy</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Ahn So-hee</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/20220519%E2%80%94Ahn_So-hee%2C_Interview%2C_Marie_Claire_Korea_%2800m32s%29.jpg/1280px-20220519%E2%80%94Ahn_So-hee%2C_Interview%2C_Marie_Claire_Korea_%2800m32s%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Ahn_So-hee</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Dia (singer)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/4/4a/DIA_%28Lee_Ji-eun%29_from_Bella_at_the_Incheon_Festival%2C_May_2013_02.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Dia_(singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Choi Jung-in</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/6/62/Choi_Jung-in%2C_2014_%28cropped%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Choi_Jung-in</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Baek A-yeon</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ce/Baek_A-yeon_in_November_2021.png/1280px-Baek_A-yeon_in_November_2021.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Baek_A-yeon</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Yerin Baek</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/2/2e/Baek_Ye-rin_at_Slow_Life_Slow_Live_on_October_5%2C_2019.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Yerin_Baek</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Bang Min-ah</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/3/3d/Bang_Minah_in_February_2023.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Bang_Min-ah</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Ah Young</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7c/%EB%8B%AC%EC%83%A4%EB%B2%B3_%40_Cyworld_Dream_Music_Festival_%EC%8B%B8%EC%9D%B4%EC%9B%94%EB%93%9C_%EB%93%9C%EB%A6%BC_%EB%AE%A4%EC%A7%81_%ED%8E%98%EC%8A%A4%ED%8B%B0%EB%B2%8C_10.jpg/1280px-%EB%8B%AC%EC%83%A4%EB%B2%B3_%40_Cyworld_Dream_Music_Festival_%EC%8B%B8%EC%9D%B4%EC%9B%94%EB%93%9C_%EB%93%9C%EB%A6%BC_%EB%AE%A4%EC%A7%81_%ED%8E%98%EC%8A%A4%ED%8B%B0%EB%B2%8C_10.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Ah_Young</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Anda (singer)</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/0/03/160326_18_F_W_%EC%84%9C%EC%9A%B8%ED%8C%A8%EC%85%98%EC%9C%84%ED%81%AC_%ED%8F%AC%ED%86%A0%EC%9B%94.jpg/1280px-160326_18_F_W_%EC%84%9C%EC%9A%B8%ED%8C%A8%EC%85%98%EC%9C%84%ED%81%AC_%ED%8F%AC%ED%86%A0%EC%9B%94.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Anda_(singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Bae Woo-hee</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e0/180223_%EC%9A%B0%ED%9D%AC_02.jpg/1280px-180223_%EC%9A%B0%ED%9D%AC_02.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Bae_Woo-hee</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Elly (rapper)</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/LE_at_a_fansigning_event_in_Mokdong_on_October_8%2C_2022_%283%29.jpg/1280px-LE_at_a_fansigning_event_in_Mokdong_on_October_8%2C_2022_%283%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Elly_(rapper)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>An Ye-seul</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ce/%EC%95%88%EC%98%88%EC%8A%AC.jpg/1280px-%EC%95%88%EC%98%88%EC%8A%AC.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/An_Ye-seul</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Ben (South Korean singer)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/7/7a/Ben_at_%27Bello%27_concert_on_January_11%2C_2019_%282%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Ben_(South_Korean_singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Eunha (singer)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/6/67/Eunha_August_2024_%283x4_cropped%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Eunha_(singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Cho Seung-hee</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/e/ef/Cho_Seung-hee_in_December_2020.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Cho_Seung-hee</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Chung Ha</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/3/30/CHUNG_HA_Shark_Ninja_PhotoCall_1.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Chung_Ha</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Bona (singer)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/2/2d/Marie_Claire_Korea_Mterview_Kim_Ji-yeon_%26_Woo_Do-hwan_%282%29_%28cropped%29.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Bona_(singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Dahyun</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/7/7a/260618_Kim_Dahyun.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Dahyun</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Choi Yoo-jung (singer)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/5/56/Choi_Yoo-jung_in_October_2022.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Choi_Yoo-jung_(singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Miyeon</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cf/082726_Miyeon_at_The_Whoo_photocall_03.jpg/1280px-082726_Miyeon_at_The_Whoo_photocall_03.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Miyeon</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Choi Ye-na</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/b/b6/CHOI_YENA_%28%EC%B5%9C%EC%98%88%EB%82%98%29_%E2%80%93_2024.09.30_%E2%80%93_P2_%28cropped%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Choi_Ye-na</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Chaeyoung</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/Twice_in_Seattle_2026_-_TWICE._Chaeyoung_%2855045248379%29.jpg/1280px-Twice_in_Seattle_2026_-_TWICE._Chaeyoung_%2855045248379%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Chaeyoung</wikipediaUrl>
  </challenge>
  <challenge>
    <name>AleXa</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/AleXa%2C_Melodifestivalen_2026%2C_artists_press_conference-33_%28cropped%29.jpg/1280px-AleXa%2C_Melodifestivalen_2026%2C_artists_press_conference-33_%28cropped%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/AleXa</wikipediaUrl>
  </challenge>
  <challenge>
    <name>An Yu-jin</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/f/f0/IVE_Yujin_2026_GDA.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/An_Yu-jin</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Ahn Sol-bin</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/4/42/170611_%EB%9D%BC%EB%B6%90_%EC%88%98%EC%9B%90_%EC%84%B8%EA%B3%84%EB%AC%B8%ED%99%94%EC%B6%95%EC%A0%9C_%282%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Ahn_Sol-bin</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Arin (singer)</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/2/26/241002_Oh_My_Girl_Arin_01_%28cropped%29.jpg/1280px-241002_Oh_My_Girl_Arin_01_%28cropped%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Arin_(singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Lee Chae-yeon</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/9/9e/240712_Lee_Chaeyeon.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Lee_Chae-yeon</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Chuu</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/7/7a/20251002_Chuu_%EC%B8%84_03.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Chuu</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Choerry</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/9/9f/Choerry.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Choerry</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Dawon (singer)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/6/6e/10%EC%9B%94_20%EC%9D%BC_U%2B%EC%95%84%EC%9D%B4%EB%8F%8CLive_%EB%9F%B0%EC%B9%AD%EC%BD%98%EC%84%9C%ED%8A%B8_%28103%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Dawon_(singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Choi Yu-jin</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/2/28/Kep1er_YUJIN_Seoul_Fashion_Week.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Choi_Yu-jin</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Chaeryeong</name>
    <imageUrl>https://thumb.wikimedia.org/wikipedia/commons/thumb/4/45/251110_Lee_Chaeryeong_from_ITZY.png/1280px-251110_Lee_Chaeryeong_from_ITZY.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Chaeryeong</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Danielle (singer)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/8/8b/240910_NewJeans_Danielle.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Danielle_(singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Bora (singer)</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/1/1f/Kim_Bo-ra_in_March_2023.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Bora_(singer)</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Jo Aram</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/8/85/170526_%EC%95%88%EC%82%B0_%EA%B7%BC%EB%A1%9C%EC%9E%90_%EB%AE%A4%EC%A7%81%ED%8E%98%EC%8A%A4%ED%8B%B0%EB%B2%8C_%EA%B5%AC%EA%B5%AC%EB%8B%A8_%EC%A7%81%EC%B0%8D_%2814%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Jo_Aram</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Dayoung</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/c/c5/Dayoung_in_September_2025.png?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Dayoung</wikipediaUrl>
  </challenge>
  <challenge>
    <name>Shannon Bae</name>
    <imageUrl>https://upload.wikimedia.org/wikipedia/commons/d/d3/03%EC%9B%94_25%EC%9D%BC_%ED%94%84%EB%A6%AC%EC%8A%A4%ED%8B%B4_%ED%8C%AC%EC%82%AC%EC%9D%B8%ED%9A%8C_%2825%29.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail_unscaled</imageUrl>
    <wikipediaUrl>https://en.wikipedia.org/wiki/Shannon_Bae</wikipediaUrl>
  </challenge>
</challenges>
```

Notes:
- File is UTF-8, `&amp;` escaping is XML-valid (parsers unescape to `&` before matching `?image=` on return).
- Editing is intentionally per-entry: to add/remove someone, add/remove one `<challenge>` block — no JSON comma bookkeeping.
- The previous hidden `<template>`/`<ul>` data-element design (§5/§7) is superseded by this file. `index.html` no longer embeds the list; it just fetches `challenges.xml`. If you later want the list back inside the HTML for crawler indexing, the same XML can be inlined as `<script type="application/xml" id="challenge-data">…</script>` (still `hidden`) without changing the format.

