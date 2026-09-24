# PokéPool — plan: adapt Pot & Reveal to PokéAPI (images + stats)

> **Status:** plan only — **no implementation in this document and none merged**. Nothing here changes
> behaviour until the phases in §13 are worked through.
> **Relationship to other docs:** `reveal-spec.md` remains the single source of truth for the page
> **as it exists today**. Where this plan contradicts it (§4 identity, §6 images, §7 stats, §11
> attribution, §12 page identity), that section of `reveal-spec.md` is what gets rewritten at the end
> of each phase — do not fork the two docs.
> **Audience:** implementers of `src/client/reveal` in this repo, and the sister game repo
> `../billiards` on the other side of the launch/return contract.
> **Last updated:** 2026-09-23 — initial plan. All PokéAPI facts in §3 were measured on this date
> (commands shown there), because the plan hinges on them.

---

## 1) Summary

The existing Pot & Reveal page does one thing well and does not need re-architecting: a dense wall of
flip cards persists a completed card (small local thumbnail + identifiers + the game's replay
`state`) in `localStorage`, and the game is launched/returned through `?ruletype=reveal&image=…` /
`?image=…&state=…`.

This plan swaps the **content source** from a hand-curated Wikimedia list to **PokéAPI**:

- **Images** — mystery picture = a Pokémon's official artwork from the PokéAPI sprites repo, discovered
  by National Dex number via `https://pokeapi.co/api/v2/pokemon/{id}`, not by pasting a URL per entry.
- **Stats** — on completion the card gains real data: base stats, types, height/weight, genus and a
  flavour line, fetched once per Pokémon and cached locally. Those stats are what the page shows on
  the solved card, alongside today's name-as-link plus Share/Replay/Delete actions.

What does **not** change: the Lit + esbuild toolchain, the grid, the single 3:4 flip card, the
`localStorage`-only collection, lobby presence, the replay `state` contract, the silent-failure
policy, and the single-use URL strip. §1 of `reveal-spec.md` still describes the page; only the deck,
the identity key, the solved-card payload and the copy change.

---

## 2) What stays, what changes

| Piece | Today (`reveal`) | With PokéAPI (`pokipool`) | Change size |
|---|---|---|---|
| Deck source | 47 hand-picked Wikimedia `data-image` URLs, `<ul id="challenge-data" hidden>` | `<ul>` of dex-numbered entries (id + display name), images derived from the id | data + parser |
| Card identity | `slugify(name)`, plus exact string match on `data-image` | `id = "p{dexId}"`; the dex number is the key everywhere | small, removes a class of bugs |
| Mystery image | Wikimedia photo (opaque, mixed aspect) | official artwork PNG (square, transparent, ~118–153 KB) | small |
| Solved thumbnail | canvas → WebP data URL, ~10 KB | unchanged (CORS verified, §3) | none |
| Solved card extra | name (a Wikipedia link) + Share/Replay/Delete | **stats panel**: types, six base stats + total, height/weight, genus/flavour; the name link points at the Pokemon page instead of Wikipedia, Share/Replay/Delete unchanged | new UI |
| Return contract | `?image=<encoded url>&state=<crushed state>` | `?pokemon=<dexId>&image=<artwork url>&state=…` (image kept, §9) | cross-repo |
| Collection cap | 20 entries | decision: keep 20, or raise | trivial |
| Storage key | `reveal:collection` | new key (§12) so old entries cannot confuse the new page | trivial |
| Attribution | "Images from Wikimedia Commons" (CC) | PokéAPI credit + Pokémon IP notice (§11) | copy + legal note |
| Presence, theme, header islands, build, nginx | as-is | as-is | none |

Nothing in the transport layer (`MessagingClient`, presence, lobby), the Docker image or the nginx
config is touched by this plan.

---

## 3) Verified PokéAPI facts (measured 2026-09-23)

Everything below was checked against the live API on 2026-09-23 rather than taken on trust. Re-run
these before relying on them again:

```sh
curl -s https://pokeapi.co/api/v2/pokemon/25            # one Pokémon: sprites, stats, types, height/weight, cries, species url
curl -s https://pokeapi.co/api/v2/pokemon-species/25    # display name, genus, flavour text, colour, evolution chain
curl -s "https://pokeapi.co/api/v2/pokemon/?limit=1"    # resource count
curl -sI https://pokeapi.co/api/v2/pokemon/25 | grep -i access-control
curl -sI https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png \
  | grep -i access-control
```

**Endpoints and shape**

- Base URL `https://pokeapi.co/api/v2/`; GET only; **no authentication**; resources by id or slug.
- `/pokemon/{id}` returns `id`, `name` (lower-case slug, e.g. `pikachu`), `height` (decimetres),
  `weight` (hectograms), `types[]`, `stats[]` (`hp`, `attack`, `defense`, `special-attack`,
  `special-defense`, `speed`, each with `base_stat`), `abilities[]`, `cries.latest`, `species.url`,
  and `sprites`.
- `sprites.front_default` → `…/sprites/pokemon/{id}.png` (96×96 pixel sprite).
- `sprites.other["official-artwork"].front_default` →
  `…/sprites/pokemon/other/official-artwork/{id}.png` (**475×475**, verified for ids 25/6/150/445).
  Also available: `sprites.other.home` (512×512), `sprites.other.dream_world` (SVG),
  `sprites.other.showdown` (animated GIF), `sprites.other["official-artwork"].front_shiny` (aka a
  free variant for later — a "shiny" card is a natural reward, out of scope here).
- `/pokemon-species/{id}` returns `names[]` (proper English name "Pikachu" — `/pokemon` only has the
  slug), `genera[]` ("Mouse Pokémon"), `flavor_text_entries[]` (contains form-feed characters and
  line breaks that need normalising), `color`, `evolution_chain`, `is_legendary`/`is_mythical`.
- Sizes (National Dex): **1025 species**, **1351 `/pokemon/` resources** (forms included), so a deck
  can be any subset of 1…1025 without surprises.

**Transport facts that decide the design**

| Fact | Value | Consequence |
|---|---|---|
| `access-control-allow-origin` on `pokeapi.co` | `*` | plain `fetch()` from the page works, no proxy |
| `access-control-allow-origin` on `raw.githubusercontent.com` (sprites) | `*` | the existing `crossOrigin="anonymous"` canvas → WebP thumbnail pipeline keeps working unchanged |
| Cache headers, API JSON | `cache-control: public, max-age=86400` | a Pokémon fetched once is served from the browser cache for a day |
| Cache headers, sprite PNG | `cache-control: max-age=300`, ETag | CDN-friendly, but not a long-lived cache |
| Rate limiting | **none enforced** since static hosting (Nov 2018); fair-use policy asks you to *"limit the frequency of requests"* and to **cache resources locally**; abuse = IP ban | fetch once per Pokémon, never for unsolved cards, cache the result (§7, §10) |
| Raw response size | `/pokemon/6` = **362 KB**, `/pokemon/25` = ~288 KB (ETag `"47060-…"`) | **never store the raw response**; trim (§7) |
| Official artwork PNG size | id 25 = 118 KB, 6 = 145 KB, 150 = 119 KB, 445 = 153 KB | one image per completed card is affordable, and far lighter than the Wikimedia sources |
| Pixel sprite size | id 25 = 597 B … 445 = 1.3 KB | cheap, but 96×96 is useless for a progressive reveal (§6) |

---

## 4) Identity: how a card names its Pokémon

Today identity is `slugify(name)` plus an **exact string match** on the returned `?image=` URL —
`reveal-spec.md` §16 already flags a bad URL as un-matchable, and a sprite host/path change would
break every card at once. Pokémon have a stable primary key (the dex number), so use it.

- **Option A (recommended).** The dex number is the identity: card id `p25`, deck entry
  `data-pokemon="25"`, return param `?pokemon=25`. The artwork URL is *derived* from the id by a
  helper, so the deck never stores a URL and the match can never depend on a URL string.
- **Option B.** Keep `data-image` as the identity and swap the URLs. Zero game-side change, but it
  re-imports the brittleness above and makes each `<li>` unreadable.

**Recommendation: A, with B as a one-release fallback.** The return handler resolves identity in this
order: `?pokemon=` (preferred) → `?image=` matched against the *derived* artwork URL for each deck id
(compatibility path for a game that has not been updated yet) → no match, ignore as today. The
compatibility path is what lets this repo and `../billiards` ship independently (§9).

Consequences to write down while implementing: `slugify()`/`idForChallenge()` lose their reason to
exist for deck entries; `_completedIds`, `_entryFor` and the React-style keyed render switch to the
dex id; the "duplicate name collisions" note in `reveal-spec.md` §10.5 and the Korean-filename
`decodeURIComponent` edge case in §16 both disappear.

---

## 5) Deck data: keep the hidden list, make it id-only

`reveal-spec.md` §6 deliberately chose a **hidden HTML element** over a JSON/XML fetch or a
`<template>`, for diff-friendliness and coder-editability. PokéAPI does not change that trade-off —
it makes it cheaper, because an entry no longer needs a pasted URL:

```html
<ul id="challenge-data" hidden aria-hidden="true">
  <li><a data-pokemon="25">Pikachu</a></li>
  <li><a data-pokemon="6">Charizard</a></li>
</ul>
```

Options considered:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A. Hidden `<ul>`, id-only entries** | no runtime list fetch, no build data file, view-source shows the deck, one line per Pokémon, exact 1:1 with the current pattern | the deck is still a hand-edited list | **Recommended** |
| B. `fetch('/pokemon?limit=151')` at page load | no list in the repo at all | adds a blocking call to first paint, the deck is then invisible to view-source, and the API's paginated form gives names/slugs but not ids in `results[]` | reject |
| C. Build-time generated `pokipool.json` copied by `build:lit` | deck can be generated from a script, still no runtime list call | reintroduces exactly the data-file plumbing §5.1 of `reveal-spec.md` removed | reject for v1 |

Deck size is a decision, not a discovery: **151 (Gen I)** keeps the page close to today's scale and
the collection feeling curated; **1025** is a completionist wall (the grid is `minmax(84px, 1fr)`, so
it stays dense, but a few hundred mystery tiles is a lot of scroll). The deck also determines how
often the API is touched: one artwork + one stats call per *completed* card, never per tile.

Note the existing rule that carries over unchanged: **unsolved cards fetch nothing** — a mystery tile
is the `?` glyph, not a network request (`reveal-spec.md` §9.2).

---

## 6) Images

- **Use `sprites.other["official-artwork"].front_default`** (475×475 PNG). The reveal metaphor needs
  an image worth uncovering; a 96×96 pixel sprite (§3) cannot be progressively revealed.
- The existing thumbnail path (`imageToThumbDataUrl` → 180 px longest edge → WebP 0.6 → data URL)
  needs no change to its fetch/CORS handling: `raw.githubusercontent.com` sends
  `access-control-allow-origin: *` (verified), so the canvas stays untainted and `toDataURL` still
  succeeds. It does now take the card's type (`{ type: match.pokeType }`) and fill the canvas with a
  dark muted radial wash of that type's colour — water reads deep blue, fire deep red-brown — before
  drawing the artwork over it, so the transparent PNG sits on a backdrop of its own colour instead
  of on `--surface`. Because the wash is baked into the thumb it is theme-independent (dark in light
  mode as well); the kids deck has no type and keeps the plain canvas.
- **Transparency and aspect ratio are the visible difference.** Artwork is square with transparent
  margins, while the card is 3:4 and `.face-front img` currently uses `object-fit: cover`. Cover will
  crop the artwork's edges and can leave the transparent area showing the card surface behind it.
  Try `object-fit: contain` (and a stable background) on the solved front face, and check a
  dark-mode/light-mode pair — this is a one-line CSS decision, not a re-layout.
- Artwork is a **cross-repo risk**: the game in `../billiards` masks/reveals the picture, and a
  transparent PNG may reveal the page background instead of a picture. Flag it for the game-side
  phase (§13.3) and confirm there before committing to artwork over the opaque pixel sprites.
- Shiny variants (`…/official-artwork/shiny/{id}.png`) are an obvious future reward (e.g. a card
  caught twice, or a perfect clear). Explicitly out of scope, but the identity model in §4 already
  leaves room: a shiny card is the same dex id with a `variant` flag.

---

## 7) Stats

**Source of truth:** one `GET /pokemon/{id}` per completed card, plus at most one
`GET /pokemon-species/{id}` when we want the proper English name, genus and flavour text (§3). Keep
it to `pokemon` for the first phase and add species only if the panel needs the genus/flavour line —
that halves the request count.

**When to fetch:** on completion (the return handler already knows the id), and *lazily* for cards
that are already in the collection without stats (fetched the first time their back face is opened,
one at a time). Never for unsolved cards, never in a loop for the whole deck. That is what keeps the
page inside the fair-use request budget.

**What to store:** a trimmed record, not the response (§3 measured 362 KB raw). Everything the panel
needs is a few hundred bytes:

```json
{ "id": 25, "name": "Pikachu", "genus": "Mouse Pokémon", "types": ["electric"],
  "stats": { "hp": 35, "attack": 55, "defense": 40, "special-attack": 50,
             "special-defense": 50, "speed": 90 },
  "height": 0.4, "weight": 6.0, "flavor": "When several of these Pokémon gather …" }
```

Stored per dex id under a **separate key** (`pokipool:stats`, `{ "25": {…} }`) so a stats write can
never corrupt the collection, and so a quota failure degrades to "no stats" instead of "no card".
Quota arithmetic: the collection's cost is dominated by the thumb data URL (~10 KB/card today, cap
20 → ~200 KB); ~0.5 KB of trimmed stats per card is noise even at a 151-card deck, well inside the
usual 5 MB budget. Keep the existing `QuotaExceededError` → drop-oldest → retry-once behaviour for
the collection, and for stats simply stop caching (log only).

Normalise on the way in: collapse whitespace and strip `\f`/`\n` from `flavor_text_entries`;
display names are the species `names[]` English entry (the `/pokemon` name is a slug); `height` is
decimetres and `weight` is hectograms, so format at render time, not in storage.

---

## 8) UI: where the stats live

The constraint that shapes this: the card is ~84 px wide with 22 px corner buttons, and
`reveal-spec.md` §9.3 explicitly rules out a detail dialog. Base stats do not fit on the card, so:

| Option | Description | Fits the current spec | Verdict |
|---|---|---|---|
| **A. Stats block below the grid** | The flipped/selected solved card drives a compact panel under the grid (next to today's `.count` line): types, six stat bars, total, height/weight, genus/flavour. No new surface, works at mobile widths, keeps one copy of the text | yes (grid stays the dominant element) | **Recommended** |
| B. Types + stat total on the back face | Two type chips and a BST number in the free space around the name | yes, but cramped at 84 px | optional add-on to A |
| C. Reintroduce a `<dialog>`/sheet | Room for everything, including a future evolution chain | **no** — contradicts §9.3; needs a spec change | only if A proves too tight |

Details that matter when implementing A: the panel must not shift the grid when it appears (the
puzzle wall is the product); it should follow the flip state rather than adding a second selection
mechanism; and with `prefers-reduced-motion` the flip is instant, so the panel must not depend on a
transition end event. Type colours belong in `styles.js` or local CSS — **no new colour tokens**
unless the shared ones genuinely cannot express six type badges (then extend the token file, not the
component).

Also in scope for the same phase, because they are the page's only *copy*: the intro line and the
light-DOM SEO prose in `index.html` (How to play / FAQ / attribution) — they currently talk about
"hidden pictures" and Wikimedia and must be rewritten in the same style (real HTML, one copy, tight).

---

## 9) Launch / return contract (cross-repo)

Unchanged in shape; one param added.

```
launch:  ${BASE}?ruletype=reveal&image=<encoded artwork url>&pokemon=25
         &userId=…&userName=…&lod=…&flip=…&custom.*&lobbyUrl=…   (as today)
return:  …/reveal/index.html?pokemon=25&image=<encoded artwork url>&state=<crushed state>
```

- `pokemon` is the authoritative success signal for the new page (`image` alone keeps working via the
  §4 fallback, so the two repos can ship in either order).
- `state` handling is untouched: stored verbatim, `revealReplayUrl({ imageUrl, state })` still builds
  the game replay link, Replay/Share still read from storage, muted when there is no state.
- The **single-use URL discipline stays exactly as it is**: `?image=`/`?state=` (and now `?pokemon=`)
  are stripped from the address bar up front, before the async thumbnail work, so a copied URL cannot
  award a card and a refresh cannot re-award. Add `pokemon` to the params the stripper deletes.
- Game side (`../billiards`, `src/controller/rules/reveal.ts` → `buildUpdateDeckButton`): append
  `pokemon` to the return URL and, if a deck shuffle is introduced later, send the id it was launched
  with rather than re-deriving it from the image.
- `revealGameUrl()` / `revealReplayUrl()` in this repo gain the id argument; keep echoing `image`,
  because the game needs the picture to render during replay.

---

## 10) Caching, rate-limit discipline, failure modes

Fair use is a real constraint (ban risk is on the IP, not on the app), so the design is deliberately
stingy: one artwork + one stats request per *completed* card, results cached in `localStorage`, deck
list embedded in HTML, unsolved cards fetch nothing, and no bulk pre-fetch of a deck.

| Case | Behaviour (proposed, mirrors the current silent-failure policy) |
|---|---|
| Stats fetch fails (offline, 5xx, timeout) | Card still completes on its thumbnail; stats area stays empty; `console.log`; a later flip retries once |
| Stats 404 for a dex id (bad deck entry) | Log only; no card is minted from a URL that names an unknown id |
| `pokemon` and `image` disagree | Trust `pokemon`, log the mismatch shape (not the URL) |
| Artwork fails to load but API works | Card completes with an empty thumb only if the canvas path succeeded — otherwise behave as today (card stays unsolved, params already stripped) |
| `localStorage` quota | Collection: drop oldest, retry once (unchanged). Stats: skip caching, keep working |
| Deployed while `../billiards` is old | `?image=` fallback path (§4) keeps completions working |

---

## 11) Licensing, attribution and copy (do not skip)

This is the one part of the plan that is not a technical improvement:

- The current images are Wikimedia Commons files used with attribution (and the page says so). Pokémon
  official artwork and sprites are **copyrighted by Nintendo / Creatures Inc. / GAME FREAK inc.** —
  there is no CC equivalent, and PokéAPI's own repository only hosts them. PokéAPI's *data* is free to
  use under its fair-use policy; the *sprites/artwork* are the IP holder's.
- The plan therefore must change the attribution line rather than inherit it: credit **PokéAPI**
  (data + sprite hosting) and carry an explicit fan-project / non-affiliation notice for the Pokémon
  IP. Decide (open question §14.1) whether that is acceptable for the public deployment at all, or
  whether the page stays local/personal.
- Copy to rewrite in the same pass: title/meta description, the intro paragraph, the How-to-play and
  FAQ prose (whose current answers describe uncovered *photographs* and Wikipedia attribution),
  `og:*` metadata, the `VideoGame` JSON-LD block, and the hidden `<h1>` — all in `index.html`, plus
  the FAQ answer about sharing, which must describe the game replay link, not a Wikipedia page.
- Do **not** put Pokémon names into the sitemap/robots work owned by `../billiards` without deciding
  §14.1 first.

---

## 12) Page identity: adapt in place, or fork to `src/client/pokipool/`?

Two viable shapes, and this is the plan's first blocking decision (§14.2):

| | **A. Adapt `src/client/reveal/` in place** (recommended) | **B. Fork a new `src/client/pokipool/` page** |
|---|---|---|
| Work | swap deck + stats + copy in existing files | duplicate page, element, storage, build + crossdeploy lines, plus a new `ruletype` |
| Game side | add one param to the existing `reveal` rule's return URL | new rule + new return target in `../billiards` |
| Reveal-today | retired (its collection is orphaned in `reveal:collection`) | both pages live side by side, two decks to maintain |
| Risk | loses the working Wikimedia deck if the IP question (§11) says no | more moving parts, two specs, two reasons to drift |

If B is chosen, the fork checklist (so it is a copy, not a rewrite): new dir `src/client/pokipool/`
with `index.html` + `pokipool.js`; rename the custom element `reveal-app` → `pokipool-app`; new
storage keys `pokipool:collection` / `pokipool:stats`; new `ruletype=pokipool`; new
`build:lit`/`crossdeploy` lines mirroring the reveal pair (esbuild outfile + `cp index.html`); a new
line in `docker/nginx.conf` only if a path other than the emitted directory is needed (it is not —
`location /` already serves `/pokipool/`); and a `pokipool-spec.md` that supersedes the sections this
plan rewrites.

Either way: **new storage keys**, so a half-migrated browser cannot render Wikimedia cards on the
PokéAPI page. No migration of existing entries is proposed — 20 local cards are not worth a
compatibility layer, and the old key can simply be left behind (or cleaned up in the same release).

---

## 13) Phases

Each phase is independently shippable and reversible; nothing here has been started.

### Phase 0 — decisions (no code)
Resolve §14.1–§14.4: public-deployment/IP stance, in-place vs fork, deck size, artwork vs pixel
sprite (with the game-side transparency check), stats UI A vs C, collection cap.
**Output:** this doc updated with the answers, or a short ADR note appended.

### Phase 1 — deck + identity + URLs
Files: `src/client/reveal/index.html` (deck list → id-only entries), `src/client/reveal/reveal.js`
(`readChallengesFromDOM` → dex ids, id helpers, stripper deletes `pokemon`),
`src/client/utils.js` (`pokeArtworkUrl(id)` / `pokeApiUrl(id)` helpers, id argument on
`revealGameUrl` / `revealReplayUrl`).
Exit: launching a card sends `pokemon` + `image`; completing it (with the `image`-only return) still
mints a card; a `?pokemon=` return mints the same card; refresh after completion awards nothing.
Verify: `npm run lint`, `npm run build:lit`, then a manual launch/return round trip against the
sibling game, plus a check that no unsolved tile issues a request.

### Phase 2 — images in the page
Files: `src/client/reveal/reveal.js` (card front CSS `contain` vs `cover`, no new fetches),
`src/client/styles.js` only if type badges need shared tokens.
Exit: solved cards show artwork thumbs that survive dark/light mode; unsolved cards still show `?`.

### Phase 3 — stats
Files: `src/client/reveal/reveal.js` (fetch + trim + cache + panel), `index.html` (panel markup or
light-DOM styling if the panel lives outside the component),
`src/client/utils.js` if the panel needs formatting helpers.
Exit: completing a card shows types, six base stats + total, height/weight, genus/flavour; a second
flip does not re-fetch; offline behaves as §10; `pokipool:stats` is a few hundred bytes per card.

### Phase 4 — return contract with the game repo
Files: `../billiards` `src/controller/rules/reveal.ts` (+ whatever builds `buildUpdateDeckButton`),
and the game's reveal masking for transparent artwork.
Exit: the game returns `?pokemon=&image=&state=`; an old game build still works via the §4 fallback;
the game renders transparent artwork correctly.

### Phase 5 — copy, attribution, docs, release
Files: `src/client/reveal/index.html` (prose/FAQ/og/JSON-LD/attribution), `reveal-spec.md` (rewrite
the sections this plan supersedes, or replace it with `pokipool-spec.md` per §12),
`package.json` only if the page moves (no change for in-place).
Exit: `npm run lint`; `npm run build:lit` emits `docker/html/reveal/{index.html,reveal.js}`;
`npm run crossdeploy` mirrors the directory form into `../billiards/dist/reveal/`; `CLIENTVERSION`
bumped (via `npm run clientbump`/`build:all`) so the bundle is not served stale; `screenshot:iphone`
reviewed.

---

## 14) Risks and open questions

**Blocking (must be answered before Phase 1):**

1. **IP/licensing stance (§11).** Is a public page showing Pokémon artwork acceptable (fan-project
   notice, no ads), or should this stay a personal/local build? This can veto the whole plan; it is
   also why nothing has been coded yet.
2. **In place or fork (§12).** Forks duplicate a deck, a build line and a spec.
3. **Identity key (§4).** Adopt `?pokemon=` (one small game-side change) or stay on `?image=` string
   matching (no game-side change, keeps the fragility).
4. **Deck size (§5)** and collection cap: 151 with a 20-card cap repeats today's "collect the
   favourites" feel; 1025 needs a different completion story.
5. **Artwork vs pixel sprite (§6)**, contingent on the game rendering transparent images correctly.
   Getting this wrong is visible only after the game-side work.

**Non-blocking (decide during the phase that touches them):**

6. Stats panel placement and whether type badges need new tokens (§8).
7. Whether to add `/pokemon-species/{id}` for genus/flavour (one extra request per completed card,
   §7) or skip the prose line.
8. `abilities`/`cries` (`cries.latest` is an `.ogg` URL) — free flavour, out of scope until the panel
   exists; a cry needs a click, and click-to-play audio before a gesture is a browser problem worth
   avoiding in v1.
9. Shiny variants, evolution chain, and a "new deck" reset (§18.2 of `reveal-spec.md`) are all
   natural later additions that the dex-id identity model supports.
10. Offline behaviour: no service-worker caching of PokéAPI responses is proposed (cross-origin, and
    the trimmed stats are already local). Revisit only if the page should work with no network.

---

## 15) Non-goals (v1 of this plan)

- No `pokeapi-js-wrapper`/`pokenode-ts` or any new dependency — fair-use caching is ~40 lines here.
- No server-side proxy or build-time data fetch; the API is CORS-open and the deck is HTML.
- No per-Pokémon landing pages, no collection migration, no account-backed collection.
- No analytics, no ads, no type-effectiveness calculator, no battle simulation.
- No change to the transport layer, Docker image, nginx config, presence or lobby code.

---

## 16) Verification checklist

- `?pokemon=25&image=<artwork>&state=<crushed>` on load: card `p25` is minted once, `image`/`state`/
  `pokemon` are gone from the address bar **before** the thumbnail finishes, refresh awards nothing.
- A `?image=<artwork url>` return with no `pokemon` still mints the same card (compatibility).
- `?image=` naming a URL that is not in the deck mints nothing and is stripped (unchanged behaviour).
- Unsolved tiles issue zero requests to `pokeapi.co` / `raw.githubusercontent.com` (network panel).
- One completed card costs exactly one artwork request + one `/pokemon/{id}` request, and the second
  flip costs none; `pokipool:stats` stays under ~1 KB per card.
- Solved card front shows the artwork with sane `object-fit` in dark and light mode; the back shows
  the name (which is the link, §11 of `reveal-spec.md`) + Share/Delete/Replay as today, plus the
  stats panel.
- Offline (devtools) completion still persists the card and logs only.
- `npm run lint`, `npm run build:lit`, `npm run crossdeploy`, `npm run screenshot:iphone` all pass,
  and `/reveal/` (or `/pokipool/`) serves through nginx with `../lobby.html` and `../assets/…`
  resolving.

---

## 17) Sources

- PokéAPI documentation and fair-use policy: <https://pokeapi.co/docs/v2> (GET-only, no auth, no
  enforced rate limit since static hosting, "locally cache resources whenever you request them").
- PokéAPI sprites repository (sprite/artwork folder layout, 475×475 official artwork, 96×96 default
  sprites, Smogon/community credits): <https://github.com/PokeAPI/sprites>.
- Live measurements taken 2026-09-23 (commands quoted in §3): `/pokemon/25`, `/pokemon/6`,
  `/pokemon-species/25`, resource counts, CORS and cache headers, and PNG content lengths.
- This repo: `reveal-spec.md` (§6 hidden deck, §7 header, §9 card UI, §10 launch/return/persistence,
  §11 corner actions, §16 edge cases, §18 open items), `src/client/reveal/reveal.js`,
  `src/client/reveal/index.html`, `src/client/utils.js`, `package.json` (`build:lit`, `crossdeploy`).
- Sister repo `../billiards`: `src/controller/rules/reveal.ts` (`buildUpdateDeckButton` sets `image`
  + `state`), `src/utils/replay-encoder.ts`.
