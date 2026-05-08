import { html } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { USER_BADGE_STYLES } from './styles.js';

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

class UserBadge extends StoreElement {
    static properties = {
        _name: { state: true },
        _editing: { state: true },
        _dotColor: { state: true }
    };
    static styles = USER_BADGE_STYLES;

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
        userStore.set(this._clientId, val);
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
            <div class="badge" style="--dot-color:${this._dotColor}" @click=${!this._editing ? this._startEdit : null}>
                <span class="dot"></span>
                ${this._editing
                    ? html`<input autofocus maxlength="12" .value=${this._name}
                                @blur=${this._commit} @keydown=${this._onKey}
                                @click=${e => e.stopPropagation()}>`
                    : this._name}
            </div>`;
    }
}

customElements.define('user-badge', UserBadge);
