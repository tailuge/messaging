# Making the lobby a crawlable hub

Brief for the **sister project** (`../messaging`). Goal: give `src/client/lobby.html` a
single-line footer that opens into a disclosure of links, so the lobby stops being a crawl
dead end and can act as the root of the site hierarchy — at essentially zero visual cost.

Target file: `../messaging/src/client/lobby.html`.

## Why

Today the lobby is the most internally linked URL on the billiards site (every language
page, `snooker.html`, the blogs, `exam/*`, `speedrun`, `itch/*` and the app chrome all
link to `/lobby`), but it links almost nowhere back and contains no crawlable prose:
`lobby.js` has zero references to `snooker.html`, `blog1.html`, `exam/snooker` or
`practice.html`. Link equity arrives and stops.

This block fixes that. It does **not** make lobby "top of the tree" by itself — that
comes from the many pages linking *into* it — but it makes lobby a real hub that passes
signals onward, and it gives the target pages anchor-text context.

## Deployment path

| Step | Command (run in `../messaging`) | Effect |
| --- | --- | --- |
| Build + copy to billiards | `npm run crossdeploy` | bundles `src/client/lobby.js` and copies `lobby.html`, `arena.html`, `manifest.json`, `sw.js` into `../billiards/dist/` |
| Copy to scoreboard | `npm run crossdeployv` | same `lobby.html` into `../scoreboard/public/` |

**The shell is shared.** Both targets get this exact file, so relative links to
billiards-only pages will 404 on the scoreboard lobby. See "Scoreboard" below.

## The rule that decides whether this works

**The content must be in the DOM at load, and must not be created on click.**

Crawlers do not interact with the page. So:

- Content inside `<details>` — fine, it is parsed at load.
- Content hidden by CSS (`hidden`, `display:none`, `max-height:0`) — indexed, collapsed
  state does not matter.
- Content fetched or templated when the user clicks — **never seen**.
- Content revealed only on hover (`title` attribute, `:hover::after`) — **never seen**,
  and it is the hidden-text pattern to avoid.

## Placement — the one thing to get right

Put the block **as a sibling of `<lobby-app>`, not inside it.** `LobbyApp extends LitElement`
with `static styles`, so it uses shadow DOM and has no `<slot>`; light DOM children of the
host are not rendered at all. Inside the element the block would be present in the DOM but
invisible — the worst of both worlds.

Current structure of `src/client/lobby.html`:

```html
<body>
  <lobby-app></lobby-app>

  <noscript> ... Korean fallback ... </noscript>

  <script src="lobby.js" type="module"></script>
</body>
```

Insert between `</lobby-app>` and `<noscript>`.

### Layout caveat

The shell's `<head>` style sets `html, body { height: 100%; overflow: auto }` and hides
scrollbars (`scrollbar-width: none`, `html::-webkit-scrollbar { display: none }`).

Check `LOBBY_APP_STYLES` for the app host height:

- If the host is `100vh`, an in-flow footer naturally sits below the fold. Users scroll to
  it — but the page has no visible scrollbar, so it is not discoverable by hint. Either
  accept that, or restore a slim scrollbar, or use the fixed-bar variant below.
- If the host is `height: 100%` against a `height: 100%` body, you will need
  `body { height: auto; min-height: 100% }` for the footer to be reachable. This is the
  one edit with real regression risk — test the app's own layout on mobile after it.

**Variant if you want it above the fold:** make the block a slim
`position: sticky; bottom: 0` bar, collapsed by default so it stays one line, and let the
`<details>` open upward (`position: absolute; bottom: 100%`) so opening it does not grow the
app's layout. Watch for overlap with the info panel / HiScore tables at the bottom of the
app.

A one-line collapsed footer has half the height problem anyway: it is roughly 1rem tall, so
left in flow below the app it barely affects the viewport. It is still below the fold, and
the shell hides scrollbars, so nothing hints that it is there.

## The block

The footer is **one line tall** and made of two parts: an optional short row of fast links,
and a single `<details>` disclosure holding everything else. Collapsed, the whole footer is
the height of one text line.

SEO-wise the two shapes are identical — collapsed `<details>` content is in the DOM at load
and is indexed — so this is purely a layout decision.

```html
<nav class="site-links" aria-label="Billiards pages">
  <ul class="site-links-row">
    <li><a href="./snooker.html">Snooker</a></li>
    <li><a href="./practice.html">Practice</a></li>
    <li><a href="./multi.html">Multiplayer</a></li>
  </ul>

  <details class="site-links-more">
    <summary>All pages</summary>

    <div class="site-links-panel">
      <h2>Play</h2>
      <ul>
        <li><a href="./snooker.html">Free online snooker</a></li>
        <li><a href="./multi.html">Multiplayer game modes</a></li>
        <li><a href="./practice.html">Practice mode</a></li>
        <li><a href="./2p.html">Two-player on one device</a></li>
        <li><a href="./exam/snooker.html">Snooker training course</a></li>
        <li><a href="./exam/threecushion.html">Three-cushion exam</a></li>
        <li><a href="./help.html">Aiming guide</a></li>
      </ul>

      <h2>Other languages</h2>
      <ul>
        <li><a href="./korean.html" lang="ko">무료 온라인 당구</a></li>
        <li><a href="./japanese.html" lang="ja">無料オンラインビリヤード</a></li>
        <li><a href="./chinese.html" lang="zh">免費線上斯諾克</a></li>
        <li><a href="./turkish.html" lang="tr">Ücretsiz online bilardo</a></li>
        <li><a href="./german.html" lang="de">Kostenloses 3-Band-Billard</a></li>
        <li><a href="./spanish.html" lang="es">Billar a tres bandas gratis</a></li>
        <li><a href="./dutch.html" lang="nl">Online driebanden spelen</a></li>
        <li><a href="./vietnamese.html" lang="vi">Game bi-a 3 băng</a></li>
      </ul>

      <h2>Read</h2>
      <ul>
        <li><a href="./blog1.html">Why most pool games feel wrong</a></li>
        <li><a href="./blog2.html">Clearing the line-up</a></li>
        <li><a href="./blog3.html">Implementing Mathavan physics</a></li>
      </ul>

      <h2>Physics and maths</h2>
      <ul>
        <li><a href="./diagrams/three.html">Three-cushion physics diagrams</a></li>
        <li><a href="./diagrams/mathavan.html">Mathavan cushion model</a></li>
        <li><a href="./diagrams/diamond.html">Three-cushion diamond system</a></li>
        <li><a href="./diagrams/stronge.html">Stronge ball-cushion model</a></li>
      </ul>

      <h2>Other ways to play</h2>
      <ul>
        <li><a href="./arena.html">Billiards arena and tournaments</a></li>
        <li><a href="./speedrun/index.html">Speedrun challenge</a></li>
        <li><a href="./3r.html">Heuristic practice tool</a></li>
        <li><a href="./embed.html">Embed the game on your site</a></li>
        <li><a href="./itch/itch-pool.html">Pool and 8-ball</a></li>
        <li><a href="./itch/itch-three.html">Three-cushion carom</a></li>
        <li><a href="./itch/itch-sagu.html">Korean four-ball (sagu)</a></li>
        <li><a href="./itch/itch-speedrun.html">Speedrun billiards</a></li>
      </ul>
    </div>
  </details>
</nav>
```

Notes on the markup:

- Anchor text is the signal that counts. The one-line row uses short anchors as a
  deliberate trade for space; the disclosure carries the descriptive ones (`Free online
  snooker`, `Snooker training course`) where there is room for them.
- Do **not** use `alt` on `<a>`; `alt` is for `<img>`. If a link wraps an icon image, that
  image's `alt` becomes the anchor text.
- A `title` attribute is fine for desktop tooltips but buys nothing for ranking, and does
  nothing at all on touch devices.
- Nested headings inside `<details>` are fine; use `<h2>` to avoid competing with the app's
  own visible heading (which lives in the shadow root anyway).
- Keep the disclosure to roughly 25 links. Every extra link dilutes the share passed to the
  others.

### CSS for a one-line collapsed footer

These rules belong in the shell's existing `<head>` `<style>` block. They are light-DOM
rules and must not live inside a Lit component.

```css
.site-links {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.75rem;
  font-size: 0.75rem;
  line-height: 1;
  white-space: nowrap;
}

.site-links-row {
  display: flex;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.site-links-more summary {
  cursor: pointer;
  list-style: none;
}

.site-links-more summary::-webkit-details-marker {
  display: none;
}

/* Keep an affordance once the default triangle is removed */
.site-links-more summary::after {
  content: " ▾";
}

.site-links-more[open] summary::after {
  content: " ▴";
}

/* Panel spreads sideways so it never becomes a tall wall */
.site-links-panel {
  column-width: 13rem;
  text-align: left;
  white-space: normal;
  padding: 0.75rem;
}

.site-links-panel h2 {
  font-size: 0.75rem;
  margin: 0 0 0.25rem;
  break-after: avoid;
}

.site-links-panel ul {
  margin: 0 0 0.75rem;
  padding-left: 1rem;
  list-style: none;
}
```

When opened, the footer grows from one line to a few. That is user-initiated so it is fine;
if you cannot tolerate the layout shift, position the panel
`position: absolute; bottom: 100%` so it opens upward without moving anything.

### Why not a sideways scrolling row

- The shell hides scrollbars (`scrollbar-width: none`, `::-webkit-scrollbar { display: none }`),
  so a row clipped by `overflow-x: auto` looks identical to a row that is simply cut off. No
  affordance, and users cannot tell there is more of it.
- At 320px, three links plus the summary will not fit on one line, so it either wraps —
  breaking the one-line goal on the device Google indexes first, mobile — or it clips.
- Hiding the extra links with a media query removes them from the DOM on mobile, so they
  stop counting.
- Horizontal-scrolling footers are a known accessibility annoyance, and a scrollbar-less one
  is worse.

A single disclosure line is the only variant that is genuinely one line at every width while
keeping every link in the DOM.

## Target links

All paths are relative to `dist/` on the billiards site, matching the `./xxx.html` form.

### Visible one-line row (optional)

Three links plus the summary is about the most that fits one line at 320px.

| Anchor text | href | Real page title |
| --- | --- | --- |
| Snooker | `./snooker.html` | Free Online Snooker — Play in Your Browser, No Download |
| Practice | `./practice.html` | 9-Ball Practice |
| Multiplayer | `./multi.html` | Multiplayer Billiards - Free Online Pool Game Modes |

If you would rather show nothing but the summary, drop this row. The SEO result is
identical; you only lose a little always-visible text.

### Inside the disclosure

| Group | hrefs |
| --- | --- |
| Play | `./snooker.html`, `./multi.html`, `./practice.html`, `./2p.html`, `./exam/snooker.html`, `./exam/threecushion.html`, `./help.html` |
| Read | `./blog1.html`, `./blog2.html`, `./blog3.html` |
| Languages | `./korean.html`, `./japanese.html`, `./chinese.html`, `./turkish.html`, `./german.html`, `./spanish.html`, `./dutch.html`, `./vietnamese.html` |
| Physics and maths | `./diagrams/three.html`, `./diagrams/mathavan.html`, `./diagrams/diamond.html`, `./diagrams/stronge.html`, `./diagrams/diagrams.html` |
| Other ways to play | `./arena.html`, `./speedrun/index.html`, `./3r.html`, `./embed.html`, `./itch/itch-pool.html`, `./itch/itch-three.html`, `./itch/itch-sagu.html`, `./itch/itch-speedrun.html` |
| Also indexed, lower priority | `./exam/index.html`, `./fit/viewer.html`, `./diagrams/nineball.html`, `./diagrams/roll.html`, `./diagrams/symmetry.html`, `./diagrams/odd.html` |

### Do not link

| href | Reason |
| --- | --- |
| `./google2eba932626b1b383.html`, `./naver200febfca14870e645245d6808f2a89e.html`, `./yandex_ccf0accf9d7d6417.html` | Search Console / site verification files |
| `./redirect.html`, `./itch/itch-redirect.html` | Redirect pages, no content |
| `./m2.html` (Lobby Test), `./net.html` (Network Log), `./ww.html` (web worker example), `./wall.html` (3D emoji wall), `./warp.html` (Warp Clearance Analysis), `./colour.html`, `./cue.html` | Developer and toy pages with no search intent |
| `./book/index.html`, `./fit/compare.html` | No `<title>` element |
| `./lobby.html` | Self-reference |
| `./index.html` | Use `./` instead — see below |

## Two loose ends on the billiards side

1. **`./snooker.html` vs `/snooker`.** `snooker.html` declares its canonical as
   `https://billiards.tailuge.workers.dev/snooker` (extensionless). Linking
   `./snooker.html` may hit a redirect. Check what the host does with that URL before
   shipping; if it redirects, either accept it or switch that one link to `/snooker`.
2. **The game itself.** `./index.html` duplicates the `/` root. If you want a link back to
   the game, use `./` (resolves to the directory root from `/lobby`, no trailing slash) so
   you are not pointing at a duplicate URL.

## Scoreboard

`crossdeployv` copies this same shell into `../scoreboard/public/`, where `snooker.html`,
`exam/` and `blog1.html` do not exist. Options, cheapest first:

- Accept the 404s. Minor.
- Trim the list at runtime is not an option here (no JS), so if it matters, keep a
  scoreboard-specific variant of `lobby.html` and stop sharing the file.

## Relative link resolution

`./snooker.html` resolves correctly from `/lobby` and `/lobby.html` (both land on
`/snooker.html`). It breaks from `/lobby/` with a trailing slash, which would resolve to
`/lobby/snooker.html`. Confirm nothing serves or links the lobby with a trailing slash —
the declared canonical is the extensionless `/lobby`.

## Verification

Do not assume; check the rendered DOM:

1. Deploy, then Search Console → **URL Inspection → Test live URL → View tested page →
   HTML**. The link block and the `<details>` body text must both appear there. This is
   the definitive test.
2. `view-source:` shows pre-JS HTML; URL Inspection shows post-render. Compare them.
3. Test on a **mobile** user agent — Google indexes with a smartphone UA, and the app
   layout is where this is most likely to break.
4. Confirm the app's own panels, HiScore tables and arenas still lay out correctly with
   the footer present.

## Checklist

- [ ] Block is a sibling of `<lobby-app>`, not a child
- [ ] Content is in the DOM at load; nothing is created on click
- [ ] No hover-only text, no `alt` on `<a>`
- [ ] Footer is one line when collapsed at every width down to 320px
- [ ] All links are inside the `<details>` and present in the DOM at load
- [ ] Summary label is concrete (`All pages`), not just `Links`
- [ ] Descriptive anchors in the panel; short anchors only in the one-line row
- [ ] `<details>` content not wrapped in `visibility:hidden` or zero-opacity rules
- [ ] Footer visible to users, not just present in the DOM
- [ ] App layout verified on mobile
- [ ] `npm run crossdeploy` in `../messaging`, then the rendered-HTML check above

## After copying into the billiards repo

`dist/**/*.html` is covered by this repo's tooling, so once the file lands in `dist/`:

```bash
yarn prettify     # formats dist/**/*.{css,html}
yarn lint:css     # stylelint over dist/**/*.{css,html}
```

Watch the block's CSS survives both.
