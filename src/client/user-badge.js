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

    _startEdit() {
        this._editing = true;
        // Fallback: if focus never lands on the input (e.g. programmatic), close on next outside click
        this._outsideHandler = (e) => {
            if (!this.contains(e.target) && !this.shadowRoot.contains(e.target)) {
                this._commitValue();
            }
        };
        // Use capture so we catch clicks on non-focusable elements too
        document.addEventListener('click', this._outsideHandler, true);
    }

    _commitValue() {
        document.removeEventListener('click', this._outsideHandler, true);
        this._outsideHandler = null;
        const input = this.shadowRoot?.querySelector('input');
        const val = (input?.value ?? this._name).trim().slice(0, 12) || 'Anonymous';
        this._name = val;
        this._editing = false;
        userStore.set(this._clientId, val);
        this.dispatchEvent(new CustomEvent('user-name-changed', {
            bubbles: true, composed: true,
            detail: { userId: this._clientId, userName: val }
        }));
    }

    _onKey(e) {
        if (e.key === 'Enter') this._commitValue();
        if (e.key === 'Escape') {
            document.removeEventListener('click', this._outsideHandler, true);
            this._outsideHandler = null;
            this._cancelling = true;
            this._editing = false;
        }
    }

    _onBlur() {
        if (this._cancelling) { this._cancelling = false; return; }
        this._commitValue();
    }

    render() {
        return html`
            <div class="badge" style="--dot-color:${this._dotColor}"
                 @click=${!this._editing ? this._startEdit : null}>
                <span class="dot"></span>
                ${this._editing
                    ? html`<input autofocus maxlength="12" .value=${this._name}
                                aria-label="Edit display name"
                                @blur=${this._onBlur} @keydown=${this._onKey}
                                @click=${e => e.stopPropagation()}>`
                    : html`<span role="button" tabindex="0" aria-label="Display name: ${this._name}. Click to edit."
                                 @keydown=${e => (e.key === 'Enter' || e.key === ' ') && this._startEdit()}>${this._name}</span>`}
            </div>`;
    }
}

customElements.define('user-badge', UserBadge);
