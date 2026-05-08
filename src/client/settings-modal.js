import { html, css } from 'lit';
import { StoreElement } from './user-store.js';
import { SHARED_STYLES, CHALLENGE_MODAL_STYLES } from './styles.js';

class SettingsModal extends StoreElement {
    static properties = { _open: { state: true }, _notifEnabled: { state: true } };
    static styles = [SHARED_STYLES, CHALLENGE_MODAL_STYLES, css`
        .burger { background: none; border: none; font-size: 1.1rem; cursor: pointer; padding: 0.1rem 0.3rem; color: var(--text-muted); line-height: 1; }
        .burger:hover { color: var(--text); background: none; }
        .row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--text); }
        label { cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
        a { color: var(--link); text-decoration: none; font-size: 0.82rem; }
        a:hover { text-decoration: underline; }
    `];

    constructor() {
        super();
        this._open = false;
        this._theme = document.documentElement.getAttribute('theme') || 'light';
        this._notifEnabled = Notification.permission === 'granted';
    }

    _toggle(e) { e.stopPropagation(); this._open = !this._open; }
    _close()   { this._open = false; }

    _setTheme(e) {
        const theme = e.target.checked ? 'dark' : 'light';
        this._theme = theme;
        document.documentElement.setAttribute('theme', theme);
        localStorage.setItem('theme', theme);
        this.dispatchEvent(new CustomEvent('theme-changed', { detail: theme, bubbles: true, composed: true }));
    }

    _share() {
        if (navigator.share) {
            navigator.share({ title: document.title, url: location.href });
        } else {
            navigator.clipboard.writeText(location.href);
        }
    }

    async _toggleNotifications(e) {
        if (e.target.checked) {
            const result = await Notification.requestPermission();
            this._notifEnabled = result === 'granted';
        } else {
            this._notifEnabled = false;
        }
        this.requestUpdate();
    }

    render() {
        return html`
            <button class="burger" aria-label="Settings" aria-expanded="${this._open}" @click=${this._toggle}>&#9776;</button>
            ${this._open ? html`
                <div class="backdrop" @click=${e => e.target === e.currentTarget && this._close()}>
                    <div class="modal" role="dialog" aria-modal="true" aria-label="Settings">
                        <h3>Settings</h3>
                        <div class="row">
                            <label>
                                <input type="checkbox" .checked=${this._theme === 'dark'} @change=${this._setTheme}>
                                Dark mode
                            </label>
                        </div>
                        <div class="row">
                            <label>
                                <input type="checkbox" .checked=${this._notifEnabled} @change=${this._toggleNotifications}>
                                Enable notifications
                            </label>
                        </div>
                        <div class="row"><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Support</a></div>
                        <div class="row"><a href="https://scoreboard-tailuge.vercel.app/usage.html" target="_blank" rel="noopener">Usage</a></div>
                        <div class="row"><a href="#" @click=${e => { e.preventDefault(); this._share(); }}>Share</a></div>
                        <button class="cancel" @click=${this._close}>Close</button>
                    </div>
                </div>` : ''}
        `;
    }
}

customElements.define('settings-modal', SettingsModal);
