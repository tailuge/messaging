import { LitElement, html, css } from 'lit';
import { THEME_VARS, SHARED_STYLES } from '../styles.js';
import { userStore } from '../user-store.js';
import '../user-badge.js';
import './arena-view.js';
import '../proto2-modal.js';

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
        _loadingArenas: { state: true },
        _busy: { state: true },
        _error: { state: true },
    };

    static styles = [THEME_VARS, SHARED_STYLES, css`
        :host { display: block; min-height: 100vh; box-sizing: border-box; padding: .5rem; background: var(--bg); color: var(--text); font-family: 'Exo', sans-serif; font-size: .85rem; }
        .container { max-width: 900px; margin: 0 auto; }
        .topbar { display: flex; align-items: center; gap: .4rem; margin-bottom: .4rem; }
        .logo { width: 32px; height: 32px; flex-shrink: 0; opacity: .7; }
        h1 { flex: 1; margin: 0; font-size: 1rem; letter-spacing: .1em; text-transform: uppercase; color: var(--text-dim); }
        h1 a { color: inherit; text-decoration: none; }
        .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: .7rem; margin-bottom: .5rem; }
        .title { margin: 0 0 .5rem; font-size: 1.1rem; font-weight: 600; }
        .field { margin: .6rem 0; }
        label { display: block; margin-bottom: .25rem; color: var(--text-muted); font-size: .75rem; }
        select { width: 100%; box-sizing: border-box; padding: .45rem; background: var(--btn-bg); color: var(--text); border: 1px solid var(--btn-border); border-radius: 4px; font: inherit; }
        .config { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .45rem; border: 1px dashed var(--border); border-radius: 4px; }
        .config-text { min-width: 0; color: var(--text-muted); font-size: .75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .create { width: 100%; padding: .55rem; font-size: .95rem; }
        .error { padding: .45rem; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; }
        .success { color: #198754; }
        .url { display: flex; gap: .3rem; }
        .url input { flex: 1; min-width: 0; padding: .35rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px; font: inherit; font-size: .7rem; }
        .meta { color: var(--text-muted); font-size: .75rem; line-height: 1.6; }
        .empty { color: var(--text-muted); text-align: center; padding: 1rem 0; }
        .arena-list { display: flex; flex-direction: column; gap: .35rem; }
        .arena-item { display: flex; align-items: center; gap: .5rem; padding: .45rem; border: 1px solid var(--border); border-radius: 4px; }
        .arena-item-main { min-width: 0; flex: 1; }
        .arena-item-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .arena-item-meta { color: var(--text-muted); font-size: .72rem; margin-top: .15rem; }
        .refresh { float: right; }
    `];

    constructor() {
        super();
        this._theme = document.documentElement.getAttribute('theme') || 'dark';
        this._id = new URLSearchParams(window.location.search).get('id') || '';
        this._ruleType = '';
        this._options = {};
        this._durationMinutes = 10;
        this._createdArena = null;
        this._arenas = [];
        this._loadingArenas = false;
        this._busy = false;
        this._error = '';
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this._id) this._loadArenas();
    }

    async _loadArenas() {
        this._loadingArenas = true;
        try {
            const response = await fetch(`${API_BASE}/api/arena`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Unable to load Arenas (${response.status})`);
            this._arenas = (data.arenas || []).sort((a, b) => b.createdAt - a.createdAt);
        } catch (error) {
            this._error = error.message || 'Unable to load Arenas.';
        } finally {
            this._loadingArenas = false;
        }
    }

    _openChooser() { this.renderRoot.querySelector('proto2-modal').show(); }

    _onParameters(e) {
        this._ruleType = e.detail.ruleType;
        this._options = e.detail.options || {};
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
            await this._loadArenas();
        } catch (error) {
            this._error = error.message || 'Unable to create Arena.';
        } finally {
            this._busy = false;
        }
    }

    _arenaUrl() {
        if (!this._createdArena) return '';
        return `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(this._createdArena.id)}`;
    }

    async _copy() {
        const url = this._arenaUrl();
        try { await navigator.clipboard.writeText(url); } catch (_) {
            const input = this.renderRoot.querySelector('.url input');
            if (input) { input.focus(); input.select(); }
        }
    }

    _renderActiveArenas() {
        return html`<section class="panel">
            <h2 class="title">Active Arenas <button class="refresh" type="button" ?disabled=${this._loadingArenas} @click=${this._loadArenas}>${this._loadingArenas ? 'Refreshing…' : 'Refresh'}</button></h2>
            ${this._arenas.length ? html`<div class="arena-list" aria-label="Active Arenas">
                ${this._arenas.map(arena => html`<a class="arena-item" href="${this._arenaUrlFor(arena)}">
                    <div class="arena-item-main"><div class="arena-item-title">${arena.ruleType}</div><div class="arena-item-meta">${arena.players.length} participant${arena.players.length === 1 ? '' : 's'} · ends ${new Date(arena.endTime).toLocaleTimeString()}</div></div><span aria-hidden="true">→</span>
                </a>`)}
            </div>` : html`<div class="empty">No active Arenas.</div>`}
        </section>`;
    }

    _arenaUrlFor(arena) {
        return `${window.location.pathname}?id=${encodeURIComponent(arena.id)}`;
    }

    render() {
        if (this._id) return html`<arena-view arenaId=${this._id}></arena-view>`;
        const arena = this._createdArena;
        return html`<div class="container">
            ${this._renderActiveArenas()}
            <header class="topbar"><img src="assets/threecushion.png" class="logo" alt="" /><h1><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Billiards</a></h1><user-badge></user-badge></header>
            <section class="panel">
                <h2 class="title">Create Arena</h2>
                <div class="field"><label>Game parameters</label><div class="config"><span class="config-text">${this._ruleType ? `${this._ruleType} ${JSON.stringify(this._options)}` : 'No parameters selected'}</span><button type="button" @click=${this._openChooser}>Choose</button></div></div>
                <div class="field"><label for="duration">Duration</label><select id="duration" .value=${String(this._durationMinutes)} @change=${e => { this._durationMinutes = Number(e.target.value); }}><option value="10">10 minutes</option><option value="30">30 minutes</option></select></div>
                ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : ''}
                <button class="btn-challenge create" type="button" ?disabled=${this._busy} @click=${this._create}>${this._busy ? 'Creating…' : 'Create Arena'}</button>
            </section>
            ${arena ? html`<section class="panel"><h2 class="title success">Arena created</h2><div class="meta">${arena.ruleType} · ${arena.durationMinutes} minutes · ${arena.status}</div><div class="url"><input readonly value=${this._arenaUrl()} aria-label="Arena URL" @focus=${e => e.target.select()} /><button type="button" @click=${this._copy}>Copy</button></div><p class="empty">Share this URL to invite players.</p></section>` : html`<section class="panel"><h2 class="title">Leaderboard</h2><div class="empty">No Arena created yet.</div></section>`}
            <proto2-modal @confirm=${this._onParameters}></proto2-modal>
        </div>`;
    }
}

customElements.define('arena-app', ArenaApp);
