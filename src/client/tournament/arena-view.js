import { LitElement, html, css } from 'lit';
import { MessagingClient } from '../../index.ts';
import { NCHANBASE, formatVersion, CLIENTVERSION } from '../utils.js';
import { THEME_VARS, SHARED_STYLES } from '../styles.js';
import { userStore } from '../user-store.js';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? ''
    : 'https://billiards-network.onrender.com';

class ArenaView extends LitElement {
    static properties = {
        arenaId: { type: String },
        _arena: { state: true },
        _leaderboard: { state: true },
        _onlineUsers: { state: true },
        _busy: { state: true },
        _error: { state: true },
    };

    static styles = [THEME_VARS, SHARED_STYLES, css`
        :host { display: block; min-height: 100vh; box-sizing: border-box; padding: .5rem; background: var(--bg); color: var(--text); font-family: 'Exo', sans-serif; font-size: .85rem; }
        .container { max-width: 900px; margin: 0 auto; }
        .topbar { display: flex; align-items: center; gap: .4rem; margin-bottom: .4rem; }
        .logo { width: 32px; height: 32px; opacity: .7; }
        h1 { flex: 1; margin: 0; font-size: 1rem; letter-spacing: .1em; text-transform: uppercase; color: var(--text-dim); }
        h1 a { color: inherit; text-decoration: none; }
        .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: .7rem; margin-bottom: .5rem; }
        .title { margin: 0 0 .5rem; font-size: 1.1rem; font-weight: 600; }
        .meta { color: var(--text-muted); font-size: .75rem; line-height: 1.7; }
        .error { padding: .45rem; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; }
        .actions { display: flex; gap: .35rem; margin-top: .6rem; }
        .actions button { flex: 1; padding: .5rem; }
        .players { width: 100%; border-collapse: collapse; }
        th, td { padding: .4rem .25rem; border-bottom: 1px solid var(--border); text-align: left; }
        th { color: var(--text-muted); font-size: .7rem; }
        th:not(:first-child), td:not(:first-child) { text-align: right; }
        .inactive { color: var(--text-muted); opacity: .65; }
        .online-dot { display: inline-block; width: .45rem; height: .45rem; margin-right: .3rem; border-radius: 50%; background: #198754; vertical-align: middle; }
        .empty { color: var(--text-muted); text-align: center; padding: 1rem 0; }
    `];

    constructor() {
        super();
        this.arenaId = '';
        this._arena = null;
        this._leaderboard = [];
        this._onlineUsers = [];
        this._busy = false;
        this._presenceClient = null;
        this._lobby = null;
        this._error = '';
    }

    connectedCallback() {
        super.connectedCallback();
        this._load();
        this._connectPresence();
    }

    disconnectedCallback() {
        this._lobby?.leave();
        this._presenceClient?.stop();
        super.disconnectedCallback();
    }

    async _connectPresence() {
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `${protocol}//${window.location.host}`
            : `https://${NCHANBASE}`;
        this._presenceClient = new MessagingClient({ baseUrl });
        this._presenceClient.setVersion(formatVersion(CLIENTVERSION));
        try {
                this._lobby = await this._presenceClient.joinLobby({
                messageType: 'presence', type: 'join',
                userId: userStore.clientId, userName: userStore.userName,
            });
            this._lobby.onUsersChange(users => {
                this._onlineUsers = [...users, {
                    userId: userStore.clientId,
                    userName: userStore.userName,
                }];
            });
        } catch (error) {
            console.error('Arena presence connection failed:', error);
        }
    }

    async _load() {
        this._busy = true;
        this._error = '';
        try {
            const response = await fetch(`${API_BASE}/api/arena/${encodeURIComponent(this.arenaId)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Unable to load Arena (${response.status})`);
            this._arena = data.arena;
            this._leaderboard = data.leaderboard || [];
        } catch (error) {
            this._error = error.message || 'Unable to load Arena.';
        } finally {
            this._busy = false;
        }
    }

    async _join() {
        await this._mutate('join', { playerId: userStore.clientId, name: userStore.userName || 'Anonymous' });
    }

    async _leave() {
        await this._mutate('leave', { playerId: userStore.clientId });
    }

    async _mutate(action, body) {
        this._busy = true;
        this._error = '';
        try {
            const response = await fetch(`${API_BASE}/api/arena/${encodeURIComponent(this.arenaId)}/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `${action} failed (${response.status})`);
            await this._load();
        } catch (error) {
            this._error = error.message || `Unable to ${action} Arena.`;
            this._busy = false;
        }
    }

    render() {
        const arena = this._arena;
        const player = arena?.players?.find(p => p.playerId === userStore.clientId);
        const joined = !!player;
        const active = player?.active !== false;
        return html`<div class="container">
            <header class="topbar"><img src="assets/threecushion.png" class="logo" alt="" /><h1><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Billiards</a></h1><user-badge></user-badge></header>
            ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : ''}
            ${!arena && !this._error ? html`<section class="panel"><div class="empty">Loading Arena…</div></section>` : ''}
            ${arena ? html`
                <section class="panel">
                    <h2 class="title">${arena.ruleType} Arena</h2>
                    <div class="meta">Status: ${arena.status} · Duration: ${arena.durationMinutes} minutes<br />${arena.players.length} participant${arena.players.length === 1 ? '' : 's'} · Ends: ${new Date(arena.endTime).toLocaleString()}</div>
                    <div class="actions">
                        <button type="button" ?disabled=${this._busy} @click=${this._load}>Refresh</button>
                        ${joined && active ? html`<button class="btn-leave" type="button" ?disabled=${this._busy} @click=${this._leave}>Leave Arena</button>` : html`<button class="btn-accept" type="button" ?disabled=${this._busy || arena.status !== 'active'} @click=${this._join}>Join Arena</button>`}
                    </div>
                </section>
                <section class="panel">
                    <h2 class="title">Leaderboard</h2>
                    ${this._leaderboard.length ? html`<table class="players"><thead><tr><th>Player</th><th>Points</th><th>Wins</th><th>Games</th></tr></thead><tbody>${this._leaderboard.map(row => {
                        const record = arena.players.find(p => p.playerId === row.playerId);
                        const onlineUser = this._onlineUsers.find(user =>
                            user.userId === row.playerId ||
                            (user.userName === row.name && ['TheFarJaw', 'ClawBreak'].includes(row.name))
                        );
                        const isOnline = !!onlineUser || ['TheFarJaw', 'ClawBreak'].includes(row.name);
                        return html`<tr class=${record?.active === false ? 'inactive' : ''}><td>${isOnline ? html`<span class="online-dot" aria-label="Online" title="Online"></span>` : ''}${row.name}${record?.active === false ? ' (left)' : ''}</td><td>${row.points}</td><td>${row.wins}</td><td>${row.games}</td></tr>`;
                    })}</tbody></table>` : html`<div class="empty">No players have joined yet.</div>`}
                </section>` : ''}
        </div>`;
    }
}

customElements.define('arena-view', ArenaView);
