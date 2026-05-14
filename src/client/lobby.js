import { LitElement, html } from 'lit';
import { LOBBY_APP_STYLES } from './styles.js';
import './solo-panel.js';
import './info-panel.js';
import './online-panel.js';
import './user-badge.js';
import './settings-modal.js';

const CLIENTVERSION = 110;

class LobbyApp extends LitElement {
    static properties = { _theme: { type: String, reflect: true, attribute: 'theme' } };
    static styles = LOBBY_APP_STYLES;

    constructor() {
        super();
        console.log("URL:", window.location.href);
        console.log("Search params:", Object.fromEntries(new URLSearchParams(window.location.search)));
        this._theme = document.documentElement.getAttribute('theme') || 'light';
    }

    get _ctrl() {
        return this.shadowRoot.querySelector('online-panel');
    }

    render() {
        return html`
            <div class="container">
                <header class="topbar">
                    <img src="assets/threecushion.png" class="logo" alt="Billiards Logo">
                    <h1><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Billiards</a><span class="version">v${Math.floor(CLIENTVERSION/100)}.${String(CLIENTVERSION%100).padStart(2,'0')}</span></h1>
                    <user-badge></user-badge>
                    <settings-modal @theme-changed=${e => { this._theme = e.detail; }}></settings-modal>
                </header>
                <main>
                    <div class="main-row">
                        <div class="solo">
                            <div class="panel">
                                <div class="panel-title">Solo Practice</div>
                                <solo-panel></solo-panel>
                            </div>
                        </div>
                        <div class="players panel"><online-panel></online-panel></div>
                    </div>
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
