import { LitElement, html, css } from "lit";
import { MessagingClient } from "../index.ts";
import { THEME_VARS, SHARED_STYLES } from "./styles.js";
import { userStore } from "./user-store.js";
import { formatVersion, CLIENTVERSION, NCHANBASE } from "./utils.js";
import "./user-badge.js";
import "./trophy.js";
import "./settings-modal.js";

// The pages that use this top bar (reveal, map) are served one level below the site root
// (`/reveal/`, `/map/`), so the logo and the lobby link are written for that depth. The
// canonical `lobby.html` is emitted by the same build in both the Docker image and
// `../billiards/dist`, so it resolves in either deployment. (reveal.html used the shorter
// `../lobby` for its centre link; `../lobby.html` is used everywhere here because `/lobby`
// is a Cloudflare redirect in `../billiards` that does not exist under the local nginx.)
const LOBBY_HREF = "../lobby.html";
const LOGO_SRC = "../assets/threecushion.png";

const storedTheme = () => {
  try {
    return localStorage.getItem("theme") || "dark";
  } catch {
    return "dark";
  }
};

/**
 * `<app-topbar>` — the site header used by the standalone game pages (reveal, map).
 *
 * It owns everything the header needs and nothing page-specific: the brand/logo, the version,
 * the centred link back to the lobby (which becomes a pulsing icon when a challenge offer
 * arrives), the trophy cabinet, the user badge and the settings modal. It also establishes
 * lobby presence, then announces the joined lobby with a `lobby-ready` event so that
 * `<remote-inbox>` can show chat on these pages with the lobby's own message window.
 * A host page that hands chat and challenges to another document for a while (the
 * game iframe) pauses them with `pauseMessages()` and restores them with
 * `resumeMessages()`.
 *
 * The component is the theme owner: it is the only element carrying the switch, so it applies
 * the chosen theme to the document element and to itself, then re-emits `theme-changed`
 * (bubbling, composed) so the host page can restyle its own themed tokens.
 */
class AppTopbar extends LitElement {
  static properties = {
    theme: { type: String, reflect: true, attribute: "theme" },
    ruleType: { type: String, attribute: "rule-type" },
    _hasMessage: { state: true },
  };

  static styles = [
    THEME_VARS,
    SHARED_STYLES,
    css`
      :host {
        display: block;
        background: var(--bg);
        color: var(--text);
        font-family: Exo, "Exo Fallback", sans-serif;
        font-weight: 200;
        font-size: 0.85rem;
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
      /* Always shown, centred over the top bar (absolute, out of the flex flow) so it never
         shoves or overlaps the trophy cups and other header controls. By default it is the
         only route back to the lobby; when a challenge offer arrives it swaps to a pulsing
         icon. Either state is just a link to the lobby, which owns the challenge banner. */
      .top-link {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 1;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        height: 28px;
        padding: 0 0.55rem;
        background: var(--bg);
        font-size: 0.72rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        line-height: 1;
        text-decoration: none;
        border: 1px solid var(--border);
        border-radius: 6px;
        color: inherit;
      }
      .top-link:hover {
        border-color: var(--text-dim);
      }
      .top-link:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 1px;
      }
      /* Message/challenge state: the width collapses back to a square icon. */
      .top-link--alert {
        width: 28px;
        min-width: 0;
        padding: 0;
        font-size: 1rem;
        animation: msg-pulse 2s ease-in-out infinite;
      }
      @keyframes msg-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.45;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .top-link--alert {
          animation: none;
        }
      }
    `,
  ];

  constructor() {
    super();
    this.theme = storedTheme();
    this._hasMessage = false;
    this._messagesPaused = false;
    this._lobby = null;
    this._client = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._applyTheme(this.theme);
    // Keep presence fresh when the player renames themselves in the badge
    this._onNameChanged = (e) => this._updatePresence(e);
    document.addEventListener("user-name-changed", this._onNameChanged);
    // Presence — same path as lobby
    this._connectPresence().catch((e) =>
      console.error("topbar presence failed", e),
    );
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

  // Apply a theme to the document and to this host; the host is where THEME_VARS resolves the
  // --* tokens that this component (and the islands inside it) draw with.
  _applyTheme(theme) {
    const t = theme || "dark";
    this.theme = t;
    document.documentElement.setAttribute("theme", t);
    document.documentElement.style.colorScheme = t;
  }

  // The settings modal toggled the theme: apply it and tell the host page, which re-renders its
  // own themed tokens from the event.
  _onThemeChanged(e) {
    this._applyTheme(e.detail);
    this.dispatchEvent(
      new CustomEvent("theme-changed", {
        detail: this.theme,
        bubbles: true,
        composed: true,
      }),
    );
  }

  async _connectPresence() {
    const baseHost =
      typeof NCHANBASE !== "undefined" && NCHANBASE
        ? NCHANBASE
        : "billiards-network.onrender.com";
    let baseUrl = `https://${baseHost}`;
    if (
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
    ) {
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
      // Lets a host page declare what it is (e.g. `rule-type="map"` shows the torii gate in
      // the lobby). Omitted when unset, so reveal's presence is unchanged.
      ...(this.ruleType ? { ruleType: this.ruleType } : {}),
    });
    this._lobby = lobby;
    // Hand the joined lobby to <remote-inbox>, which opens the lobby's own chat window for
    // messages that arrive while the player is on this page.
    this.dispatchEvent(
      new CustomEvent("lobby-ready", {
        detail: { lobby },
        bubbles: true,
        composed: true,
      }),
    );
    // A challenge offer still has no UI here: flag it so the top bar shows the message icon,
    // which links back to the lobby. Accepts and declines are for the challenger, not for us.
    lobby.onChallenge((msg) => {
      // While the game document owns the offer it answers it itself, so flagging
      // it here would light this page's icon for a challenge already handled.
      if (msg.type === "offer" && !this._messagesPaused) {
        this._flagPendingMessage();
      }
    });
  }

  // The joined Lobby (null until presence is up). <remote-inbox> reads this when it connects
  // after the `lobby-ready` event has already fired.
  get lobby() {
    return this._lobby;
  }

  // Re-assert this page's presence while it is still open. A second document
  // sharing the same userId (the challenge page's game iframe) publishes its
  // own leave when it unloads, which drops the single `u:<userId>` presence
  // record; this puts ours back without waiting for the next heartbeat.
  refreshPresence() {
    this._lobby
      ?.syncPresence()
      .catch((err) => console.error("topbar: refreshPresence failed", err));
  }

  // Stop this page's heartbeat while another document owns the shared `u:<userId>`
  // presence record (the challenge page's game iframe), so the two do not overwrite
  // each other. The subscription stays open, so chat and challenges still arrive.
  pausePresence() {
    this._lobby?.pauseHeartbeat();
  }

  // Hand presence back after the other document has closed: restart the heartbeat
  // (it would otherwise lapse on the server's TTL) and republish at once.
  resumePresence() {
    this._lobby?.resumeHeartbeat();
    this.refreshPresence();
  }

  // Chat and challenges belong to the game document while it is open on this page
  // (the challenge page's game iframe): the inbox drops them instead of opening
  // its own chat window or challenge card for them.
  pauseMessages() {
    this._messagesPaused = true;
    const inbox = document.querySelector("remote-inbox");
    if (inbox) inbox.paused = true;
  }

  // Hand chat and challenges back once the game document has closed.
  resumeMessages() {
    this._messagesPaused = false;
    const inbox = document.querySelector("remote-inbox");
    if (inbox) inbox.paused = false;
  }

  // Keep presence fresh on name change via updatePresence
  _updatePresence(e) {
    if (!this._lobby) return;
    const detail = e.detail || {};
    const userName = detail.userName || userStore.userName;
    const userId = detail.userId || userStore.clientId;
    this._lobby
      .updatePresence({ userId, userName })
      .catch((err) => console.error("topbar: updatePresence failed", err));
  }

  // Lights the top-bar message icon; it stays lit until the page is left for the lobby.
  _flagPendingMessage() {
    if (this._hasMessage) return;
    this._hasMessage = true;
  }

  render() {
    return html`
      <header class="topbar">
        <a href=${LOBBY_HREF} class="topbrand" aria-label="Billiards lobby"
          ><img src=${LOGO_SRC} class="logo" alt=""
        /></a>
        <h1 class="title">
          <a href=${LOBBY_HREF}>Billiards</a
          ><a
            href="https://github.com/tailuge/billiards"
            target="_blank"
            rel="noopener"
            class="version"
            >${formatVersion(CLIENTVERSION)}</a
          >
        </h1>
        <a
          class="top-link ${this._hasMessage ? "top-link--alert" : ""}"
          href=${LOBBY_HREF}
          aria-label=${this._hasMessage
            ? "New challenge — open the lobby"
            : "Back to the lobby"}
          title=${this._hasMessage ? "New challenge" : "Back to the lobby"}
          >${this._hasMessage ? "💬" : "Lobby"}</a
        >
        <trophy-item></trophy-item>
        <user-badge></user-badge>
        <settings-modal
          @theme-changed=${(e) => this._onThemeChanged(e)}
        ></settings-modal>
      </header>
    `;
  }
}

customElements.define("app-topbar", AppTopbar);
