import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

const genId = () => 'id' + Math.random().toString(16).slice(2, 8);

function load() {
    const p = new URLSearchParams(location.search);
    const urlId   = p.get('clientId');
    const urlName = p.get('userName');
    if (urlId) return { clientId: urlId, userName: urlName || 'Anonymous', dotColor: '#f5c518' };
    const existing = !!localStorage.getItem('clientId');
    const clientId = localStorage.getItem('clientId') || (() => { const id = genId(); localStorage.setItem('clientId', id); return id; })();
    const userName = localStorage.getItem('userName') || 'Anonymous';
    return { clientId, userName, dotColor: existing ? '#4caf50' : '#888' };
}

class UserBadge extends LitElement {
    static properties = {
        _name: { state: true },
        _editing: { state: true },
        _dotColor: { state: true }
    };

    static styles = css`
        :host { display: inline-flex; align-items: center; align-self: center; }
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 2px 10px 2px 7px;
            border-radius: 4px;
            background: #2a2a2a;
            border: 1px solid rgba(255,255,255,0.12);
            cursor: pointer;
            font-size: 0.8rem;
            color: #eee;
            transition: filter 0.15s;
        }
        .badge:hover { filter: brightness(1.3); }
        .dot {
            width: 7px; height: 7px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        input {
            width: 90px;
            background: transparent;
            border: none;
            border-bottom: 1px solid #aaa;
            color: inherit;
            font-size: inherit;
            outline: none;
            padding: 0;
        }
    `;

    constructor() {
        super();
        const { clientId, userName, dotColor } = load();
        this._clientId = clientId;
        this._name = userName;
        this._dotColor = dotColor;
        this._editing = false;
    }

    _startEdit() { this._editing = true; }

    _commit(e) {
        const val = e.target.value.trim().slice(0, 12) || 'Anonymous';
        this._name = val;
        this._editing = false;
        localStorage.setItem('userName', val);
        this.dispatchEvent(new CustomEvent('user-name-changed', {
            bubbles: true, composed: true,
            detail: { userId: this._clientId, userName: val }
        }));
    }

    _onKey(e) {
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') { this._editing = false; }
    }

    render() {
        return html`
            <div class="badge" @click=${!this._editing ? this._startEdit : null}>
                <span class="dot" style="background:${this._dotColor}"></span>
                ${this._editing
                    ? html`<input autofocus maxlength="12" .value=${this._name}
                                @blur=${this._commit} @keydown=${this._onKey}
                                @click=${e => e.stopPropagation()}>`
                    : this._name}
            </div>`;
    }
}

customElements.define('user-badge', UserBadge);
