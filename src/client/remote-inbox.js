import { LitElement, html, css } from "lit";
import { THEME_VARS } from "./styles.js";
import { ruleIcon, ruleLabel } from "./utils.js";
import { userStore } from "./user-store.js";
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
 * It also shows an incoming challenge: the offer names the challenger and the rule, and Accept
 * hands the offer back to the lobby (`lobby.html?acceptTableId=…&opponent.userId=…`), which owns
 * the accept, presence and game launch. Declining is published here, since a freshly loaded
 * lobby has no offer to decline.
 *
 * Mounted directly after `<app-topbar>`; it renders nothing until a chat or a challenge arrives.
 * The host is an out-of-flow overlay with a z-index above the challenge page's full-screen game
 * overlay, so the modal is not trapped behind it — the sticky top bar would otherwise confine
 * its children to that header's own stacking context.
 */
class RemoteInbox extends LitElement {
  static properties = {
    theme: { type: String, reflect: true, attribute: "theme" },
    _lobby: { state: true },
    _chat: { state: true },
    _challenge: { state: true },
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
    /* Incoming challenge: one small card, just who and which game. */
    .backdrop {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgb(0 0 0 / 40%);
      pointer-events: auto;
    }
    .modal {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 220px;
      max-width: calc(100vw - 2rem);
      padding: 0.9rem 1.1rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--modal-bg);
      color: var(--text);
      text-align: center;
      box-shadow: 0 10px 30px rgb(0 0 0 / 30%);
    }
    h3 {
      margin: 0;
      font-size: 0.95rem;
    }
    .rule {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    .row {
      display: flex;
      gap: 0.4rem;
      justify-content: center;
    }
    button {
      padding: 0.3rem 0.9rem;
      border: none;
      border-radius: 4px;
      color: #fff;
      font: inherit;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .accept {
      background: #198754;
    }
    .accept:hover {
      background: #157347;
    }
    .decline {
      background: #bb2d3b;
    }
    .decline:hover {
      background: #a52834;
    }
  `,
  ];

  constructor() {
    super();
    this._lobby = null;
    this._chat = null; // { userId, name } of the conversation on screen
    this._challenge = null; // incoming offer on screen
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
    lobby.onChallenge((msg) => this._onChallenge(msg));
  }

  // An offer for us goes on screen; accept/decline/cancel for that challenger clears it.
  // Arena offers carry a tournamentId and belong to the arena flow, so they are ignored.
  _onChallenge(msg) {
    if (msg.challengeeId !== userStore.clientId) return;
    if (msg.type === "offer") {
      if (!msg.options?.tournamentId) this._challenge = msg;
    } else if (this._challenge?.challengerId === msg.challengerId) {
      this._challenge = null;
    }
  }

  // Hand the offer back to the lobby, which seeds the pending challenge, publishes the
  // accept, sets presence and launches the game. Nothing about accepting lives here.
  _accept() {
    const c = this._challenge;
    if (!c) return;
    const url = new URL("../lobby.html", location.href);
    url.searchParams.set("action", "join");
    url.searchParams.set("acceptTableId", c.tableId);
    url.searchParams.set("ruletype", c.ruleType);
    url.searchParams.set("opponent.userId", c.challengerId);
    url.searchParams.set("opponent.userName", c.challengerName || c.challengerId);
    if (c.nextTurnId) url.searchParams.set("nextTurnId", c.nextTurnId);
    // Game options (raceTo, reds, shotClock, …) still have to reach the table. The lobby
    // reads the ones it knows and drops the rest, so handicap keys are simply ignored.
    for (const [key, value] of Object.entries(c.options ?? {})) {
      url.searchParams.set(key, String(value));
    }
    location.href = url.toString();
  }

  // Declining cannot be handed to the lobby: presence keeps no history, so the fresh page
  // would have no offer to decline and the challenger would keep waiting.
  _decline() {
    const c = this._challenge;
    if (!c) return;
    this._challenge = null;
    this._lobby
      ?.declineChallenge(c.challengerId, c.ruleType, c.challengerName)
      .catch((err) => console.error("remote-inbox: decline failed", err));
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
    const c = this._challenge;
    return html`
      <message-modal
        .lobby=${this._lobby}
        .targetId=${this._chat?.userId ?? null}
        .targetName=${this._chat?.name ?? ""}
        @close=${() => {
          this._chat = null;
        }}
      ></message-modal>
      ${c
        ? html`
            <div
              class="backdrop"
              @click=${(e) => e.target === e.currentTarget && this._decline()}
            >
              <div
                class="modal"
                role="dialog"
                aria-modal="true"
                aria-label="Challenge from ${c.challengerName || c.challengerId}"
              >
                <h3>Challenge from ${c.challengerName || c.challengerId}</h3>
                <p class="rule">
                  ${ruleIcon(c.ruleType)} ${ruleLabel(c.ruleType)}
                </p>
                <div class="row">
                  <button class="accept" @click=${() => this._accept()}>
                    Accept
                  </button>
                  <button class="decline" @click=${() => this._decline()}>
                    Decline
                  </button>
                </div>
              </div>
            </div>
          `
        : ""}
    `;
  }
}

customElements.define("remote-inbox", RemoteInbox);
