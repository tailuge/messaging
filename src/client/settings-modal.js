import { html, css } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { SHARED_STYLES, CHALLENGE_MODAL_STYLES } from './styles.js';
import './stats-panel.js';
import './customisation-panel.js';

class SettingsModal extends StoreElement {
    static properties = {
        _open: { state: true },
        _notifEnabled: { state: true },
        _showStats: { state: true },
        _copied: { state: true },
        _showCustomisation: { state: true }
    };
    static LOD_LABELS = ['pixelated', 'polygons', 'high poly', 'shaders', 'antialiased'];
    static styles = [SHARED_STYLES, CHALLENGE_MODAL_STYLES, css`
        .modal { padding: 0.7rem 1rem; gap: 0.3rem; }
        h3 { margin: 0 0 0.1rem; font-size: 0.9rem; }
        .burger { background: none; border: none; font-size: 1.2rem; cursor: pointer; padding: 0.0rem 0.1rem; color: var(--text-muted); line-height: 1; min-width: 28px; min-height: 32px; }
        .burger:hover { color: var(--text); background: none; }
        .row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--text); line-height: 1.3; }
        .section-title { font-size: 0.7rem; font-weight: bold; color: var(--text-muted); text-transform: uppercase; margin-top: 0.3rem; margin-bottom: 0.1rem; border-bottom: 1px solid var(--border-light); padding-bottom: 1px; }
        label { cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
        a { color: var(--link); text-decoration: none; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; }
        a:hover { text-decoration: underline; }
        .copied-badge {
            background: #198754; color: white; font-size: 0.65rem; padding: 1px 4px;
            border-radius: 4px; margin-left: 4px; animation: fadein 0.2s;
        }
        @keyframes fadein { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .lod-label { font-weight: bold; color: var(--link); }

        /* Toggle Switch CSS */
        .switch {
            position: relative;
            display: inline-block !important;
            width: 30px;
            height: 16px;
            margin-left: auto;
        }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
            position: absolute;
            cursor: pointer;
            inset: 0;
            background-color: var(--btn-border);
            transition: 0.2s;
            border-radius: 16px;
        }
        .slider:before {
            position: absolute;
            content: "";
            height: 10px;
            width: 10px;
            left: 3px;
            bottom: 3px;
            background-color: var(--surface);
            transition: 0.2s;
            border-radius: 50%;
        }
        input:checked + .slider { background-color: #0d6efd; }
        input:checked + .slider:before { transform: translateX(14px); }

        /* Styled Quality Range Slider */
        input[type="range"] {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 4px;
            background: var(--border);
            border-radius: 2px;
            outline: none;
            margin: 0.15rem 0;
        }
        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #0d6efd;
            cursor: pointer;
            transition: transform 0.1s;
        }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); }
        input[type="range"]::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border: none;
            border-radius: 50%;
            background: #0d6efd;
            cursor: pointer;
            transition: transform 0.1s;
        }
        input[type="range"]::-moz-range-thumb:hover { transform: scale(1.2); }
    `];

    constructor() {
        super();
        this._open = false;
        this._showStats = false;
        this._copied = false;
        this._showCustomisation = false;
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
    _close()   { this._open = false; this._showCustomisation = false; }

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

                        <div class="section-title">Preferences</div>
                        <div class="row">
                            <span>Dark mode</span>
                            <label class="switch">
                                <input type="checkbox" .checked=${this._theme === 'dark'} @change=${this._setTheme}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="row">
                            <span>Enable notifications</span>
                            <label class="switch">
                                <input type="checkbox" .checked=${this._notifEnabled} @change=${this._toggleNotifications}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="row">
                            <span>Flip X Axis</span>
                            <label class="switch">
                                <input type="checkbox" .checked=${userStore.flip} @change=${e => userStore.setFlip(e.target.checked)}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="row">
                            <span>Customise</span>
                            <button @click=${() => this._showCustomisation = true} style="margin-left: auto;">Open</button>
                        </div>
                        <div class="row">
                            <span>Use proxy to connect</span>
                            <label class="switch">
                                <input type="checkbox" .checked=${userStore.useProxy} @change=${e => userStore.setUseProxy(e.target.checked)}>
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div class="section-title">Graphics</div>
                        <div class="row" style="flex-direction: column; align-items: flex-start; gap: 2px;">
                            <label for="quality-range" style="font-size: 0.75rem;">Quality: <span class="lod-label">${SettingsModal.LOD_LABELS[userStore.lod] || userStore.lod}</span></label>
                            <input id="quality-range" type="range" min="0" max="4" step="1" .value=${userStore.lod} @input=${e => userStore.setLod(e.target.value)}>
                        </div>

                        <div class="section-title">Links</div>
                        <div class="row"><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Support</a></div>
                        <div class="row"><a href="https://scoreboard-tailuge.vercel.app/usage.html" target="_blank" rel="noopener">Usage</a></div>
                        <div class="row">
                            <a href="#" @click=${e => { e.preventDefault(); this._share(); }}>
                                Share
                                ${this._copied ? html`<span class="copied-badge">Copied!</span>` : ''}
                            </a>
                        </div>
                        <div class="row"><a href="#" @click=${e => { e.preventDefault(); this._showStats = !this._showStats; }}>Stats</a></div>

                        ${this._showStats ? html`<div><strong style="font-size:0.82rem">Recent visitors</strong><stats-panel></stats-panel></div>` : ''}

                        <button class="cancel" @click=${this._close} style="margin-top: 0.4rem;">Close</button>
                    </div>
                </div>
                ${this._showCustomisation ? html`
                    <customisation-panel @close=${() => this._showCustomisation = false}></customisation-panel>
                ` : ''}` : ''}
        `;
    }
}

customElements.define('settings-modal', SettingsModal);
