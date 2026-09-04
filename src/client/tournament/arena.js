import { LitElement, html, css } from 'lit';
import { THEME_VARS, SHARED_STYLES } from '../styles.js';
import { userStore } from '../user-store.js';
import { ARENA_ROW_STYLES, arenaRow } from '../active-arenas.js';
import '../active-arenas.js';
import '../user-badge.js';
import './arena-create-form.js';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? ''
    : 'https://billiards-network.onrender.com';

class ArenaApp extends LitElement {
    static properties = {
        _theme: { type: String, reflect: true, attribute: 'theme' },
        _id: { state: true },
        _ruleType: { state: true },
        _options: { state: true },
        _durationMinutes: { state: true },
        _createdArena: { state: true },
        _arenas: { state: true },
        _completedArenas: { state: true },
        _busy: { state: true },
        _error: { state: true },
    };

    static styles = [THEME_VARS, SHARED_STYLES, ARENA_ROW_STYLES, css`
        :host { display: block; min-height: 100vh; box-sizing: border-box; padding: .5rem; background: var(--bg); color: var(--text); font-family: 'Exo', sans-serif; font-size: .85rem; }
        .container { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; }
        .topbar { display: flex; align-items: center; gap: .4rem; margin-bottom: .4rem; position: sticky; top: 0; z-index: 2; padding: .25rem 0; background: var(--bg); }
        .logo { width: 32px; height: 32px; flex-shrink: 0; opacity: .7; }
        h1 { flex: 1; margin: 0; font-size: 1rem; letter-spacing: .1em; text-transform: uppercase; color: var(--text-dim); }
        h1 a { color: inherit; text-decoration: none; }
        .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: .4rem; margin-bottom: .25rem; }
        .title { margin: 0 0 .25rem; font-size: .8rem; font-weight: 600; }
        .error { padding: .45rem; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; }
        .success { color: #198754; }
        .url { display: flex; gap: .3rem; }
        .url input { flex: 1; min-width: 0; padding: .35rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px; font: inherit; font-size: .7rem; }
        .meta { color: var(--text-muted); font-size: .75rem; line-height: 1.6; }
        .back-lobby { margin-left: auto; }
    `];

    constructor() {
        super();
        this._theme = document.documentElement.getAttribute('theme') || localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('theme', this._theme);
        document.documentElement.style.colorScheme = this._theme;
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id') || params.get('tournamentId');
        if (id) {
            const target = new URL('./lobby.html', window.location.href);
            target.searchParams.set('tournamentId', id);
            window.location.replace(target.href);
            return;
        }
        this._ruleType = '';
        this._options = {};
        this._durationMinutes = 10;
        this._createdArena = null;
        this._arenas = [];
        this._completedArenas = [];
        this._busy = false;
        this._error = '';
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadCompletedArenas();
    }

    async _loadCompletedArenas() {
        try {
            const response = await fetch(`${API_BASE}/api/arena/results`);
            const data = await response.json();
            if (response.ok && Array.isArray(data.results)) {
                this._completedArenas = data.results;
            }
        } catch {
            this._completedArenas = [];
        }
    }

    async _create() {
        if (!this._ruleType) {
            this._error = 'Choose game parameters first.';
            return;
        }
        this._busy = true;
        this._error = '';
        try {
            const response = await fetch(`${API_BASE}/api/arena`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    creatorId: userStore.clientId,
                    creatorName: userStore.userName || 'Anonymous',
                    ruleType: this._ruleType,
                    options: this._options,
                    durationMinutes: this._durationMinutes,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Create failed (${response.status})`);
            this._createdArena = data.arena;
            await this._refreshActiveArenas();
            await this._loadCompletedArenas();
        } catch (error) {
            this._error = error.message || 'Unable to create Arena.';
        } finally {
            this._busy = false;
        }
    }

    _backToLobby() {
        window.location.href = './lobby.html';
    }

    _renderHeader() {
        return html`<header class="topbar">
            <img src="assets/threecushion.png" class="logo" alt="" />
            <h1><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Billiards</a></h1>
            <user-badge></user-badge>
            <button class="back-lobby" type="button" @click=${this._backToLobby}>Back to lobby</button>
        </header>`;
    }

    _arenaUrl() {
        if (!this._createdArena) return '';
        const origin = window.location.origin;
        const basePath = window.location.pathname.replace(/\/tournament\/[^/]*$/, '/lobby.html');
        return `${origin}${basePath}?tournamentId=${encodeURIComponent(this._createdArena.id)}`;
    }

    async _copy() {
        const url = this._arenaUrl();
        try { await navigator.clipboard.writeText(url);        } catch {
            const input = this.renderRoot.querySelector('.url input');
            if (input) { input.focus(); input.select(); }
        }
    }

    _onArenasLoaded(event) {
        this._arenas = event.detail.arenas || [];
        this._loadCompletedArenas();
    }

    async _refreshActiveArenas() {
        const component = this.renderRoot.querySelector('active-arenas');
        if (component) await component.load();
    }

    _renderCompletedArenas() {
        return this._completedArenas.length
            ? html`<div class="arena-list" aria-label="Completed Arenas">${this._completedArenas.map(arena => arenaRow(arena, true))}</div>`
            : html`<div class="empty">No completed Arenas.</div>`;
    }

    _renderArenaSections() {
        return html`
            <section class="panel">
                <active-arenas heading="Active Arenas" @arenas-loaded=${this._onArenasLoaded}></active-arenas>
            </section>
            <section class="panel">
                <h2 class="title">Completed Arenas</h2>
                ${this._renderCompletedArenas()}
            </section>`;
    }

    render() {
        const arena = this._createdArena;
        return html`<div class="container">
            ${this._renderHeader()}
            <section class="panel">
                <h2 class="title">Create Arena</h2>
                <arena-create-form
                    .ruleType=${this._ruleType}
                    .options=${this._options}
                    .durationMinutes=${this._durationMinutes}
                    .busy=${this._busy}
                    .error=${this._error}
                    @parameters-change=${e => {
                        this._ruleType = e.detail.ruleType;
                        this._options = e.detail.options;
                        this._durationMinutes = e.detail.durationMinutes;
                    }}
                    @create-arena=${this._create}
                ></arena-create-form>
            </section>
            ${arena ? html`<section class="panel"><h2 class="title success">Arena created</h2><div class="meta">${arena.ruleType} · ${arena.durationMinutes} minutes · ${arena.status}</div><div class="url"><input readonly value=${this._arenaUrl()} aria-label="Arena URL" @focus=${e => e.target.select()} /><button type="button" @click=${this._copy}>Copy</button></div><p class="empty">Share this URL to invite players.</p></section>` : ''}
            ${this._renderArenaSections()}
        </div>`;
    }
}

customElements.define('arena-app', ArenaApp);
