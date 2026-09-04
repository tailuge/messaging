import { LitElement, html, css } from 'lit';
import { SHARED_STYLES } from './styles.js';
import { WS_SERVER, NCHANBASE } from './utils.js';

class ArenaChat extends LitElement {
  static properties = {
    arenaId: { type: String },
    _messages: { state: true },
    _hidden: { state: true },
  };

  static styles = [
    SHARED_STYLES,
    css`
      :host { display: block; font-size: 0.8rem; }
      .chat { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.25rem; display: flex; flex-direction: column; gap: 0.2rem; }
      .header { display: flex; justify-content: space-between; align-items: center; }
      .title { margin: 0 0 .5rem; font-size: 1.1rem; font-weight: 600; color: var(--text); }
      .messages {
        display: flex; flex-direction: column; gap: 2px;
        height: calc(2.5 * 1.4rem); overflow-y: auto;
        scrollbar-width: thin; scrollbar-color: var(--border) transparent;
      }
      .messages::-webkit-scrollbar { width: 4px; }
      .messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      .messages.hidden { display: none; }
      .msg { color: var(--text); white-space: pre-wrap; word-break: break-word; line-height: 1.4; }
      .input-row { display: flex; gap: 0.3rem; }
      .input-row.hidden { display: none; }
      input { flex: 1; min-width: 0; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font: inherit; font-size: 0.8rem; padding: 0.15rem 0.3rem; }
      input:focus { outline: 2px solid #007bff; outline-offset: 1px; }
    `,
  ];

  constructor() {
    super();
    this.arenaId = '';
    this._messages = [];
    this._hidden = false;
    this._ws = null;
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._ws?.close();
  }

  updated(changed) {
    if (changed.has('arenaId') && this.arenaId) {
      this._ws?.close();
      this._messages = [];
      this._connect();
    }
  }

  _connect() {
    const url = `${WS_SERVER}/subscribe/arena/${encodeURIComponent(this.arenaId)}`;
    this._ws = new WebSocket(url);
    this._ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const text = data.message ?? e.data;
        this._messages = [...this._messages.slice(-4), String(text)];
      } catch {
        this._messages = [...this._messages.slice(-4), e.data];
      }
    };
  }

  _send() {
    const input = this.renderRoot.querySelector('input');
    const text = input.value.trim();
    if (!text || !this.arenaId) return;
    const publishBase = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? `http://${location.hostname}:8080`
      : `https://${NCHANBASE}`;
    fetch(`${publishBase}/publish/arena/${encodeURIComponent(this.arenaId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    input.value = '';
  }

  _onKeydown(e) {
    if (e.key === 'Enter') this._send();
  }

  render() {
    return html`
      <div class="chat">
        <div class="header">
          <button @click=${() => (this._hidden = !this._hidden)} aria-label="toggle chat">
            ${this._hidden ? '▸' : '▾'}
          </button>
        </div>
        <div class="messages ${this._hidden ? 'hidden' : ''}">
          ${this._messages.map((m) => html`<div class="msg">${m}</div>`)}
        </div>
        <div class="input-row ${this._hidden ? 'hidden' : ''}">
          <input maxlength="120" placeholder="message…" @keydown=${this._onKeydown} />
          <button @click=${this._send}>send</button>
        </div>
      </div>
    `;
  }
}

customElements.define('arena-chat', ArenaChat);
