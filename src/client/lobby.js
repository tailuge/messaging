import { LitElement, html } from 'lit';
import { LOBBY_APP_STYLES } from './styles.js';
import './solo-panel.js';
import './info-panel.js';
import './online-panel.js';
import './user-badge.js';
import './settings-modal.js';

class LobbyApp extends LitElement {
    static properties = { _theme: { type: String, reflect: true, attribute: 'theme' } };
    static styles = LOBBY_APP_STYLES;

    constructor() {
        super();
        this._theme = document.documentElement.getAttribute('theme') || 'light';
    }

    get _ctrl() {
        return this.shadowRoot.querySelector('online-panel');
    }

    render() {
        return html`
            <div class="container">
                <div class="topbar">
                    <img src="assets/threecushion.png" class="logo" alt="Logo">
                    <h1><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Billiards</a></h1>
                    <user-badge></user-badge>
                    <settings-modal @theme-changed=${e => { this._theme = e.detail; }}></settings-modal>
                </div>
                <div class="main-row">
                    <div class="solo">
                        <div class="panel">
                            <div class="panel-title">Solo Practice</div>
                            <solo-panel></solo-panel>
                        </div>
                    </div>
                    <div class="players panel"><online-panel></online-panel></div>
                </div>
                <div class="info-row"><div class="panel"><info-panel></info-panel></div></div>
            </div>
        `;
    }
}

customElements.define('lobby-app', LobbyApp);
