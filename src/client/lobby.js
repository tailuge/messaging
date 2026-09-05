import { LitElement, html } from 'lit';
import { LOBBY_APP_STYLES } from './styles.js';
import './solo-panel.js';
import './info-panel.js';
import './online-panel.js';
import './user-badge.js';
import './settings-modal.js';
import './active-arenas.js';
import './arena-panel.js';
import { CLIENTVERSION, formatVersion } from './utils.js';

class LobbyApp extends LitElement {
    static properties = {
        _theme: { type: String, reflect: true, attribute: 'theme' },
        _sidebarOpen: { type: Boolean },
        _activeArenaId: { state: true },
        _lobby: { state: true },
    };
    static styles = LOBBY_APP_STYLES;

    constructor() {
        super();
        console.log("URL:", window.location.href);
        console.log("Search params:", Object.fromEntries(new URLSearchParams(window.location.search)));
        this._theme = document.documentElement.getAttribute('theme') || 'light';
        this._sidebarOpen = false;
        const params = new URLSearchParams(window.location.search);
        this._activeArenaId = params.get('tournamentId') || params.get('arenaId') || params.get('arena') || null;
        this._lobby = null;
        this.addEventListener('user-list-toggle', e => {
            this._sidebarOpen = e.detail.expanded;
        });
        this.addEventListener('arena-select', e => {
            this._activeArenaId = e.detail.arenaId;
            const url = new URL(window.location.href);
            url.searchParams.set('tournamentId', e.detail.arenaId);
            window.history.replaceState({}, '', url.pathname + url.search);
            this.updateComplete.then(() => {
                this.shadowRoot.querySelector('.arenas-row')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });
        this.addEventListener('lobby-ready', e => {
            this._lobby = e.detail;
        });
        window.addEventListener('popstate', () => {
            const p = new URLSearchParams(window.location.search);
            const id = p.get('tournamentId') || p.get('arenaId') || p.get('arena') || null;
            if (id !== this._activeArenaId) {
                this._activeArenaId = id;
            }
        });
    }

    firstUpdated() {
        if (this._activeArenaId) {
            this.shadowRoot.querySelector('.arenas-row')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    _closeArenaPanel = () => {
        this._activeArenaId = null;
        const url = new URL(window.location.href);
        if (url.searchParams.has('tournamentId') || url.searchParams.has('arenaId') || url.searchParams.has('arena')) {
            url.searchParams.delete('tournamentId');
            url.searchParams.delete('arenaId');
            url.searchParams.delete('arena');
            window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
        }
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
                    <div class="arenas-row panel ${this._activeArenaId ? 'arena-details' : ''}">
                        ${this._activeArenaId
                            ? html`<arena-panel
                                .arenaId=${this._activeArenaId}
                                .lobby=${this._lobby || this._ctrl?.lobby}
                                .theme=${this._theme}
                                @close=${this._closeArenaPanel}
                              ></arena-panel>`
                            : html`<active-arenas selectable></active-arenas>`
                        }
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
