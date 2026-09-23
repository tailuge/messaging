import { LitElement, html, css } from "lit";
import { MessagingClient } from "../../index.ts";
import { THEME_VARS, SHARED_STYLES } from "../styles.js";
import { userStore } from "../user-store.js";
import { revealGameUrl, revealReplayUrl, formatVersion, CLIENTVERSION, NCHANBASE } from "../utils.js";
import "../user-badge.js";
import "../trophy.js";
import "../settings-modal.js";

const STORAGE_KEY = "reveal:collection";
const MAX_COMPLETED = 20;

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function readChallengesFromDOM() {
  const ul = document.getElementById("challenge-data");
  if (!ul) return [];
  const anchors = [...ul.querySelectorAll("a[data-image]")];
  return anchors
    .map((a) => {
      const name = a.textContent.trim();
      const imageUrl = a.getAttribute("data-image") || "";
      // Respect both &amp; in HTML and raw &
      const wikipediaUrl = a.getAttribute("href") || "";
      // href may be empty if anchor is malformed
      return {
        name,
        imageUrl: imageUrl.trim(),
        wikipediaUrl: wikipediaUrl.trim(),
        id: slugify(name),
      };
    })
    .filter((c) => c.imageUrl);
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

async function imageToThumbDataUrl(imageUrl, targetEdge = 180) {
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
    _completedIds: { state: true },
    _collection: { state: true },
    _challenges: { state: true },
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
        font-family: Exo, sans-serif;
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
      .panel {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 0.4rem;
        overflow: hidden;
      }
      .count {
        font-size: 0.72rem;
        color: var(--text-muted);
        text-align: right;
        margin-top: 0.25rem;
      }
      /* Dense card grid — the central element */
      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
        gap: 4px;
      }
      @media (width <= 380px) {
        .card-grid {
          grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
        }
      }
      /* Card — 3:4 aspect, two states: mystery flipping vs completed thumb */
      .card {
        position: relative;
        aspect-ratio: 3 / 4;
        border: 1px solid var(--border);
        border-radius: 6px;
        overflow: hidden;
        background: var(--surface);
        padding: 0;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        perspective: 600px;
      }
      .card:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 1px;
      }
      /* Completed card: no perspective/flip, always thumb */
      .card.completed {
        perspective: none;
        cursor: default;
      }
      .card.completed .flip-inner {
        transform: none !important;
      }
      .flip-inner {
        flex: 1;
        position: relative;
        transform-style: preserve-3d;
        transition: transform 220ms ease;
        min-height: 0;
      }
      .card.is-flipped .flip-inner {
        transform: rotateY(180deg);
      }
      @media (prefers-reduced-motion: reduce) {
        .flip-inner {
          transition: none;
        }
      }
      .face {
        position: absolute;
        inset: 0;
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
      }
      .face-back {
        background: var(--surface);
        transform: rotateY(180deg);
        gap: 0.2rem;
      }
      .play-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        border: 1px solid #0d6efd;
        background: #0d6efd;
        color: #fff;
        font: inherit;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
      }
      .play-btn:hover {
        background: #0b5ed7;
        border-color: #0a58ca;
      }
      .play-btn:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 1px;
      }
      /* Completed card body */
      .thumb-wrap {
        flex: 1;
        min-height: 0;
        width: 100%;
        position: relative;
        overflow: hidden;
        background: #000;
      }
      .thumb-wrap img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .card-name {
        font-size: 0.72rem;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 0.15rem 0.25rem;
        text-align: center;
        width: 100%;
        box-sizing: border-box;
        background: var(--surface);
        border-top: 1px solid var(--border);
      }
      /* Edge icons on completed card — near edges to obscure minimal image */
      .edge-actions {
        position: absolute;
        top: 2px;
        right: 2px;
        display: flex;
        gap: 2px;
      }
      .edge-actions.bottom {
        top: auto;
        bottom: 2px;
        right: 2px;
        left: 2px;
        justify-content: space-between;
      }
      .icon-btn {
        width: 22px;
        height: 22px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.7);
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 0.65rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        backdrop-filter: blur(2px);
      }
      .icon-btn:hover {
        background: rgba(0, 0, 0, 0.75);
      }
      .icon-btn:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 1px;
      }
      .icon-btn[disabled] {
        opacity: 0.45;
        cursor: default;
      }
      /* Completed tick overlay */
      .tick {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #198754;
        color: #fff;
        font-size: 0.65rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #fff;
      }
      /* SEO prose dup inside shadow — styled like light-DOM fallback but tighter */
      .seo {
        padding: 0.35rem 0;
        font-size: 0.78rem;
        line-height: 1.5;
      }
      .seo h2 {
        font-size: 0.85rem;
        font-weight: 600;
        margin: 0.5rem 0 0.15rem;
        color: var(--text-dim);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .seo h3 {
        font-size: 0.78rem;
        font-weight: 600;
        margin: 0.4rem 0 0.1rem;
      }
      .seo ol,
      .seo ul {
        margin: 0.15rem 0 0.35rem 1.1rem;
        padding: 0;
      }
      .seo li {
        margin-bottom: 0.12rem;
      }
      .seo a {
        color: var(--link);
        text-decoration: none;
      }
      .seo a:hover {
        text-decoration: underline;
      }
      .seo .attribution {
        font-size: 0.7rem;
        color: var(--text-muted);
        margin-top: 0.6rem;
      }
    `,
  ];

  constructor() {
    super();
    this._theme = document.documentElement.getAttribute("theme") || "dark";
    this._flippedId = null;
    this._completedIds = new Set();
    this._collection = [];
    this._challenges = [];
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
    // Challenges from embedded hidden list (must be in DOM already)
    this._challenges = readChallengesFromDOM();
    this._collection = loadCollection();
    this._completedIds = new Set(this._collection.map((e) => e.id));
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
    let decoded;
    try {
      decoded = decodeURIComponent(rawImage);
    } catch {
      decoded = rawImage;
    }
    // Ensure challenges are available (DOM may not have been parsed when connectedCallback ran early)
    if (!this._challenges.length) {
      this._challenges = readChallengesFromDOM();
    }
    const match =
      this._challenges.find((c) => c.imageUrl === decoded) ||
      this._challenges.find((c) => decodeURIComponent(c.imageUrl) === decoded);
    if (!match) {
      console.log("reveal: ?image= did not match any challenge, ignoring", decoded.slice(0, 120));
      // Strip params so refresh doesn't re-evaluate, but don't persist
      this._stripReturnParams();
      return;
    }
    const id = idForChallenge(match);
    // The game returns the whole-game replay state alongside the image on success
    const state = params.get("state") || "";
    // Already completed? Move to front, refresh the replay state if one was returned
    if (this._completedIds.has(id)) {
      console.log("reveal: already completed", id);
      this._stripReturnParams();
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
      thumb = await imageToThumbDataUrl(match.imageUrl);
    } catch (e) {
      console.log("reveal: thumb generation failed, card stays unsolved", e);
      this._stripReturnParams();
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
    this._stripReturnParams();
    this.requestUpdate();
  }

  // Drop the return params so a refresh cannot re-award the card
  _stripReturnParams() {
    const params = new URLSearchParams(window.location.search);
    params.delete("image");
    params.delete("state");
    const next = params.toString();
    history.replaceState(null, "", location.pathname + (next ? `?${next}` : "") + location.hash);
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

  _onFlip(ch) {
    const id = idForChallenge(ch);
    if (this._completedIds.has(id)) return;
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
      custom: userStore.getCustom(),
    });
    window.location.href = url;
  }

  _onShare(e, ch) {
    e.stopPropagation();
    // Sharing a reveal shares the game replay link (state included), not the collection
    const shareUrl = this._replayUrlFor(this._entryFor(ch)) || ch.wikipediaUrl || ch.imageUrl;
    if (!shareUrl) return;
    // Prefer clipboard, fall back to logging for manual copy
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(shareUrl)
        .catch(() => console.log("reveal: clipboard write failed"));
    } else {
      console.log("reveal: share", shareUrl);
    }
  }

  _onReplay(e, ch) {
    e.stopPropagation();
    const url = this._replayUrlFor(this._entryFor(ch));
    if (!url) return; // muted for cards completed before the game returned a state
    window.open(url, "_blank", "noopener");
  }

  _onDelete(e, ch) {
    e.stopPropagation();
    // Hook: log-only no-op for now (renders the affordance, not yet destructive in v1)
    console.log("reveal: delete hook", idForChallenge(ch));
    // If you want it destructive in v1, uncomment:
    // const id = idForChallenge(ch);
    // const next = removeFromCollection(id);
    // this._collection = next;
    // this._completedIds = new Set(next.map(en => en.id));
    // if (this._flippedId === id) this._flippedId = null;
  }

  _renderCard(ch, completedEntry) {
    const id = idForChallenge(ch);
    const isCompleted = !!completedEntry;
    const isFlipped = this._flippedId === id && !isCompleted;
    const classes = ["card", isCompleted ? "completed" : "", isFlipped ? "is-flipped" : ""]
      .filter(Boolean)
      .join(" ");
    if (isCompleted) {
      const hasReplay = !!this._replayUrlFor(completedEntry);
      return html`
        <div class="${classes}" role="listitem" aria-label="${ch.name} — completed">
          <div class="thumb-wrap">
            <img src="${completedEntry.thumb}" alt="" loading="lazy" />
            <span class="tick" aria-hidden="true">✓</span>
            <div class="edge-actions">
              <button
                class="icon-btn"
                title="Share"
                aria-label="Share ${ch.name}"
                @click=${(e) => this._onShare(e, ch)}
              >
                ⤴
              </button>
              <button
                class="icon-btn"
                title="View on Wikipedia"
                aria-label="View ${ch.name} on Wikipedia"
                @click=${(e) => {
                  e.stopPropagation();
                  window.open(ch.wikipediaUrl, "_blank", "noopener");
                }}
              >
                ⓦ
              </button>
            </div>
            <div class="edge-actions bottom">
              <button
                class="icon-btn"
                title="Replay"
                aria-label="Replay ${ch.name}"
                ?disabled=${!hasReplay}
                @click=${(e) => this._onReplay(e, ch)}
              >
                ▶
              </button>
              <button
                class="icon-btn"
                title="Remove from collection"
                aria-label="Remove ${ch.name} from collection"
                @click=${(e) => this._onDelete(e, ch)}
              >
                ✕
              </button>
            </div>
          </div>
          <div class="card-name" title="${ch.name}">${ch.name}</div>
        </div>
      `;
    }
    return html`
      <button
        class="${classes}"
        role="listitem"
        aria-label="Mystery picture — tap to reveal play"
        aria-pressed="${isFlipped ? "true" : "false"}"
        @click=${() => this._onFlip(ch)}
      >
        <div class="flip-inner">
          <div class="face face-front"><span class="q" aria-hidden="true">?</span></div>
          <div class="face face-back">
            <button
              class="play-btn"
              type="button"
              aria-label="Play ${ch.name}"
              @click=${(e) => this._onPlay(e, ch)}
            >
              ▶ Play
            </button>
          </div>
        </div>
      </button>
    `;
  }

  render() {
    const completedById = new Map(this._collection.map((e) => [e.id, e]));
    // Fixed XML order (source order), completed not separated — but thumb cards show where completed
    // To make the collection feel like favourites wall, we keep source order; completed simply render as thumbs.
    const challenges = this._challenges;
    return html`
      <div class="container">
        <header class="topbar">
          <a href="./lobby.html" class="topbrand" aria-label="Billiards lobby"
            ><img src="../assets/threecushion.png" class="logo" alt=""
          /></a>
          <h1 class="title">
            <a href="./lobby.html">Billiards</a
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
          <h2>Pot &amp; Reveal</h2>
          <p>
            Play billiards to uncover hidden pictures. Each successful pot reveals another part of
            the image.
          </p>
        </section>

        <section class="panel" aria-labelledby="collection-heading">
          <h2 id="collection-heading" hidden>Picture collection</h2>
          <div class="card-grid" role="list">
            ${
              challenges.length
                ? challenges.map((ch) => {
                    const id = idForChallenge(ch);
                    const completedEntry = completedById.get(id);
                    return this._renderCard(ch, completedEntry);
                  })
                : html`<p style="color:var(--text-muted);font-size:0.78rem">Loading pictures…</p>`
            }
          </div>
          <div class="count" aria-live="polite">
            ${this._collection.length ? `${this._collection.length} of ${challenges.length} revealed · ${MAX_COMPLETED} max` : ""}
          </div>
        </section>

        <section class="seo panel" aria-label="How to play and FAQ">
          <h2>How to play</h2>
          <ol>
            <li>Choose a mystery picture from the wall.</li>
            <li>Tap the card to flip it and press Play.</li>
            <li>Pot balls in the billiards game to progressively reveal the photograph.</li>
            <li>Complete the challenge to keep the picture in your collection of favourites.</li>
          </ol>
          <h2>About Pot &amp; Reveal</h2>
          <p>
            Pot &amp; Reveal is a free online billiards game where photographs are progressively
            uncovered as you play. The game runs entirely in the browser with nothing to download —
            realistic ball physics, spin and cushion behaviour reproduced in WebGL. Each picture can
            be approached in any order; there is no daily order, streak or quota.
          </p>
          <p>
            The page is part of the open-source tailuge/billiards project. It feels like the
            existing lobby and arena, uses the same billiards engine, and reuses the same online
            presence so other players can see you are online while you build your collection.
          </p>
          <h2>FAQ</h2>
          <h3>What is Pot &amp; Reveal?</h3>
          <p>
            A free online billiards game where photographs are progressively uncovered as you play.
          </p>
          <h3>How are pictures revealed?</h3>
          <p>
            Each successful pot reveals another section of the hidden photograph. The more you pot,
            the more of the image you see.
          </p>
          <h3>Do I need to download anything?</h3>
          <p>No. The game runs directly in the web browser on desktop or mobile.</p>
          <h3>Can I share a reveal?</h3>
          <p>
            Yes. Completed pictures keep a share and replay link. Sharing is for the individual
            reveal, not the entire collection.
          </p>
          <h3>Is there a right order?</h3>
          <p>
            No. Pick any mystery card you like — the wall is in a fixed order; your solved
            favourites stay with you and the rest remain mysteries until you solve them.
          </p>
          <p class="attribution">
            Images from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a> and linked
            Wikipedia pages, individually attributed on the completed card. Played via the
            tailuge/billiards engine.
          </p>
        </section>
      </div>
    `;
  }
}

customElements.define("reveal-app", RevealApp);
