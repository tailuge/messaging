import { LitElement, html } from 'lit';
import { LOBBY_APP_STYLES } from './styles.js';
import './solo-panel.js';
import './info-panel.js';
import './online-panel.js';
import './user-badge.js';
import './settings-modal.js';
import './motd-panel.js';
import { CLIENTVERSION, formatVersion } from './utils.js';

class LobbyApp extends LitElement {
    static properties = {
        _theme: { type: String, reflect: true, attribute: 'theme' },
        _sidebarOpen: { type: Boolean },
    };
    static styles = LOBBY_APP_STYLES;

    constructor() {
        super();
        console.log("URL:", window.location.href);
        console.log("Search params:", Object.fromEntries(new URLSearchParams(window.location.search)));
        this._theme = document.documentElement.getAttribute('theme') || 'light';
        this._sidebarOpen = false;
        this.addEventListener('user-list-toggle', e => {
            this._sidebarOpen = e.detail.expanded;
        });
    }

    get _ctrl() {
        return this.shadowRoot.querySelector('online-panel');
    }

    render() {
        return html`
            <div class="container">
                <header class="topbar">
                    <img src="assets/threecushion.png" class="logo" alt="Billiards Logo">
                    <h1><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Billiards</a><span class="version">${formatVersion(CLIENTVERSION)}</span></h1>
                    <user-badge></user-badge>
                    <settings-modal @theme-changed=${e => { this._theme = e.detail; }}></settings-modal>
                </header>
                <main class="${this._sidebarOpen ? 'has-sidebar' : ''}">
                    <div class="solo">
                        <div class="panel">
                            <div class="panel-title">Solo Practice</div>
                            <solo-panel></solo-panel>
                        </div>
                    </div>
                    <online-panel class="panel"></online-panel>
                    <div class="motd-row panel"><motd-panel></motd-panel></div>
                    <div class="info-row"><info-panel></info-panel></div>
                </main>
                <footer style="text-align:center;font-size:0.7rem;opacity:0.7;padding:0.5rem 0">
                    Thanks for playing at <a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener" style="color:inherit">tailuge/billiards</a>. Stick around and challenge online for a free game or two.
                </footer>
            </div>
        `;
    }
}

customElements.define('lobby-app', LobbyApp);
