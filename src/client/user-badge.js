import { html } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { USER_BADGE_STYLES } from './styles.js';
import { isVercel } from './utils.js';

function load() {
    const p = new URLSearchParams(location.search);
    const urlId   = (p.get('userId') || '').trim();
    const urlName = p.get('userName');
    
    // If URL provides a valid ID, use it, otherwise use the one from the store (which is guaranteed to be valid)
    const clientId = urlId.length >= 2 ? urlId : userStore.clientId;
    const userName = urlName || userStore.userName;
    const dotColor = urlId.length >= 2 ? '#f5c518' : '#4caf50';
    
    return { clientId, userName, dotColor };
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
        if (isVercel) return html``;
        return html`
            <div class="badge" style="--dot-color:${this._dotColor}">
                <span class="dot"></span>
                <input maxlength="12" .value=${this._name}
                    name="display-name" autocomplete="nickname"
                    style="width: ${Math.max(this._name.length, 1)}ch"
                    aria-label="Display name"
                    @input=${e => e.target.style.width = Math.max(e.target.value.length, 1) + 'ch'}
                    @change=${e => this._commit(e.target.value)}
                    @keydown=${e => e.key === 'Enter' && e.target.blur()}>
            </div>`;
    }
}

customElements.define('user-badge', UserBadge);
