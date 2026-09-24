import { LitElement, html, css } from "lit";
import { MessagingClient } from "../../index.ts";
import { THEME_VARS, SHARED_STYLES } from "../styles.js";
import { userStore } from "../user-store.js";
import {
  revealGameUrl,
  revealReplayUrl,
  shortenUrl,
  shareOrCopy,
  formatVersion,
  CLIENTVERSION,
  NCHANBASE,
} from "../utils.js";
import "../user-badge.js";
import "../trophy.js";
import "../settings-modal.js";

const STORAGE_KEY = "reveal:collection";
const REMOVED_KEY = "reveal:removed";
const DECK_KEY = "reveal:deck";
const MAX_COMPLETED = 20;

// Decks the page can show, each rendered from its own hidden <ul> in index.html. The first
// entry is the default and the fallback when nothing valid is stored. `title` is the on-page
// game title shown beside the deck buttons. `mode` is the ?mode= value that opens straight onto
// that deck, so a shared link can choose it.
const DECKS = [
  {
    id: "kids",
    label: "K-idols",
    title: "K-Pot Idol",
    mode: "k-idols",
    dataId: "challenge-data",
  },
  {
    id: "pokemon",
    label: "Pokemon",
    title: "Poképot",
    mode: "pokepot",
    dataId: "pokemon-data",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function readChallengesFromDOM(dataId = "challenge-data") {
  const ul = document.getElementById(dataId);
  if (!ul) return [];
  const anchors = [...ul.querySelectorAll("a[data-image]")];
  return anchors
    .map((a) => {
      const name = a.textContent.trim();
      const imageUrl = a.getAttribute("data-image") || "";
      // Respect both &amp; in HTML and raw &
      const wikipediaUrl = a.getAttribute("href") || "";
      const rawRating = Number.parseFloat(a.getAttribute("data-rating") || "");
      const rating = Number.isFinite(rawRating) ? Math.min(1, Math.max(0, rawRating)) : 0;
      // href may be empty if anchor is malformed
      return {
        name,
        imageUrl: imageUrl.trim(),
        wikipediaUrl: wikipediaUrl.trim(),
        rating,
        id: slugify(name),
        // Pokémon-deck flavour metadata (undefined for kids deck)
        pokeType: a.getAttribute("data-type") || undefined,
        pokeNature: a.getAttribute("data-nature") || undefined,
      };
    })
    .filter((c) => c.imageUrl);
}

// Tiny mulberry32 PRNG — fast, seedable, same sequence for all clients.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string to a uint32 seed (djb2 variant).
function hashSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Post-processes the raw challenge list:
 *  1. Shuffle deterministically (same order for every user / reload), seeded from
 *     the first image URL so different decks get different orders.
 *  2. Re-assign `rankRating` = rank/(n-1) for a perfectly even 0→1 distribution
 *     that drives star display and &reds without clustering from raw data-rating.
 */
function postProcessChallenges(challenges) {
  if (!challenges.length) return challenges;
  // 1. Order deck easy to hard by original rating (data-rating in DOM)
  const sorted = challenges.slice().sort((a, b) => a.rating - b.rating);
  const n = sorted.length;
  const processed = sorted.map((ch, i) => {
    const normRating = (i + 1) / n;
    const reds = Math.max(1, Math.round(normRating * 32));
    const stars = Math.min(5, Math.max(1, Math.ceil(normRating * 5)));
    return {
      ...ch,
      normRating,
      reds,
      stars,
      rankRating: normRating,
    };
  });
  // 2. Present deck in deterministically shuffled order
  const rand = mulberry32(hashSeed(challenges[0].imageUrl));
  for (let i = processed.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [processed[i], processed[j]] = [processed[j], processed[i]];
  }
  return processed;
}


function loadCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCollection(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_COMPLETED)));
  } catch (e) {
    // QuotaExceededError: drop oldest and retry once
    if (e && e.name === "QuotaExceededError") {
      console.log("reveal: localStorage quota exceeded, evicting oldest");
      try {
        entries.pop();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_COMPLETED)));
      } catch {
        console.log("reveal: still over quota after eviction");
      }
    } else {
      console.log("reveal: saveCollection failed", e);
    }
  }
}

function clearCollection() {
  // Reset also un-deletes: the full source deck comes back (see _onDelete)
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(REMOVED_KEY);
  } catch (e) {
    console.log("reveal: clearCollection failed", e);
  }
}

function loadRemovedIds() {
  try {
    const raw = localStorage.getItem(REMOVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function saveRemovedIds(ids) {
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify(ids));
  } catch (e) {
    console.log("reveal: saveRemovedIds failed", e);
  }
}

// The selected deck is remembered: a game launched from a deck returns to that deck's cards.
function loadDeckId() {
  try {
    const raw = localStorage.getItem(DECK_KEY);
    return DECKS.some((d) => d.id === raw) ? raw : DECKS[0].id;
  } catch {
    return DECKS[0].id;
  }
}

function saveDeckId(id) {
  try {
    localStorage.setItem(DECK_KEY, id);
  } catch (e) {
    console.log("reveal: saveDeckId failed", e);
  }
}

// A shared link can name the deck to open with: ?mode=k-idols or ?mode=pokepot. Resolved against
// each deck's `mode` alias; an absent or unknown value falls back to the remembered deck.
// Deliberately a view-only preference — unlike the deck buttons it is never saved, so following
// someone else's link does not change which deck your own visits start on.
function deckIdFromUrl() {
  let mode;
  try {
    mode = new URLSearchParams(window.location.search).get("mode");
  } catch {
    return null;
  }
  if (!mode) return null;
  const wanted = mode.trim().toLowerCase();
  return DECKS.find((d) => d.mode === wanted)?.id ?? null;
}

// Pokémon type colours. The .type-pill rules in the styles below are the same palette (the pills
// paint these hexes); this copy exists because the thumbnail canvas is drawn outside CSS. Keep the
// two tables in step.
const POKE_TYPE_COLOURS = {
  normal: "#9fa19f",
  fire: "#e62829",
  water: "#2980ef",
  electric: "#fac000",
  grass: "#3fa129",
  ice: "#3dcef3",
  fighting: "#ff8000",
  poison: "#9141cb",
  ground: "#915121",
  flying: "#81b9ef",
  psychic: "#ef4179",
  bug: "#91a119",
  rock: "#afa981",
  ghost: "#704170",
  dragon: "#5060e1",
  dark: "#624d4e",
  steel: "#60a1b8",
  fairy: "#ef70ef",
};

// A very dark, low-saturation cut of a type colour, returned as the `h s% l%` half of an hsl()
// colour. Pokémon artwork is a PNG with transparent margins, so with nothing behind it the card
// surface shows through the picture. Filling that space with a wash of the card's own type keeps
// the artwork sitting on its own colour — water reads as a deep blue, fire as a deep red-brown —
// while staying dark enough not to compete with it.
function typeWash(hex, saturation = 42, lightness = 22) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  let hue = 0;
  if (chroma) {
    if (max === r) hue = ((g - b) / chroma + 6) % 6;
    else if (max === g) hue = (b - r) / chroma + 2;
    else hue = (r - g) / chroma + 4;
    hue *= 60;
  }
  // Scale the saturation by how colourful the type actually is. Several of the canonical colours
  // are near-neutrals (normal is #9fa19f, a grey with a 2/255 red-to-green spread) and forcing 42%
  // saturation on them turns a residual tint into a strong cast — normal would come out green.
  const colourful = Math.min(1, chroma / 0.35);
  return `${hue.toFixed(1)} ${(saturation * colourful).toFixed(1)}% ${lightness}%`;
}

async function imageToThumbDataUrl(imageUrl, { targetEdge = 180, type = "" } = {}) {
  // Fetch the image as a blob with CORS, draw to canvas, export WebP
  const img = new Image();
  img.crossOrigin = "anonymous";
  // Append cache-bust disable: no-store so we get fresh if needed, but normally CDN-cached
  const loadPromise = new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = imageUrl;
  });
  const loaded = await loadPromise;
  const longest = Math.max(loaded.naturalWidth, loaded.naturalHeight);
  if (!longest) throw new Error("zero size image");
  const scale = Math.min(1, targetEdge / longest);
  const w = Math.max(1, Math.round(loaded.naturalWidth * scale));
  const h = Math.max(1, Math.round(loaded.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  // Backdrop first, so transparent artwork is composited on top of it. Kids-deck photos are
  // opaque and have no type, so they take the plain canvas as before.
  const wash = POKE_TYPE_COLOURS[type];
  if (wash) {
    const gradient = ctx.createRadialGradient(
      w / 2,
      h / 2,
      0,
      w / 2,
      h / 2,
      Math.hypot(w, h) / 2,
    );
    // Brightest (such as it is) at the centre behind the subject, falling darker at the corners so
    // the card keeps the deck's dark look at its edges.
    gradient.addColorStop(0, `hsl(${typeWash(wash)})`);
    gradient.addColorStop(1, `hsl(${typeWash(wash, 32, 8)})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(loaded, 0, 0, w, h);
  // Prefer webp, fall back to jpeg if unsupported or tainted
  let dataUrl;
  try {
    dataUrl = canvas.toDataURL("image/webp", 0.6);
    if (!dataUrl.startsWith("data:image/webp")) {
      dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    }
  } catch (e) {
    console.log("reveal: thumb toDataURL failed (taint?)", e);
    throw e;
  }
  return dataUrl;
}

function idForChallenge(ch) {
  return ch.id || slugify(ch.name);
}

// ── Lit component ──────────────────────────────────────────────────────────

class RevealApp extends LitElement {
  static properties = {
    _theme: { type: String, reflect: true, attribute: "theme" },
    _flippedId: { state: true },
    _sharingId: { state: true },
    _sharedId: { state: true },
    _completedIds: { state: true },
    _removedIds: { state: true },
    _collection: { state: true },
    _challenges: { state: true },
    _deckId: { state: true },
    _lobby: { state: true },
    _connected: { state: true },
  };

  static styles = [
    THEME_VARS,
    SHARED_STYLES,
    css`
      :host {
        display: block;
        box-sizing: border-box;
        padding: 0.25rem;
        background: var(--bg);
        color: var(--text);
        font-family: Exo, "Exo Fallback", sans-serif;
        font-weight: 200;
        font-size: 0.85rem;
      }
      .container {
        max-width: 900px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }
      .topbar {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-shrink: 0;
        position: sticky;
        top: 0;
        z-index: 2;
        padding: 0.25rem 0;
        background: var(--bg);
      }
      .topbar .logo {
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        filter: grayscale(100%);
        opacity: 0.7;
      }
      .topbrand {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        text-decoration: none;
        color: inherit;
        flex-shrink: 0;
      }
      .topbrand:hover {
        opacity: 0.85;
      }
      .topbrand .logo {
        opacity: 1;
        transition: opacity 0.2s;
      }
      h1.title {
        flex: 1;
        min-width: 0;
        margin: 0;
        font-size: 1rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-dim);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      h1.title a {
        color: inherit;
        text-decoration: none;
      }
      h1.title a:hover {
        text-decoration: underline;
      }
      h1.title .version {
        font-size: 0.65rem;
        color: var(--text-dim);
        margin-left: 0.25rem;
        vertical-align: super;
        font-weight: 200;
      }
      .topbar user-badge {
        min-width: 0;
      }
      .topbar settings-modal {
        flex-shrink: 0;
      }
      .intro {
        padding: 0.1rem 0 0.15rem;
        text-align: center;
      }
      .intro h2 {
        margin: 0 0 0.15rem;
        font-size: 1rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-dim);
        font-weight: 600;
      }
      .intro p {
        margin: 0;
        font-size: 0.78rem;
        color: var(--text-muted);
        line-height: 1.35;
      }
      .intro-head {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin: 0 0 0.15rem;
      }
      .intro-head h2 {
        margin: 0;
      }
      /* Deck chooser lives in the footer row, to the left of Reset deck. */
      .deck-switch {
        display: inline-flex;
        gap: 0.25rem;
      }
      .deck-btn {
        font: inherit;
        font-size: 0.72rem;
        line-height: 1.5;
        padding: 0.15rem 0.4rem;
        border: 1px solid var(--btn-border);
        border-radius: 4px;
        background: var(--btn-bg);
        color: var(--text-muted);
        cursor: pointer;
      }
      .deck-btn:hover {
        border-color: #0d6efd;
      }
      .deck-btn[aria-pressed="true"] {
        background: #0d6efd;
        border-color: #0d6efd;
        color: #fff;
      }
      .deck-btn:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 1px;
      }
      .panel {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 0.4rem;
        /* Cards cast shadows outward — clipping them at the panel edge would flatten the deck */
        overflow: visible;
      }
      /* Deck chooser and reset, below the wall of cards */
      .deck-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.35rem;
      }
      .reset-btn {
        padding: 0.15rem 0.4rem;
        border: 1px solid var(--btn-border);
        border-radius: 4px;
        background: var(--btn-bg);
        color: var(--text-muted);
        font-size: 0.72rem;
      }
      .reset-btn:hover {
        background: var(--btn-hover);
        color: var(--text);
      }
      .reset-btn:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 1px;
      }
      /* Dense card grid — the central element */
      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(max(84px, calc((100% - 42px) / 8)), 1fr));
        /* Just wide enough for the card shadows to read between neighbours */
        gap: 6px;
      }
      @media (width <= 380px) {
        .card-grid {
          grid-template-columns: repeat(auto-fill, minmax(max(76px, calc((100% - 35px) / 8)), 1fr));
          gap: 5px;
        }
      }
      /* Single 3:4 flip card — front shows '?' or the picture, back shows the actions */
      .card {
        position: relative;
        aspect-ratio: 3 / 4;
        border: 1px solid var(--border);
        border-radius: 6px;
        overflow: hidden;
        background: var(--surface);
        padding: 0;
        cursor: pointer;
        perspective: 600px;
        font: inherit;
        color: inherit;
        /* Layered drop shadow + a hairline top highlight, so the wall reads as a deck of
           physical cards rather than a flat grid. Works in both themes. */
        box-shadow:
          0 1px 2px rgba(0, 0, 0, 0.45),
          0 3px 7px rgba(0, 0, 0, 0.28),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        transition:
          box-shadow 160ms ease,
          transform 160ms ease;
      }
      .card:hover {
        z-index: 1;
        transform: translateY(-1px);
        box-shadow:
          0 2px 4px rgba(0, 0, 0, 0.5),
          0 8px 18px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }
      .card:active {
        transform: translateY(0);
        box-shadow:
          0 1px 2px rgba(0, 0, 0, 0.5),
          0 2px 5px rgba(0, 0, 0, 0.32);
      }
      /* An open card sits proud of the wall, so it shades harder than its neighbours */
      .card.is-flipped,
      .card:focus-visible {
        z-index: 1;
        box-shadow:
          0 2px 5px rgba(0, 0, 0, 0.5),
          0 10px 22px rgba(0, 0, 0, 0.42);
      }
      .card:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 1px;
      }
      .flip-inner {
        position: absolute;
        inset: 0;
        transform-style: preserve-3d;
        transition: transform 220ms ease;
      }
      .card.is-flipped .flip-inner {
        transform: rotateY(180deg);
      }
      @media (prefers-reduced-motion: reduce) {
        .flip-inner,
        .card {
          transition: none;
        }
        .card:hover {
          transform: none;
        }
      }
      /* The isolation below is load-bearing, not cosmetic: the front face's hint spans carry
         z-index 1 (to sit above the completed card's thumbnail and the inner vignette), and
         without a stacking context of their own those indices leak past the sibling back face.
         On a flipped card the front face is turned away — invisible, but its spans still won
         hit-testing over the Play button, so taps in the middle of that button flipped the card
         shut instead of playing. Isolating each face keeps its children's z-index inside it, and
         hit-testing then resolves to whichever face is actually towards the viewer. Probed across
         the Play button's own rectangle: every point used to resolve to the rating stars, type
         pill or nature pill on the hidden face; with this, all of them resolve to the button. */
      .face {
        position: absolute;
        inset: 0;
        isolation: isolate;
        backface-visibility: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 0.25rem;
        box-sizing: border-box;
      }
      .face-front {
        background: var(--surface);
        color: var(--text-faint);
      }
      .face-front .q {
        font-size: 1.6rem;
        font-weight: 200;
        line-height: 1;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
      }
      .rating {
        margin-top: 0.2rem;
        color: #f5c451;
        font-size: 0.62rem;
        line-height: 1;
        letter-spacing: 0.04rem;
        white-space: nowrap;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
        z-index: 1;
      }
      /* ── Pokémon type / nature hint pills ─────────────────────────────── */
      .poke-pills {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
        margin-top: 0.28rem;
        z-index: 1;
      }
      /* Both pills bias their padding downward. The font's ascent/descent box is symmetric, but
         a short label like "fire" or "Jolly" has no descenders, so the visible ink rides above
         the middle of the pill. Equal padding measured 2.75px above the text against 3.75px
         below; taken from the top and given to the bottom, the ink sits on the centreline. */
      .type-pill {
        padding: 0.15rem 0.32rem 0.02rem;
        border-radius: 99px;
        font-size: 0.52rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: capitalize;
        line-height: 1.55;
        opacity: 0.82;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.45);
      }
      /* No opacity on the pill itself: fading the whole element composited --text-dim down to
         ~2.6:1 against the card surface, failing WCAG 1.4.3 (needs 4.5:1). It stays visually
         quiet via its low-alpha background instead, so the text keeps its full colour. */
      .nature-pill {
        padding: 0.1rem 0.3rem 0.02rem;
        border-radius: 99px;
        font-size: 0.48rem;
        font-weight: 400;
        line-height: 1.55;
        background: rgba(128,128,128,0.18);
        color: var(--text-dim);
        border: 1px solid rgba(128,128,128,0.25);
        white-space: nowrap;
        max-width: 5.5rem;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* Authentic Pokémon type colours */
      .type-pill[data-t="normal"]   { background: #9fa19f; }
      .type-pill[data-t="fire"]     { background: #e62829; }
      .type-pill[data-t="water"]    { background: #2980ef; }
      .type-pill[data-t="electric"] { background: #fac000; color: #222; text-shadow: none; }
      .type-pill[data-t="grass"]    { background: #3fa129; }
      .type-pill[data-t="ice"]      { background: #3dcef3; color: #222; text-shadow: none; }
      .type-pill[data-t="fighting"] { background: #ff8000; }
      .type-pill[data-t="poison"]   { background: #9141cb; }
      .type-pill[data-t="ground"]   { background: #915121; }
      .type-pill[data-t="flying"]   { background: #81b9ef; color: #222; text-shadow: none; }
      .type-pill[data-t="psychic"]  { background: #ef4179; }
      .type-pill[data-t="bug"]      { background: #91a119; }
      .type-pill[data-t="rock"]     { background: #afa981; }
      .type-pill[data-t="ghost"]    { background: #704170; }
      .type-pill[data-t="dragon"]   { background: #5060e1; }
      .type-pill[data-t="dark"]     { background: #624d4e; }
      .type-pill[data-t="steel"]    { background: #60a1b8; }
      .type-pill[data-t="fairy"]    { background: #ef70ef; }
      .face-front img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      /* Inner shading on the thumbnail: a hairline inner border plus a bottom vignette,
         so the picture looks set into the card. Painted over the image. */
      .face-front::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        box-shadow:
          inset 0 0 0 1px rgba(0, 0, 0, 0.18),
          inset 0 -10px 18px rgba(0, 0, 0, 0.3);
      }
      .face-back {
        background: var(--surface);
        transform: rotateY(180deg);
        box-shadow: inset 0 0 14px rgba(0, 0, 0, 0.2);
      }
      /* Solved back face: name centred between the four corner buttons */
      .back-name {
        max-width: 100%;
        box-sizing: border-box;
        padding: 0 0.25rem;
        font-size: 0.68rem;
        line-height: 1.15;
        color: var(--link);
        text-decoration: none;
        text-align: center;
        overflow-wrap: anywhere;
        max-height: 3.4em;
        overflow: hidden;
        cursor: pointer;
      }
      .back-name:hover {
        text-decoration: underline;
      }
      .back-name:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 1px;
      }
      /* Primary action on a flipped card. It is the only way out of the wall into a game, so it
         is sized to be hit reliably on a phone: full card width (capped) and 32px tall, against
         the 24px minimum of WCAG 2.5.8. A miss lands on the card underneath, which flips the
         card shut — so a small target costs the player their opened card, not just a second tap. */
      .play-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        width: 100%;
        max-width: 5.5rem;
        min-height: 2rem;
        padding: 0.3rem 0.5rem;
        border-radius: 6px;
        border: 1px solid #0a58ca;
        background: #0d6efd;
        color: #fff;
        font: inherit;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
        transition:
          background-color 120ms ease,
          box-shadow 120ms ease,
          transform 80ms ease;
      }
      /* Hover has to read at a glance on a 90px-wide card: a clearly lighter blue, plus a lift.
         The previous #0b5ed7 was within a hair of the resting #0d6efd, so hovering looked like
         nothing was happening. */
      .play-btn:hover {
        background: #2b7bff;
        border-color: #2b7bff;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
        transform: translateY(-1px);
      }
      .play-btn:active {
        background: #0a53c4;
        border-color: #0a53c4;
        box-shadow: none;
        transform: translateY(1px) scale(0.98);
      }
      /* Outline sits on the card surface, not the blue fill, so it uses the body text colour
         (high contrast in both themes) rather than another shade of blue. */
      .play-btn:focus-visible {
        outline: 2px solid var(--text);
        outline-offset: 1px;
      }
      @media (prefers-reduced-motion: reduce) {
        .play-btn {
          transition: none;
        }
        .play-btn:hover,
        .play-btn:active {
          transform: none;
        }
      }
      /* Share/Delete/Replay sit in the top-right, bottom-left and bottom-right corners; the
         top-left stays free. */
      .corner-btn {
        position: absolute;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        font-size: 0.65rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }
      .corner-btn:hover {
        background: var(--bg);
      }
      .corner-btn:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 1px;
      }
      .corner-btn[disabled] {
        opacity: 0.4;
        cursor: default;
      }
      /* Share confirmed: the button tints and shows a tick for two seconds */
      .corner-btn.shared {
        border-color: #198754;
        color: #198754;
      }
      .shared-tick {
        font-size: 0.8rem;
        line-height: 1;
      }
      /* Inline SVG glyphs (no icon font) sit on the button's own text colour */
      .corner-btn svg {
        width: 13px;
        height: 13px;
        display: block;
        fill: currentColor;
      }
      .corner-tr {
        top: 3px;
        right: 3px;
      }
      .corner-bl {
        bottom: 3px;
        left: 3px;
      }
      .corner-br {
        bottom: 3px;
        right: 3px;
      }
      /* The explanatory prose lives once, in the light DOM (index.html .seo-fallback). */
    `,
  ];

  constructor() {
    super();
    this._theme = document.documentElement.getAttribute("theme") || "dark";
    this._flippedId = null;
    this._completedIds = new Set();
    this._removedIds = new Set();
    this._collection = [];
    this._challenges = [];
    this._deckId = DECKS[0].id;
    this._lobby = null;
    this._connected = false;
    this._client = null;
  }

  connectedCallback() {
    super.connectedCallback();
    // Theme
    try {
      const t = localStorage.getItem("theme") || this._theme || "dark";
      this._theme = t;
      document.documentElement.setAttribute("theme", t);
      document.documentElement.style.colorScheme = t;
    } catch {}
    // Challenges from the selected deck's embedded hidden list (must be in DOM already)
    this._deckId = deckIdFromUrl() ?? loadDeckId();
    this._challenges = postProcessChallenges(readChallengesFromDOM(this._deck().dataId));
    this._collection = loadCollection();
    this._completedIds = new Set(this._collection.map((e) => e.id));
    this._removedIds = new Set(loadRemovedIds());
    // Listen for user name changes (badge)
    this._onNameChanged = () => this.requestUpdate();
    document.addEventListener("user-name-changed", this._onNameChanged);
    // Presence — same path as lobby
    this._connectPresence().catch((e) => console.error("reveal presence failed", e));
    // ?image= success handling (exact match, log-only on fail)
    this._handleReturnParam().catch((e) => console.log("reveal: handleReturnParam error", e));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("user-name-changed", this._onNameChanged);
    try {
      this._lobby?.leave();
    } catch {}
    try {
      this._client?.stop();
    } catch {}
  }

  // The selected deck (falls back to the first when the stored id is unknown)
  _deck() {
    return DECKS.find((d) => d.id === this._deckId) ?? DECKS[0];
  }

  // Switching deck swaps the wall and the title; the collection itself is shared by all decks,
  // so a picture completed in one is still completed when you come back to it.
  _setDeck(id) {
    const deck = DECKS.find((d) => d.id === id) ?? DECKS[0];
    saveDeckId(deck.id);
    // Choosing a deck makes it the remembered one, so any ?mode= naming a different deck loses its
    // say — otherwise the next reload would jump back to the linked deck instead of the one picked
    // here. This is what makes ?mode= a per-visit preference: the link sets the first view, and the
    // buttons (via the stored deck) take over from then on.
    this._dropModeParam();
    if (deck.id !== this._deckId || !this._challenges.length) {
      this._deckId = deck.id;
      this._challenges = postProcessChallenges(readChallengesFromDOM(deck.dataId));
      this._flippedId = null;
    }
    this.requestUpdate();
  }

  // Exact image match, searched across every deck so a return URL still awards its card when the
  // selected deck was switched (or the stored deck cleared) since the game was launched.
  _matchChallenge(image) {
    for (const deck of DECKS) {
      const challenges =
        deck.id === this._deckId && this._challenges.length
          ? this._challenges
          : postProcessChallenges(readChallengesFromDOM(deck.dataId));
      const ch =
        challenges.find((c) => c.imageUrl === image) ||
        challenges.find((c) => decodeURIComponent(c.imageUrl) === image);
      if (ch) return { ch, deck };
    }
    return null;
  }

  async _connectPresence() {
    const baseHost =
      typeof NCHANBASE !== "undefined" && NCHANBASE ? NCHANBASE : "billiards-network.onrender.com";
    let baseUrl = `https://${baseHost}`;
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      const protocol = location.protocol === "https:" ? "https:" : "http:";
      baseUrl = `${protocol}//${location.host}`;
    }
    const client = new MessagingClient({ baseUrl });
    client.setVersion(formatVersion(CLIENTVERSION));
    this._client = client;
    const lobby = await client.joinLobby({
      messageType: "presence",
      type: "join",
      userId: userStore.clientId,
      userName: userStore.userName,
    });
    this._lobby = lobby;
    this._connected = true;
    this.requestUpdate();
    // Keep presence fresh on name change via updatePresence
    this._presenceNameListener = (e) => {
      const detail = e.detail || {};
      const userName = detail.userName || userStore.userName;
      const userId = detail.userId || userStore.clientId;
      lobby
        .updatePresence({ userId, userName })
        .catch((err) => console.error("reveal: updatePresence failed", err));
    };
    document.addEventListener("user-name-changed", this._presenceNameListener);
  }

  async _handleReturnParam() {
    const params = new URLSearchParams(window.location.search);
    const rawImage = params.get("image");
    if (!rawImage) return;
    // The return URL is single-use: it identifies the completed picture and carries the
    // whole-game replay state, so anyone it is copied to would be awarded the card. Strip
    // both params from the address bar now — before the async thumbnail work and before
    // persistence — so there is no window where the URL can be copied. Everything needed
    // below is held in memory (params/match/state), not re-read from the URL.
    this._stripReturnParams();
    let decoded;
    try {
      decoded = decodeURIComponent(rawImage);
    } catch {
      decoded = rawImage;
    }
    const hit = this._matchChallenge(decoded);
    if (!hit) {
      console.log("reveal: ?image= did not match any challenge, ignoring", decoded.slice(0, 120));
      // Params already stripped — no card minted, nothing persisted
      return;
    }
    // Returned from a game launched in another deck: switch to it so the new card is on screen
    if (hit.deck.id !== this._deckId) this._setDeck(hit.deck.id);
    const match = hit.ch;
    const id = idForChallenge(match);
    // The game returns the whole-game replay state alongside the image on success
    const state = params.get("state") || "";
    // Already completed? Move to front, refresh the replay state if one was returned
    if (this._completedIds.has(id)) {
      console.log("reveal: already completed", id);
      const col = loadCollection();
      const idx = col.findIndex((e) => e.id === id);
      if (idx >= 0) {
        const [entry] = col.splice(idx, 1);
        entry.completedAt = Date.now();
        if (state) {
          entry.state = state;
          entry.replayUrl = revealReplayUrl({ imageUrl: entry.imageUrl, state });
        }
        col.unshift(entry);
        saveCollection(col);
        this._collection = col;
        this.requestUpdate();
      }
      return;
    }
    // Generate thumb, persist
    let thumb = "";
    try {
      thumb = await imageToThumbDataUrl(match.imageUrl, { type: match.pokeType });
    } catch (e) {
      console.log("reveal: thumb generation failed, card stays unsolved", e);
      return;
    }
    const entry = {
      id,
      name: match.name,
      imageUrl: match.imageUrl,
      wikipediaUrl: match.wikipediaUrl,
      thumb,
      completedAt: Date.now(),
      // Whole-game replay state — source of the card's replay/share link
      state,
      replayUrl: revealReplayUrl({ imageUrl: match.imageUrl, state }),
    };
    const col = loadCollection();
    col.unshift(entry);
    if (col.length > MAX_COMPLETED) col.length = MAX_COMPLETED;
    saveCollection(col);
    this._collection = col;
    this._completedIds = new Set(col.map((e) => e.id));
    // A picture completed again is back in the deck even if it had been deleted
    if (this._removedIds.has(id)) {
      const removed = new Set(this._removedIds);
      removed.delete(id);
      saveRemovedIds([...removed]);
      this._removedIds = removed;
    }
    this.requestUpdate();
  }

  // Rewrite the address-bar query ('' clears it entirely), keeping the path and hash
  _replaceQuery(search) {
    history.replaceState(null, "", location.pathname + (search ? `?${search}` : "") + location.hash);
  }

  // Drop the single-use return params so the URL cannot be copied or refreshed into a re-award.
  // The whole query goes now, not just ?image=/?state=: the return URL is single-use and everything
  // it carried is either held in memory or already persisted, so nothing needs to stay in the bar.
  _stripReturnParams() {
    if (!window.location.search) return;
    this._replaceQuery("");
  }

  // Clear a ?mode= link's claim on the deck without disturbing any other param
  _dropModeParam() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("mode")) return;
    params.delete("mode");
    this._replaceQuery(params.toString());
  }

  _entryFor(ch) {
    const id = idForChallenge(ch);
    return this._collection.find((en) => en.id === id || en.imageUrl === ch.imageUrl);
  }

  // Replay link for the game, derived from the stored state (`` when unavailable)
  _replayUrlFor(entry) {
    if (!entry) return "";
    return (
      entry.replayUrl ||
      (entry.state ? revealReplayUrl({ imageUrl: entry.imageUrl, state: entry.state }) : "")
    );
  }

  // Every card flips, solved or not: front is the picture (or '?'), back is the actions
  _onFlip(ch) {
    const id = idForChallenge(ch);
    this._flippedId = this._flippedId === id ? null : id;
  }

  _onPlay(e, ch) {
    e.stopPropagation();
    const url = revealGameUrl({
      imageUrl: ch.imageUrl,
      userId: userStore.clientId,
      userName: userStore.userName,
      lod: userStore.lod,
      flip: userStore.flip,
      rating: ch.normRating ?? ch.rankRating ?? ch.rating,
      stars: ch.stars,
      custom: userStore.getCustom(),
    });
    window.location.href = url;
  }

  async _onShare(e, ch) {
    e.stopPropagation();
    // Share the card's game replay, built like ../billiards does: ruletype + state only, no
    // image/wiki params. Nothing to share without a state, so the button no-ops.
    const state = this._entryFor(ch)?.state;
    if (!state) return;
    const id = idForChallenge(ch);
    this._sharingId = id;
    const shortUrl = await shortenUrl(revealReplayUrl({ state }));
    this._sharingId = null;
    // Mobile hands off to the OS share sheet (no feedback needed), desktop copies to clipboard
    const result = await shareOrCopy(shortUrl);
    if (result !== "copied") return;
    this._sharedId = id;
    setTimeout(() => {
      this._sharedId = null;
    }, 2000);
  }

  _onReplay(e, ch) {
    e.stopPropagation();
    const url = this._replayUrlFor(this._entryFor(ch));
    if (!url) return; // muted for cards completed before the game returned a state
    window.open(url, "_blank", "noopener");
  }

  // "New deck": clear the persisted collection (and deletions) so every card of the source deck
  // returns to the unsolved state.
  _onResetClick() {
    const solved = this._collection.length;
    const deleted = this._removedIds.size;
    if (!solved && !deleted) return;
    const parts = [];
    if (solved) parts.push(`${solved} revealed card${solved === 1 ? "" : "s"}`);
    if (deleted) parts.push(`${deleted} deleted picture${deleted === 1 ? "" : "s"}`);
    const ok = window.confirm(
      `Reset deck? This clears ${parts.join(" and ")}, setting every card back to unsolved.`
    );
    if (!ok) return;
    clearCollection();
    this._collection = [];
    this._completedIds = new Set();
    this._removedIds = new Set();
    this._flippedId = null;
    console.log("reveal: deck reset");
    this.requestUpdate();
  }

  _onDelete(e, ch) {
    e.stopPropagation();
    const id = idForChallenge(ch);
    // Deleting drops the card from the wall and remembers it, so the tile does not come back on
    // reload. The picture is gone from the deck until "Reset deck" restores the full source list.
    const next = this._collection.filter((en) => en.id !== id);
    saveCollection(next);
    this._collection = next;
    this._completedIds = new Set(next.map((en) => en.id));
    const removed = new Set(this._removedIds);
    removed.add(id);
    saveRemovedIds([...removed]);
    this._removedIds = removed;
    if (this._flippedId === id) this._flippedId = null;
    console.log("reveal: deleted", id);
    this.requestUpdate();
  }

  _renderCard(ch, completedEntry) {
    const id = idForChallenge(ch);
    const isCompleted = !!completedEntry;
    const isFlipped = this._flippedId === id;
    const classes = ["card", isCompleted ? "completed" : "", isFlipped ? "is-flipped" : ""]
      .filter(Boolean)
      .join(" ");
    const hasReplay = isCompleted && !!this._replayUrlFor(completedEntry);
    const stars = ch.stars ?? Math.min(5, Math.max(1, Math.ceil((ch.normRating ?? ch.rating) * 5)));
    // The pill only shows the first word of the nature, so that is the word the label has to
    // repeat. Shared with the pill below so the two cannot drift apart.
    const natureWord = ch.pokeNature ? ch.pokeNature.split(" ")[0] : "";
    // The card is a picture with no name on it, so the label describes what is on show rather
    // than repeating it. WCAG 2.5.3 (axe `label-content-name-mismatch`) wants the visible words
    // — the type and nature hints, then the Play button — to appear as a *contiguous* run of
    // words in the accessible name. The hints are rendered above Play, so they have to sit
    // immediately before "play" here: any word wedged between them fails the check.
    const hints = [ch.pokeType, natureWord].filter(Boolean);
    const hintPrefix = hints.length ? `${hints.join(" ")} — ` : "";
    const label = isCompleted
      ? `${ch.name} — completed, tap for actions`
      : `Mystery picture — ${hintPrefix}play to reveal, ${stars} star rating, tap to flip`;
    return html`
      <button
        class="${classes}"
        role="button"
        aria-label="${label}"
        aria-pressed="${isFlipped ? "true" : "false"}"
        title="${isCompleted ? ch.name : "Mystery picture"}"
        @click=${() => this._onFlip(ch)}
      >
        <div class="flip-inner">
          ${
            isCompleted
              ? html`<div class="face face-front">
                  <img src="${completedEntry.thumb}" alt="" loading="lazy" />
                </div>`
              : html`<div class="face face-front">
                  <span class="q" aria-hidden="true">?</span>
                  <span class="rating" role="img" aria-label="${stars} out of 5 stars"
                    >${"★".repeat(stars)}</span
                  >
                  ${ch.pokeType
                    ? html`<div class="poke-pills" aria-hidden="true">
                        <span class="type-pill" data-t="${ch.pokeType}">${ch.pokeType}</span>
                        ${natureWord
                          ? html`<span class="nature-pill" title="${ch.pokeNature}">${natureWord}</span>`
                          : ""}
                      </div>`
                    : ""}
                </div>`
          }
          <div class="face face-back">
            ${
              isCompleted
                ? html`
                    <a
                      class="back-name"
                      href="${ch.wikipediaUrl}"
                      target="_blank"
                      rel="noopener"
                      title="View ${ch.name} on Wikipedia"
                      @click=${(e) => e.stopPropagation()}
                      >${ch.name}</a
                    >
                    <button
                      class="corner-btn corner-tr ${this._sharedId === id ? "shared" : ""}"
                      type="button"
                      title="Share"
                      aria-label="Share ${ch.name}"
                      ?disabled=${this._sharingId === id}
                      @click=${(e) => this._onShare(e, ch)}
                    >
                      ${
                        this._sharedId === id
                          ? html`<span class="shared-tick" aria-hidden="true">✓</span>`
                          : html`<svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
                              />
                            </svg>`
                      }
                    </button>
                    <button
                      class="corner-btn corner-bl"
                      type="button"
                      title="Remove from collection"
                      aria-label="Remove ${ch.name} from collection"
                      @click=${(e) => this._onDelete(e, ch)}
                    >
                      ✕
                    </button>
                    <button
                      class="corner-btn corner-br"
                      type="button"
                      title="Replay"
                      aria-label="Replay ${ch.name}"
                      ?disabled=${!hasReplay}
                      @click=${(e) => this._onReplay(e, ch)}
                    >
                      ▶
                    </button>
                  `
                : html`
                    <button
                      class="play-btn"
                      type="button"
                      aria-label="Play ${ch.name}"
                      @click=${(e) => this._onPlay(e, ch)}
                    >
                      ▶ Play
                    </button>
                  `
            }
          </div>
        </div>
      </button>
    `;
  }

  render() {
    const completedById = new Map(this._collection.map((e) => [e.id, e]));
    // An empty deck whose <ul> is present has simply not been filled in yet
    const deckListPresent = !!document.getElementById(this._deck().dataId);
    // Fixed source (stored) order — no shuffle. Solved cards keep their grid position and simply
    // show their picture; deleted ones are filtered out, so the rest reflow into the gap.
    const challenges = this._challenges.filter((ch) => !this._removedIds.has(idForChallenge(ch)));
    return html`
      <div class="container">
        <header class="topbar">
          <a href="../lobby.html" class="topbrand" aria-label="Billiards lobby"
            ><img src="../assets/threecushion.png" class="logo" alt=""
          /></a>
          <h1 class="title">
            <a href="../lobby.html">Billiards</a
            ><a
              href="https://github.com/tailuge/billiards"
              target="_blank"
              rel="noopener"
              class="version"
              >${formatVersion(CLIENTVERSION)}</a
            >
          </h1>
          <trophy-item></trophy-item>
          <user-badge></user-badge>
          <settings-modal
            @theme-changed=${(e) => {
              this._theme = e.detail;
              document.documentElement.setAttribute("theme", e.detail);
              document.documentElement.style.colorScheme = e.detail;
            }}
          ></settings-modal>
        </header>

        <section class="intro">
          <div class="intro-head">
            <h2>${this._deck().title}</h2>
          </div>
          <p>
            Play billiards to uncover hidden pictures. Each successful pot reveals another part of
            the mystery image.
          </p>
        </section>

        <section class="panel" aria-labelledby="collection-heading">
          <h2 id="collection-heading" hidden>Picture collection</h2>
          <div class="card-grid">
            ${
              challenges.length
                ? challenges.map((ch) => {
                    const id = idForChallenge(ch);
                    const completedEntry = completedById.get(id);
                    return this._renderCard(ch, completedEntry);
                  })
                : html`<p style="color:var(--text-muted);font-size:0.78rem">
                    ${this._challenges.length
                      ? "No pictures left — press Reset deck to restore the wall."
                      : deckListPresent
                        ? "No pictures in this deck yet."
                        : "Loading pictures…"}
                  </p>`
            }
          </div>
          <div class="deck-footer">
            <div class="deck-switch" role="group" aria-label="Deck">
              ${DECKS.map(
                (d) => html`
                  <button
                    class="deck-btn"
                    type="button"
                    aria-pressed="${d.id === this._deckId ? "true" : "false"}"
                    title="Show the ${d.label} deck"
                    @click=${() => this._setDeck(d.id)}
                  >
                    ${d.label}
                  </button>
                `,
              )}
            </div>
            ${
              this._collection.length || this._removedIds.size
                ? html`<button
                    class="reset-btn"
                    type="button"
                    title="Clear all revealed cards and restore deleted pictures"
                    aria-label="Reset deck — clear all revealed cards and restore the full deck"
                    @click=${this._onResetClick}
                  >
                    Reset deck
                  </button>`
                : ""
            }
          </div>
        </section>

      </div>
    `;
  }
}

customElements.define("reveal-app", RevealApp);
