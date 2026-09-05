import { LitElement, html, css } from 'lit';
import { gameUrl, ruleIcon } from '../utils.js';
import { THEME_VARS, SHARED_STYLES } from '../styles.js';
import { userStore } from '../user-store.js';
import './podium.js';
import './arena-leaderboard.js';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? ''
    : 'https://billiards-network.onrender.com';

// Bot player IDs that require direct game launch rather than a lobby challenge.
// Keep the legacy IDs here too so Arenas created before the current API naming
// convention still pair with their seeded bots correctly.
const BOT_IDS = new Set([
    'bot-thefarjaw', 'bot-clawbreak',
]);
const BOT_NAMES = {
    'bot-thefarjaw': 'TheFarJaw',
    'bot-clawbreak': 'ClawBreak',
};
const isBotId = playerId => BOT_IDS.has(playerId);

// Pairing countdown durations in seconds.
const PAIRING_COUNTDOWN_SECONDS = 10;
const HUMAN_PAIRING_COUNTDOWN_SECONDS = 5;
// How long to show "Paired with <name>" before returning to leaderboard.
const PAIRED_DISPLAY_MS = 2000;

class ArenaView extends LitElement {
    static properties = {
        arenaId: { type: String },
        lobby: { type: Object },
        theme: { type: String, reflect: true },
        _arena: { state: true },
        _leaderboard: { state: true },
        _onlineUsers: { state: true },
        _busy: { state: true },
        _error: { state: true },
        // Pairing state: null | 'counting' | 'paired' | 'no-opponent'
        _pairingState: { state: true },
        _pairingCountdown: { state: true },
        _pairedName: { state: true },
        _beserk: { state: true },
    };

    static styles = [THEME_VARS, SHARED_STYLES, css`
        :host { display: block; box-sizing: border-box; background: var(--surface); color: var(--text); font-family: 'Exo', sans-serif; font-size: .85rem; }
        .container { max-width: 900px; margin: 0 auto; }
        .topbar { display: flex; align-items: center; gap: .4rem; margin-bottom: .4rem; }
        .logo { width: 32px; height: 32px; opacity: .7; }
        h1 { flex: 1; margin: 0; font-size: 1rem; letter-spacing: .1em; text-transform: uppercase; color: var(--text-dim); }
        h1 a { color: inherit; text-decoration: none; }
        .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 2px; margin-bottom: 2px; }
        .container > .panel:last-child { margin-bottom: 0; }
        .title { margin: 0 0 2px; font-size: .8rem; font-weight: 600; }
        .meta { color: var(--text-muted); font-size: .75rem; line-height: 1.7; white-space: nowrap; }
        .error { padding: 2px; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; }
        .actions { display: flex; gap: 2px; margin-top: 2px; }
        .actions button { flex: 1; padding: .25rem; }
        .countdown { font-size: .85rem; font-weight: 600; color: var(--text-muted); font-variant-numeric: tabular-nums; }

        /* Pairing overlay — sits above the table, does not replace it */
        .pairing-overlay {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 2px;
            padding: 2px;
            margin-bottom: 2px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 6px;
            font-size: .85rem;
        }
        .pairing-overlay.active {
            border-color: var(--accent, #0d6efd);
            box-shadow: 0 0 0 1px var(--accent, #0d6efd), 0 0 8px rgba(13, 110, 253, 0.25);
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
        .pairing-beserk {
            flex: 0 0 auto;
            padding: .35rem .5rem;
        }
        .pairing-beserk[aria-pressed="true"] {
            background: #fd7e14;
            border-color: #fd7e14;
            color: #fff;
            box-shadow: 0 0 0 1px rgba(253, 126, 20, 0.35);
        }
        .pairing-beserk[aria-pressed="true"]:hover {
            background: #e96b02;
            border-color: #e96b02;
        }
        .panel-heading { display: flex; align-items: center; gap: 2px; }
        .panel-heading .title { flex: 1; }
    `];

    constructor() {
        super();
        this.arenaId = '';
        this.lobby = null;
        this.theme = document.documentElement.getAttribute('theme') || localStorage.getItem('theme') || 'dark';
        this._arena = null;
        this._leaderboard = [];
        this._onlineUsers = [];
        this._busy = false;
        this._theme = this.theme;
        document.documentElement.setAttribute('theme', this._theme);
        document.documentElement.style.colorScheme = this._theme;
        this._lobby = null;
        this._lobbyWired = false;
        this._error = '';
        this._timer = null;

        // One-shot stale-participant refetch (see better.md):
        // when presence shows a user in this arena who is missing from the loaded
        // participant list, refetch the arena from the backend exactly once.
        this._staleRefetchDone = false;
        this._lastLoadedArenaId = null;

        // Pairing
        this._pairingState = null;   // null | 'counting' | 'paired' | 'no-opponent'
        this._pairingCountdown = PAIRING_COUNTDOWN_SECONDS;
        this._pairedName = '';
        this._beserk = false;
        this._pairingInterval = null;
        this._pairingTimeout = null;
        this._pendingArenaChallenge = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._load();
        if (this.lobby) this._setupLobby();
        this._timer = setInterval(() => {
            if (this._arena) this.requestUpdate();
        }, 1000);
    }

    updated(changedProperties) {
        if (changedProperties.has('lobby') && this.lobby) {
            this._setupLobby();
        }
        if (changedProperties.has('arenaId') && this.arenaId && this.arenaId !== this._lastLoadedArenaId) {
            this._load();
        }
    }

    disconnectedCallback() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        this._cancelPairing();
        this._pendingArenaChallenge = null;
        this._lobbyWired = false;
        super.disconnectedCallback();
    }

    // ── Countdown display (arena end time) ───────────────────────────────────

    _isExpired() {
        return Boolean(this._arena && this._arena.endTime && Date.now() >= this._arena.endTime);
    }

    get _localCustom() {
        const custom = userStore.getCustom();
        if (custom.emoji === undefined || custom.emoji === null) {
            const country = this._onlineUsers.find(u => u.userId === userStore.clientId)?.meta?.country;
            if (country === 'BOT') return { ...custom, emoji: '🤖' };
        }
        return custom;
    }

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

    _setupLobby() {
        if (!this.lobby || this._lobbyWired) return;
        this._lobby = this.lobby;
        this._lobbyWired = true;
        this._syncArenaPresence();
        this._lobby.onUsersChange(users => {
            // Include self so eligibility checks can reference current user if needed,
            // but self is excluded from the candidate set in _findEligibleOpponents.
            this._onlineUsers = [...users, {
                userId: userStore.clientId,
                userName: userStore.userName,
                custom: this._localCustom,
            }];
            this._checkStaleArenaPresence();
        });
        this._lobby.onChallenge(msg => {
            if (msg.type === 'offer') {
                this._handleIncomingChallenge(msg);
            } else {
                this._handleArenaChallengeMessage(msg);
            }
        });
    }

    /**
     * Handles an incoming challenge received over the messaging framework.
     *
     * Any offer addressed to the current player supersedes an active pairing
     * countdown (per spec: an incoming challenge takes precedence over the random
     * selection). If the offer carries a matching `tournamentId` and the current
     * player has joined this Arena, it is auto-accepted and both sides launch the
     * game URL through the existing challenge-accept flow.
     */
    async _handleIncomingChallenge(msg) {
        if (msg.type !== 'offer' || msg.challengeeId !== userStore.clientId) return;

        const wasPairing = this._pairingState === 'counting';
        // Any incoming offer supersedes an active pairing countdown.
        this._cancelPairing();

        // Auto-accept only when the offer belongs to this Arena and we are joined & active.
        const joinedActive = this._arena?.players?.some(p =>
            p.playerId === userStore.clientId && p.active !== false);
        if (!joinedActive || msg.options?.tournamentId !== this.arenaId) {
            if (wasPairing) this.requestUpdate();
            return;
        }

        await this._acceptArenaChallenge(msg);
    }

    /**
     * Handles resolution messages for the human challenge initiated by this Arena.
     * The sender must wait for an accept before launching the game, and must match
     * the acknowledgement to the exact challenge table to avoid stale replayed
     * accepts launching the wrong game.
     */
    _handleArenaChallengeMessage(msg) {
        const pending = this._pendingArenaChallenge;
        if (!pending) return;
        if (msg.challengerId !== userStore.clientId || msg.challengeeId !== pending.opponentId) return;

        if (msg.type === 'decline' || msg.type === 'cancel') {
            this._pendingArenaChallenge = null;
            return;
        }
        if (msg.type !== 'accept') return;

        // The acknowledgement can arrive before lobby.challenge() resolves and
        // exposes the generated tableId. Hold it until the challenge is complete.
        if (!pending.tableId) {
            pending.earlyAccept = msg;
            return;
        }
        if (msg.tableId !== pending.tableId) return;

        this._pendingArenaChallenge = null;
        const ruleType = msg.ruleType || pending.ruleType;
        const options = msg.options || pending.options;
        const isFirst = msg.nextTurnId
            ? msg.nextTurnId === userStore.clientId
            : true;
        const url = gameUrl({
            tableId: msg.tableId,
            userId: userStore.clientId,
            userName: userStore.userName,
            ruleType,
            isFirst,
            options,
            localOptions: pending.beserk ? { beserk: 'true' } : undefined,
            lod: userStore.lod,
            flip: userStore.flip,
            custom: this._localCustom,
            opponent: { userId: pending.opponentId, userName: pending.opponentName, custom: pending.opponentCustom },
        });
        window.location.href = url;
    }

    /**
     * Auto-accepts an Arena challenge for which we are the recipient, then launches
     * the game URL exactly like the existing lobby accept flow (we are the second
     * joiner, so `isFirst` is false unless the challenger designated us first).
     */
    async _acceptArenaChallenge(msg) {
        if (!this._lobby) return;

        const ruleType = msg.ruleType || this._arena?.ruleType || 'nineball';
        const options = msg.options || this._arena?.options || {};

        try {
            await this._lobby.acceptChallenge(
                msg.challengerId,
                ruleType,
                msg.tableId,
                options,
                msg.challengerName,
                undefined,
                this._localCustom,
            );
        } catch (err) {
            console.error('Arena auto-accept failed:', err);
            return;
        }

        const isFirst = msg.nextTurnId ? msg.nextTurnId === userStore.clientId : false;
        const url = gameUrl({
            tableId: msg.tableId,
            userId: userStore.clientId,
            userName: userStore.userName,
            ruleType,
            isFirst,
            options,
            localOptions: this._beserk ? { beserk: 'true' } : undefined,
            lod: userStore.lod,
            flip: userStore.flip,
            custom: this._localCustom,
            opponent: { userId: msg.challengerId, userName: msg.challengerName || '', custom: msg.custom },
        });
        window.location.href = url;
    }

    // ── Arena data ────────────────────────────────────────────────────────────

    async _load() {
        if (!this.arenaId) return;
        this._busy = true;
        this._error = '';
        try {
            const response = await fetch(`${API_BASE}/api/arena/${encodeURIComponent(this.arenaId)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Unable to load Arena (${response.status})`);
            this._arena = data.arena;
            this._leaderboard = data.leaderboard || [];
            // Re-arm the one-shot stale refetch when the arena context changes.
            if (this.arenaId !== this._lastLoadedArenaId) {
                this._staleRefetchDone = false;
                this._lastLoadedArenaId = this.arenaId;
            }
            await this._syncArenaPresence();
            // Presence may have arrived while the initial load was in flight.
            // Check again now that the participant list is available and _busy is false.
            this._checkStaleArenaPresence();
        } catch (error) {
            this._error = error.message || 'Unable to load Arena.';
        } finally {
            this._busy = false;
        }
    }

    async _join() {
        const name = (userStore.userName || '').trim();
        if (/^(anonymous|anon)$/i.test(name)) {
            window.alert('You must change name, Anonymous is not a valid arena name');
            return;
        }
        await this._mutate('join', { playerId: userStore.clientId, name });
    }

    async _leave() {
        this._cancelPairing();
        if (this._lobby) {
            try {
                await this._lobby.updatePresence({ arenaId: undefined });
            } catch (err) {
                console.error('Failed to clear arena presence:', err);
            }
        }
        await this._mutate('leave', { playerId: userStore.clientId });
    }

    async _syncArenaPresence() {
        if (!this._lobby || !this._arena) return;
        const player = this._arena.players?.find(p => p.playerId === userStore.clientId);
        try {
            await this._lobby.updatePresence({ arenaId: player?.active !== false && player ? this.arenaId : undefined });
        } catch (error) {
            console.error('Failed to update Arena presence:', error);
        }
    }

    // ── One-shot stale-participant refetch (see better.md) ────────────────────

    /**
     * Detects staleness: an online user whose presence places them in this arena
     * while the loaded participant list does not include them. Exact match on
     * arenaId — users in other arenas must not trigger refetches. Self is
     * excluded (our own presence is only written after a successful _load()).
     */
    _checkStaleArenaPresence() {
        if (!this._arena || !this._lobby) return;
        const stale = this._onlineUsers.some(u =>
            u.userId !== userStore.clientId &&
            u.arenaId === this.arenaId &&
            !this._arena.players?.some(p => p.playerId === u.userId));
        if (stale) this._refetchStaleArenaOnce();
    }

    /**
     * Refetches the arena once per staleness event. The flag is set synchronously
     * BEFORE the async fetch so rapid onUsersChange bursts (heartbeats) can only
     * ever issue one request. Never reset on a timer — only when the arena
     * context changes (see _load()).
     */
    _refetchStaleArenaOnce() {
        if (this._staleRefetchDone || this._busy) return;
        this._staleRefetchDone = true;   // set BEFORE the fetch → guarantees once-only
        this._load();
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
     * Builds pairing candidates from the latest Arena and lobby snapshots.
     * Humans are preferred as a group: bots are only returned when no eligible
     * human is available.
     */
    _getPairingCandidates() {
        const myId = userStore.clientId;
        const humans = [];
        const bots = [];
        const diagnostics = [];

        for (const row of this._leaderboard) {
            if (row.playerId === myId) continue;

            const bot = isBotId(row.playerId);
            const record = this._arena?.players?.find(p => p.playerId === row.playerId);
            const onlineEntry = this._onlineUsers.find(u => u.userId === row.playerId);
            const playing = !bot && Boolean(onlineEntry?.tableId);
            const available = record?.active !== false && (bot || Boolean(onlineEntry && !playing));
            const status = { playerId: row.playerId, name: row.name, playing, bot, available };
            diagnostics.push(status);

            if (!available) continue;
            if (bot) bots.push(row);
            else humans.push(row);
        }

        return {
            candidates: humans.length > 0 ? humans : bots,
            diagnostics,
        };
    }

    _findEligibleOpponents() {
        return this._getPairingCandidates().candidates;
    }

    _startPairing() {
        // Guard: only one pairing session at a time.
        if (this._pairingState === 'counting') return;

        this._pairingState = 'counting';
        this._pairingCountdown = this._getPairingCandidates().candidates.some(candidate => !isBotId(candidate.playerId))
            ? HUMAN_PAIRING_COUNTDOWN_SECONDS
            : PAIRING_COUNTDOWN_SECONDS;
        this._pairedName = '';

        this._pairingInterval = setInterval(() => this._onPairingTick(), 1000);
    }

    _cancelPairing() {
        if (this._pairingInterval) { clearInterval(this._pairingInterval); this._pairingInterval = null; }
        if (this._pairingTimeout) { clearTimeout(this._pairingTimeout); this._pairingTimeout = null; }
        this._pairingState = null;
        this._pairingCountdown = PAIRING_COUNTDOWN_SECONDS;
        this._pairedName = '';
        // Berserk is a per-match choice; the next pairing starts off disabled.
        this._beserk = false;
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
     * Re-evaluates the latest candidates when the countdown completes, then selects
     * a random eligible opponent and initiates the existing lobby challenge action.
     * If no eligible opponent exists, shows the no-opponent result and returns to
     * the leaderboard.
     */
    _getOpponentHistory() {
        if (!this.arenaId) return [];
        try {
            const raw = localStorage.getItem(`arena_opponents_${this.arenaId}`);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    _recordOpponentHistory(opponentId) {
        if (!this.arenaId || !opponentId) return;
        try {
            const history = this._getOpponentHistory();
            history.push(opponentId);
            // Keep a short history (e.g. max 10 entries)
            if (history.length > 10) history.shift();
            localStorage.setItem(`arena_opponents_${this.arenaId}`, JSON.stringify(history));
        } catch (e) {
            console.error('Failed to save opponent history:', e);
        }
    }

    async _executePairing() {
        // Capture the choice before clearing it for the next pairing. Human
        // challenge acknowledgements can arrive after this method returns.
        const beserk = this._beserk;
        this._beserk = false;
        const { candidates, diagnostics } = this._getPairingCandidates();

        if (candidates.length === 0) {
            console.log('[Arena pairing]', { candidates: diagnostics, choice: null });
            this._pairingState = 'no-opponent';
            this._pairingTimeout = setTimeout(() => this._cancelPairing(), PAIRED_DISPLAY_MS);
            return;
        }

        const history = this._getOpponentHistory();
        const counts = {};
        for (const id of history) {
            counts[id] = (counts[id] || 0) + 1;
        }

        let minCount = Infinity;
        for (const candidate of candidates) {
            const count = counts[candidate.playerId] || 0;
            if (count < minCount) {
                minCount = count;
            }
        }

        const bestCandidates = candidates.filter(candidate => (counts[candidate.playerId] || 0) === minCount);
        const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];

        this._recordOpponentHistory(chosen.playerId);

        const chosenStatus = diagnostics.find(candidate => candidate.playerId === chosen.playerId);
        console.log('[Arena pairing]', {
            candidates: diagnostics,
            choice: chosenStatus,
        });
        this._pairedName = chosen.name;
        this._pairingState = 'paired';

        try {
            await this._initiateChallenge(chosen, beserk);
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
    async _initiateChallenge(opponent, beserk = this._beserk) {
        const arena = this._arena;
        const ruleType = arena?.ruleType || 'nineball';
        const options = arena?.options || {};
        const tournamentId = arena?.id || '';

        if (isBotId(opponent.playerId)) {
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
                custom: this._localCustom,
                opponent: { userId: opponent.playerId, userName: opponent.name, custom: opponent.custom },
                flip: userStore.flip,
                localOptions: beserk ? { beserk: 'true' } : undefined,
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
        const challengeOptions = { ...options, tournamentId };
        const pending = {
            opponentId: opponent.playerId,
            opponentName: opponent.name,
            opponentCustom: opponent.custom || this._onlineUsers.find(u => u.userId === opponent.playerId)?.custom,
            ruleType,
            options: challengeOptions,
            beserk,
            tableId: null,
            earlyAccept: null,
        };
        this._pendingArenaChallenge = pending;

        try {
            const tableId = await this._lobby.challenge(
                opponent.playerId,
                ruleType,
                challengeOptions,
                undefined,
                this._localCustom,
            );
            pending.tableId = tableId;

            if (pending.earlyAccept) {
                const earlyAccept = pending.earlyAccept;
                pending.earlyAccept = null;
                this._handleArenaChallengeMessage(earlyAccept);
            }
        } catch (error) {
            if (this._pendingArenaChallenge === pending) {
                this._pendingArenaChallenge = null;
            }
            throw error;
        }
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    _renderPairingOverlay() {
        if (this._pairingState === 'counting') {
            return html`
                <div class="pairing-overlay active" role="status" aria-live="polite">
                    <div class="pairing-tick" aria-label="Seconds remaining: ${this._pairingCountdown}">${this._pairingCountdown}</div>
                    <div class="pairing-label">Pairing…</div>
                    <div class="pairing-hint">Finding an opponent</div>
                    <button class="pairing-beserk" type="button" aria-pressed=${this._beserk} @click=${() => { this._beserk = !this._beserk; }}>Beserk 🚀</button>
                    <button type="button" @click=${this._cancelPairing}>Cancel</button>
                </div>`;
        }
        if (this._pairingState === 'paired') {
            return html`
                <div class="pairing-overlay active" role="status" aria-live="assertive">
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
        const expired = this._isExpired();
        const arenaActive = arena?.status === 'active' && !expired;
        const canPair = joined && activeParticipant && arenaActive && this._pairingState === null;
        const isPairing = this._pairingState !== null;

        const overlay = this._renderPairingOverlay();

        return html`<div class="container">
            ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : ''}
            ${!arena && !this._error ? html`<section class="panel"><div class="empty">Loading Arena…</div></section>` : ''}
            ${arena ? html`
                <section class="panel">
                    <div class="panel-heading">
                        <h2 class="title">${expired ? 'Arena complete' : 'Arena'} ${ruleIcon(arena.ruleType)}</h2>
                    </div>
                    <div class="meta">
                        Status: ${expired ? 'complete' : arena.status} · ${arena.durationMinutes} minutes · ${arena.players.length} participant${arena.players.length === 1 ? '' : 's'} · ${expired ? 'Ended' : 'Ends'}: ${new Date(arena.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    ${!expired ? html`<div class="actions">
                        <button type="button" ?disabled=${this._busy || isPairing} @click=${this._load}>Refresh</button>
                        ${joined && activeParticipant
                            ? html`<button class="btn-leave" type="button" ?disabled=${this._busy} @click=${this._leave}>Leave Arena</button>`
                            : html`<button class="btn-accept" type="button" ?disabled=${this._busy || !arenaActive} @click=${this._join}>Join Arena</button>`
                        }
                        ${canPair
                            ? html`<button class="btn-challenge" type="button" @click=${this._startPairing}>Pair</button>`
                            : ''
                        }
                    </div>` : ''}
                </section>
                <section class="panel">
                    ${overlay}
                    <arena-leaderboard
                        .standings=${this._leaderboard}
                        .players=${arena.players}
                        .onlineUsers=${this._onlineUsers}
                        .expired=${expired}
                        countdown=${this._getCountdownText()}
                    ></arena-leaderboard>
                </section>` : ''}
        </div>`;
    }
}

customElements.define('arena-view', ArenaView);
