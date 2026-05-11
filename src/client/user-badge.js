import { html } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { USER_BADGE_STYLES } from './styles.js';

const genId = () => 'id' + Math.random().toString(16).slice(2, 8);

function load() {
    const p = new URLSearchParams(location.search);
    const urlId   = p.get('userId');
    const urlName = p.get('userName');
    if (urlId) return { clientId: urlId, userName: urlName || 'Anonymous', dotColor: '#f5c518' };
    const existing = !!localStorage.getItem('userId');
    const clientId = localStorage.getItem('userId') || (() => { const id = genId(); localStorage.setItem('userId', id); return id; })();
    const userName = urlName || localStorage.getItem('userName') || 'Anonymous';
    return { clientId, userName, dotColor: existing ? '#4caf50' : '#888' };
}

class UserBadge extends StoreElement {
    static properties = { _dotColor: { state: true } };
    static styles = USER_BADGE_STYLES;

    constructor() {
        super();
        const { clientId, userName, dotColor } = load();
        this._clientId = clientId;
        this._dotColor = dotColor;
        this._name = userName;
    }

    _commit(value) {
        const val = value.trim().slice(0, 12) || 'Anonymous';
        this._name = val;
        userStore.set(this._clientId, val);
        this.dispatchEvent(new CustomEvent('user-name-changed', {
            bubbles: true, composed: true,
            detail: { userId: this._clientId, userName: val }
        }));
    }

    render() {
        return html`
            <div class="badge" style="--dot-color:${this._dotColor}">
                <span class="dot"></span>
                <input maxlength="12" .value=${this._name}
                    aria-label="Display name"
                    @change=${e => this._commit(e.target.value)}
                    @keydown=${e => e.key === 'Enter' && e.target.blur()}>
            </div>`;
    }
}

customElements.define('user-badge', UserBadge);
