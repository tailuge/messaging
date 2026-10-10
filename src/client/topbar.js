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
 * the centred link back to the lobby (which becomes a pulsing icon when a chat or challenge
 * arrives), the trophy cabinet, the user badge and the settings modal. It also establishes
 * lobby presence and shows a small read-only popover for chat that arrives while the player is
 * on the page — the lobby itself owns the real chat window.
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
    _pendingChats: { state: true },
    _popoverOpen: { state: true },
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
         only route back to the lobby; when a chat message or challenge arrives it swaps to
         a pulsing icon. Either state is just a link to the lobby, which owns the chat window
         and challenge banner and knows how to present them. */
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
      /* Chat popover: a compact, read-only summary of messages that arrived while the player
         was on this page (they have no chat UI here). Each line is "sender: text"; the Lobby
         button navigates back so the conversation can be continued there. Clicking outside
         (or Escape) dismisses it while leaving the pulsing icon as the reminder. */
      .chat-popover {
        position: absolute;
        top: calc(50% + 20px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 3;
        width: min(20rem, calc(100vw - 2rem));
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.5rem 0.6rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
        font-size: 0.78rem;
        line-height: 1.35;
      }
      .chat-popover ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        max-height: 10rem;
        overflow-y: auto;
      }
      .chat-popover-sender {
        font-weight: 600;
      }
      .chat-popover-text {
        color: var(--text-muted);
        overflow-wrap: anywhere;
      }
      .chat-popover-actions {
        display: flex;
        justify-content: flex-end;
      }
      .chat-popover-lobby {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        padding: 0.25rem 0.6rem;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 6px;
        color: inherit;
        text-decoration: none;
        font-size: 0.72rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .chat-popover-lobby:hover {
        border-color: var(--text-dim);
      }
      .chat-popover-lobby:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 1px;
      }
    `,
  ];

  constructor() {
    super();
    this.theme = storedTheme();
    this._hasMessage = false;
    this._pendingChats = [];
    this._popoverOpen = false;
    this._lobby = null;
    this._client = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._applyTheme(this.theme);
    // Keep presence fresh when the player renames themselves in the badge
    this._onNameChanged = (e) => this._updatePresence(e);
    document.addEventListener("user-name-changed", this._onNameChanged);
    // Dismiss the chat popover when the player clicks anywhere outside it, or presses Escape
    this._onDocPointerDown = (e) => this._handleDocPointerDown(e);
    document.addEventListener("pointerdown", this._onDocPointerDown);
    this._onDocKeyDown = (e) => {
      if (e.key === "Escape" && this._popoverOpen) this._dismissPopover();
    };
    document.addEventListener("keydown", this._onDocKeyDown);
    // Presence — same path as lobby
    this._connectPresence().catch((e) =>
      console.error("topbar presence failed", e),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("user-name-changed", this._onNameChanged);
    document.removeEventListener("pointerdown", this._onDocPointerDown);
    document.removeEventListener("keydown", this._onDocKeyDown);
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
    // A chat message or a challenge offer has no UI on this page. Flag it so the top bar
    // shows the message icon, which links back to the lobby for proper handling. A chat also
    // opens a small popover so the text is not lost on the way back. Challenge accepts/declines
    // are for the challenger and are not relevant here.
    lobby.onChat((msg) => this._onIncomingChat(msg));
    lobby.onChallenge((msg) => {
      if (msg.type === "offer") this._flagPendingMessage();
    });
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

  // Chat arrived while the player was here. This page has no chat window, so show a small
  // popover with the sender and text plus a route back to the lobby (where the conversation
  // lives). Keeps the last few messages so a burst is not lost to a single line.
  _onIncomingChat(msg) {
    if (!msg?.text) return;
    const sender =
      this._lobby?.getUsers?.().find((u) => u.userId === msg.senderId)?.userName ||
      msg.senderId;
    this._pendingChats = [...this._pendingChats, { sender, text: msg.text }].slice(
      -5,
    );
    this._hasMessage = true;
    this._popoverOpen = true;
  }

  // Hide the popover but keep the pending chats and the pulsing icon, so a stray click does
  // not lose the messages — the icon still leads back to the lobby.
  _dismissPopover() {
    if (!this._popoverOpen) return;
    this._popoverOpen = false;
  }

  // Click outside the popover closes it. composedPath crosses the shadow boundary back to
  // this host, so matching the popover element on the path is enough.
  _handleDocPointerDown(e) {
    if (!this._popoverOpen) return;
    const path = e.composedPath?.() ?? [];
    if (path.some((el) => el?.classList?.contains?.("chat-popover"))) return;
    this._dismissPopover();
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
            ? "New message — open the lobby"
            : "Back to the lobby"}
          title=${this._hasMessage ? "New message" : "Back to the lobby"}
          >${this._hasMessage ? "💬" : "Lobby"}</a
        >
        ${this._popoverOpen && this._pendingChats.length
          ? html`
              <div
                class="chat-popover"
                role="dialog"
                aria-label="New chat messages"
              >
                <ul>
                  ${this._pendingChats.map(
                    (c) => html`
                      <li>
                        <span class="chat-popover-sender">${c.sender}:</span>
                        <span class="chat-popover-text">${c.text}</span>
                      </li>
                    `,
                  )}
                </ul>
                <div class="chat-popover-actions">
                  <a class="chat-popover-lobby" href=${LOBBY_HREF}>Lobby</a>
                </div>
              </div>
            `
          : ""}
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
