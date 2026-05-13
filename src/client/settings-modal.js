import { html, css } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { SHARED_STYLES, CHALLENGE_MODAL_STYLES } from './styles.js';
import './stats-panel.js';

class SettingsModal extends StoreElement {
    static properties = {
        _open: { state: true },
        _notifEnabled: { state: true },
        _showStats: { state: true },
        _copied: { state: true }
    };
    static LOD_LABELS = ['pixelated', 'polygons', 'high poly', 'shaders', 'antialiased'];
    static styles = [SHARED_STYLES, CHALLENGE_MODAL_STYLES, css`
        .burger { background: none; border: none; font-size: 1.2rem; cursor: pointer; padding: 0.1rem 0.3rem; color: var(--text-muted); line-height: 1; min-width: 32px; min-height: 32px; }
        .burger:hover { color: var(--text); background: none; }
        .row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--text); }
        .section-title { font-size: 0.75rem; font-weight: bold; color: var(--text-muted); text-transform: uppercase; margin-top: 0.5rem; border-bottom: 1px solid var(--border-light); padding-bottom: 2px; }
        label { cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
        a { color: var(--link); text-decoration: none; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; }
        a:hover { text-decoration: underline; }
        .copied-badge {
            background: #198754; color: white; font-size: 0.65rem; padding: 1px 4px;
            border-radius: 4px; margin-left: 4px; animation: fadein 0.2s;
        }
        @keyframes fadein { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .lod-label { font-weight: bold; color: var(--link); }
    `];

    constructor() {
        super();
        this._open = false;
        this._showStats = false;
        this._copied = false;
        this._theme = document.documentElement.getAttribute('theme') || 'light';
        this._notifEnabled = Notification.permission === 'granted';
        this._onKeydown = this._onKeydown.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('keydown', this._onKeydown);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this._onKeydown);
    }

    _onKeydown(e) {
        if (this._open && e.key === 'Escape') {
            this._close();
        }
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
        if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            navigator.share({ title: document.title, url: location.href });
        } else {
            navigator.clipboard.writeText(location.href).then(() => {
                this._copied = true;
                setTimeout(() => { this._copied = false; }, 2000);
            });
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

                        <div class="section-title">⚙️ Preferences</div>
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

                        <div class="section-title">🎨 Graphics</div>
                        <div class="row" style="flex-direction: column; align-items: flex-start; gap: 2px;">
                            <label for="quality-range" style="font-size: 0.75rem;">Quality: <span class="lod-label">${SettingsModal.LOD_LABELS[userStore.lod] || userStore.lod}</span></label>
                            <input id="quality-range" type="range" min="0" max="4" step="1" .value=${userStore.lod} @input=${e => userStore.setLod(e.target.value)} style="width: 100%;">
                        </div>

                        <div class="section-title">🤝 Community</div>
                        <div class="row"><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener"><span>🛠️</span> Support</a></div>
                        <div class="row"><a href="https://scoreboard-tailuge.vercel.app/usage.html" target="_blank" rel="noopener"><span>📊</span> Usage</a></div>
                        <div class="row">
                            <a href="#" @click=${e => { e.preventDefault(); this._share(); }}>
                                <span>🔗</span> Share
                                ${this._copied ? html`<span class="copied-badge">Copied!</span>` : ''}
                            </a>
                        </div>
                        <div class="row"><a href="#" @click=${e => { e.preventDefault(); this._showStats = !this._showStats; }}><span>📈</span> Stats</a></div>

                        ${this._showStats ? html`<div><strong style="font-size:0.82rem">Recent visitors</strong><stats-panel></stats-panel></div>` : ''}
                        <button class="cancel" @click=${this._close} style="margin-top: 0.5rem;">Close</button>
                    </div>
                </div>` : ''}
        `;
    }
}

customElements.define('settings-modal', SettingsModal);
