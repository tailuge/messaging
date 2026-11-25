import { LitElement, html, css } from "lit";
import { THEME_VARS } from "./styles.js";
import "./message-modal.js";

/**
 * `<remote-inbox>` — chat for the standalone game pages (challenge, map, reveal).
 *
 * Those pages have no chat UI of their own: `<app-topbar>` establishes lobby presence and
 * announces the joined lobby with a `lobby-ready` event. This element picks that lobby up,
 * listens for incoming chat and opens the same `<message-modal>` the lobby uses, so a message
 * that arrives mid-game is readable and answerable straight away instead of only lighting the
 * top bar's icon.
 *
 * Mounted directly after `<app-topbar>`; it renders nothing until a chat arrives. The host is
 * an out-of-flow overlay with a z-index above the challenge page's full-screen game overlay,
 * so the modal is not trapped behind it — the sticky top bar would otherwise confine its
 * children to that header's own stacking context.
 */
class RemoteInbox extends LitElement {
  static properties = {
    theme: { type: String, reflect: true, attribute: "theme" },
    _lobby: { state: true },
    _chat: { state: true },
  };

  static styles = [
    // The message window is the lobby's, and it paints itself from the tokens THEME_VARS
    // defines (--modal-bg, --btn-*, --text-muted, --link). These pages carry only their own
    // page palette, so without these the modal's background resolved to nothing and it
    // rendered transparent. Custom properties inherit into the modal's shadow root.
    THEME_VARS,
    css`
    /* Out of flow, so mounting it never adds a gap inside a page's flex column, and above
       the challenge page's full-screen game overlay (z-index 100). */
    :host {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 101;
      pointer-events: none;
    }
    /* The modal takes the clicks; the host stays transparent to them. */
    message-modal {
      pointer-events: auto;
    }
  `,
  ];

  constructor() {
    super();
    this._lobby = null;
    this._chat = null; // { userId, name } of the conversation on screen
  }

  connectedCallback() {
    super.connectedCallback();
    // Follow the page theme: `<app-topbar>` is the theme owner and re-emits `theme-changed`
    // (bubbling, composed) after it writes the attribute on the document element.
    this._syncTheme();
    this._onThemeChanged = () => this._syncTheme();
    document.addEventListener("theme-changed", this._onThemeChanged);
    this._onLobbyReady = (e) => this._bind(e.detail?.lobby);
    document.addEventListener("lobby-ready", this._onLobbyReady);
    // The top bar may have joined before this element upgraded (module order is not
    // guaranteed), in which case its `lobby-ready` event has already fired.
    const existing = document.querySelector("app-topbar")?.lobby;
    if (existing) this._bind(existing);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("theme-changed", this._onThemeChanged);
    document.removeEventListener("lobby-ready", this._onLobbyReady);
  }

  // The document element may not carry the attribute yet if this element upgrades before the
  // top bar; the stored choice (and the dark default these pages use) covers that gap.
  _syncTheme() {
    let stored = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {
      // Storage can be blocked; the default below is the right one for these pages.
    }
    this.theme = document.documentElement.getAttribute("theme") || stored || "dark";
  }

  // One lobby per page: bind to its chat stream once.
  _bind(lobby) {
    if (!lobby || lobby === this._lobby) return;
    this._lobby = lobby;
    lobby.onChat((msg) => this._open(msg));
  }

  // A chat arrived: open it on the sender so the text is read straight away and can be
  // answered without going back to the lobby first.
  _open(msg) {
    if (!msg?.text) return;
    const name =
      (this._lobby?.getUsers?.() ?? []).find((u) => u.userId === msg.senderId)
        ?.userName || msg.senderId;
    this._chat = { userId: msg.senderId, name };
  }

  render() {
    return html`
      <message-modal
        .lobby=${this._lobby}
        .targetId=${this._chat?.userId ?? null}
        .targetName=${this._chat?.name ?? ""}
        @close=${() => {
          this._chat = null;
        }}
      ></message-modal>
    `;
  }
}

customElements.define("remote-inbox", RemoteInbox);
