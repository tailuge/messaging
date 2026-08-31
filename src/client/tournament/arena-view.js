import { LitElement, html, css } from 'lit';
import { MessagingClient } from '../../index.ts';
import { NCHANBASE, formatVersion, CLIENTVERSION, gameUrl } from '../utils.js';
import { THEME_VARS, SHARED_STYLES } from '../styles.js';
import { userStore } from '../user-store.js';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? ''
    : 'https://billiards-network.onrender.com';

// Bot player IDs that require direct game launch rather than a lobby challenge.
const BOT_IDS = ['arena-thefarjaw', 'arena-clawbreak'];
const BOT_NAMES = { 'arena-thefarjaw': 'TheFarJaw', 'arena-clawbreak': 'ClawBreak' };

// Pairing countdown duration in seconds.
const PAIRING_COUNTDOWN_SECONDS = 10;
// How long to show "Paired with <name>" before returning to leaderboard.
const PAIRED_DISPLAY_MS = 2000;

class ArenaView extends LitElement {
    static properties = {
        arenaId: { type: String },
        _arena: { state: true },
        _leaderboard: { state: true },
        _onlineUsers: { state: true },
        _busy: { state: true },
        _error: { state: true },
        // Pairing state: null | 'counting' | 'paired' | 'no-opponent'
        _pairingState: { state: true },
        _pairingCountdown: { state: true },
        _pairedName: { state: true },
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
        .leaderboard-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .5rem; }
        .leaderboard-header .title { margin: 0; }
        .countdown { font-size: .85rem; font-weight: 600; color: var(--text-muted); font-variant-numeric: tabular-nums; }

        /* Pairing overlay — sits above the table, does not replace it */
        .pairing-overlay {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: .75rem;
            padding: .45rem .6rem;
            margin-bottom: .5rem;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 6px;
            font-size: .85rem;
        }
        .pairing-tick {
            font-size: 1.4rem;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            color: var(--accent, #4a9eff);
            min-width: 1.6rem;
            text-align: center;
            line-height: 1;
        }
        .pairing-label {
            flex: 1;
            font-weight: 600;
        }
        .pairing-hint {
            color: var(--text-muted);
            font-size: .75rem;
        }
        .pairing-result {
            font-weight: 600;
        }
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
        this._timer = null;

        // Pairing
        this._pairingState = null;   // null | 'counting' | 'paired' | 'no-opponent'
        this._pairingCountdown = PAIRING_COUNTDOWN_SECONDS;
        this._pairedName = '';
        this._pairingInterval = null;
        this._pairingTimeout = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._load();
        this._connectPresence();
        this._timer = setInterval(() => {
            if (this._arena) this.requestUpdate();
        }, 1000);
    }

    disconnectedCallback() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        this._cancelPairing();
        this._lobby?.leave();
        this._presenceClient?.stop();
        super.disconnectedCallback();
    }

    // ── Countdown display (arena end time) ───────────────────────────────────

    _getCountdownText() {
        if (!this._arena || !this._arena.endTime) return '';
        const remaining = Math.max(0, this._arena.endTime - Date.now());
        if (remaining <= 0 || this._arena.status === 'finished') return '00:00';
        const totalSec = Math.floor(remaining / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        if (m >= 60) {
            const h = Math.floor(m / 60);
            const remM = m % 60;
            return `${String(h).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // ── Presence / lobby connection ───────────────────────────────────────────

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
                // Include self so eligibility checks can reference current user if needed,
                // but self is excluded from the candidate set in _findEligibleOpponents.
                this._onlineUsers = [...users, {
                    userId: userStore.clientId,
                    userName: userStore.userName,
                }];
            });
        } catch (error) {
            console.error('Arena presence connection failed:', error);
        }
    }

    // ── Arena data ────────────────────────────────────────────────────────────

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
        this._cancelPairing();
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

    // ── Pairing ───────────────────────────────────────────────────────────────

    /**
     * Returns the list of eligible pairing candidates, humans first then bots.
     *
     * Eligible means:
     *   1. Present in the Arena leaderboard (i.e. joined the Arena).
     *   2. The current user is excluded.
     *   3. For human players: present in the lobby online-user list and not currently playing
     *      (no tableId set on their presence record).
     *   4. For seeded bots (arena-thefarjaw, arena-clawbreak): always available — they have
     *      no real lobby presence, so they are included unconditionally when in the leaderboard.
     *
     * Humans are always placed before bots so that random selection from the full list
     * naturally prefers a human when one is available.
     *
     * Eligibility is evaluated at call time so the countdown completion re-evaluates
     * the freshest snapshot.
     */
    _findEligibleOpponents() {
        const myId = userStore.clientId;
        const humans = [];
        const bots = [];

        for (const row of this._leaderboard) {
            if (row.playerId === myId) continue;

            if (BOT_IDS.includes(row.playerId)) {
                bots.push(row);
                continue;
            }

            // Human: must be online and not playing.
            const onlineEntry = this._onlineUsers.find(u => u.userId === row.playerId);
            if (!onlineEntry) continue;
            if (onlineEntry.tableId) continue; // currently playing

            humans.push(row);
        }

        // Humans first: if any humans are eligible, bots are excluded from the pool.
        return humans.length > 0 ? humans : bots;
    }

    _startPairing() {
        // Guard: only one pairing session at a time.
        if (this._pairingState === 'counting') return;

        this._pairingState = 'counting';
        this._pairingCountdown = PAIRING_COUNTDOWN_SECONDS;
        this._pairedName = '';

        this._pairingInterval = setInterval(() => this._onPairingTick(), 1000);
    }

    _cancelPairing() {
        if (this._pairingInterval) { clearInterval(this._pairingInterval); this._pairingInterval = null; }
        if (this._pairingTimeout) { clearTimeout(this._pairingTimeout); this._pairingTimeout = null; }
        this._pairingState = null;
        this._pairingCountdown = PAIRING_COUNTDOWN_SECONDS;
        this._pairedName = '';
    }

    _onPairingTick() {
        // Check whether the Arena is still active and the player is still joined.
        const arena = this._arena;
        const myId = userStore.clientId;
        const stillJoined = arena?.players?.some(p => p.playerId === myId && p.active !== false);
        const stillActive = arena?.status === 'active' && Date.now() < (arena?.endTime || 0);

        if (!stillJoined || !stillActive) {
            this._cancelPairing();
            return;
        }

        this._pairingCountdown -= 1;

        if (this._pairingCountdown <= 0) {
            clearInterval(this._pairingInterval);
            this._pairingInterval = null;
            this._executePairing();
            return;
        }

        this.requestUpdate();
    }

    /**
     * Called when the 10-second countdown reaches zero. Selects a random eligible
     * opponent and initiates the existing lobby challenge action, or shows the
     * no-opponent result and returns to the leaderboard.
     */
    async _executePairing() {
        const candidates = this._findEligibleOpponents();

        if (candidates.length === 0) {
            this._pairingState = 'no-opponent';
            this._pairingTimeout = setTimeout(() => this._cancelPairing(), PAIRED_DISPLAY_MS);
            return;
        }

        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        this._pairedName = chosen.name;
        this._pairingState = 'paired';

        try {
            await this._initiateChallenge(chosen);
        } catch (err) {
            console.error('Pairing challenge failed:', err);
        }

        this._pairingTimeout = setTimeout(() => this._cancelPairing(), PAIRED_DISPLAY_MS);
    }

    /**
     * Initiates the challenge for the chosen opponent using the Arena's game config.
     * Bots go directly to gameUrl; humans get a lobby challenge offer.
     * Both include &tournamentId so the game page can link back to the Arena.
     */
    async _initiateChallenge(opponent) {
        const arena = this._arena;
        const ruleType = arena?.ruleType || 'nineball';
        const options = arena?.options || {};
        const tournamentId = arena?.id || '';

        if (BOT_IDS.includes(opponent.playerId)) {
            const botName = BOT_NAMES[opponent.playerId] || opponent.name;
            const tableId = 'arena-bot-' + Math.random().toString(36).slice(2, 8);
            const base = gameUrl({
                tableId,
                userId: userStore.clientId,
                userName: userStore.userName,
                ruleType,
                isFirst: true,
                options,
                bot: botName,
                lod: userStore.lod,
                flip: userStore.flip,
            });
            window.location.href = base + `&tournamentId=${encodeURIComponent(tournamentId)}`;
            return;
        }

        if (!this._lobby) {
            console.error('Pairing: no lobby connection');
            return;
        }

        // Pass tournamentId through the options object so it travels with the challenge
        // and the game page can read it from URL params echoed back on accept.
        await this._lobby.challenge(
            opponent.playerId,
            ruleType,
            { ...options, tournamentId },
        );
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    _renderPairingOverlay() {
        if (this._pairingState === 'counting') {
            return html`
                <div class="pairing-overlay" role="status" aria-live="polite">
                    <div class="pairing-tick" aria-label="Seconds remaining: ${this._pairingCountdown}">${this._pairingCountdown}</div>
                    <div class="pairing-label">Pairing…</div>
                    <div class="pairing-hint">Finding an opponent</div>
                    <button type="button" @click=${this._cancelPairing}>Cancel</button>
                </div>`;
        }
        if (this._pairingState === 'paired') {
            return html`
                <div class="pairing-overlay" role="status" aria-live="assertive">
                    <div class="pairing-result">Paired with ${this._pairedName}</div>
                </div>`;
        }
        if (this._pairingState === 'no-opponent') {
            return html`
                <div class="pairing-overlay" role="status" aria-live="assertive">
                    <div class="pairing-result">No available opponents</div>
                </div>`;
        }
        return null;
    }

    render() {
        const arena = this._arena;
        const myId = userStore.clientId;
        const player = arena?.players?.find(p => p.playerId === myId);
        const joined = !!player;
        const activeParticipant = player?.active !== false;
        const arenaActive = arena?.status === 'active';
        const canPair = joined && activeParticipant && arenaActive && this._pairingState === null;
        const isPairing = this._pairingState !== null;

        const overlay = this._renderPairingOverlay();

        return html`<div class="container">
            <header class="topbar">
                <img src="assets/threecushion.png" class="logo" alt="" />
                <h1><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Billiards</a></h1>
                <user-badge></user-badge>
            </header>
            ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : ''}
            ${!arena && !this._error ? html`<section class="panel"><div class="empty">Loading Arena…</div></section>` : ''}
            ${arena ? html`
                <section class="panel">
                    <h2 class="title">${arena.ruleType} Arena</h2>
                    <div class="meta">
                        Status: ${arena.status} · Duration: ${arena.durationMinutes} minutes<br />
                        ${arena.players.length} participant${arena.players.length === 1 ? '' : 's'} · Ends: ${new Date(arena.endTime).toLocaleString()}
                    </div>
                    <div class="actions">
                        <button type="button" ?disabled=${this._busy || isPairing} @click=${this._load}>Refresh</button>
                        ${joined && activeParticipant
                            ? html`<button class="btn-leave" type="button" ?disabled=${this._busy} @click=${this._leave}>Leave Arena</button>`
                            : html`<button class="btn-accept" type="button" ?disabled=${this._busy || !arenaActive} @click=${this._join}>Join Arena</button>`
                        }
                        ${canPair
                            ? html`<button class="btn-challenge" type="button" @click=${this._startPairing}>Pair</button>`
                            : ''
                        }
                    </div>
                </section>
                <section class="panel">
                    <div class="leaderboard-header">
                        <h2 class="title">Leaderboard</h2>
                        ${arena?.endTime ? html`<div class="countdown" aria-label="Time remaining">${this._getCountdownText()}</div>` : ''}
                    </div>
                    ${overlay}
                    ${this._leaderboard.length
                        ? html`<table class="players">
                            <thead><tr><th>Player</th><th>Points</th><th>Wins</th><th>Games</th></tr></thead>
                            <tbody>${this._leaderboard.map(row => {
                                const record = arena.players.find(p => p.playerId === row.playerId);
                                const isBot = BOT_IDS.includes(row.playerId);
                                const onlineUser = isBot
                                    ? true
                                    : this._onlineUsers.find(u => u.userId === row.playerId);
                                const isOnline = !!onlineUser;
                                return html`<tr class=${record?.active === false ? 'inactive' : ''}>
                                    <td>
                                        ${isOnline ? html`<span class="online-dot" aria-label="Online" title="Online"></span>` : ''}
                                        ${row.name}${record?.active === false ? ' (left)' : ''}
                                    </td>
                                    <td>${row.points}</td>
                                    <td>${row.wins}</td>
                                    <td>${row.games}</td>
                                </tr>`;
                            })}</tbody>
                        </table>`
                        : html`<div class="empty">No players have joined yet.</div>`
                    }
                </section>` : ''}
        </div>`;
    }
}

customElements.define('arena-view', ArenaView);
