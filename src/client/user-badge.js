import { html } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { USER_BADGE_STYLES } from './styles.js';
import { isVercel } from './utils.js';

class UserBadge extends StoreElement {
    static properties = { _dotColor: { state: true } };
    static styles = USER_BADGE_STYLES;

    constructor() {
        super();
        this._clientId = userStore.clientId;
        this._name = userStore.userName;
        this._dotColor = userStore.isForcedId ? '#f5c518' : '#4caf50';
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
