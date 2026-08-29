import { html, css } from 'lit';
import { THEME_VARS, SHARED_STYLES } from '../styles.js';
import { userStore, StoreElement } from '../user-store.js';

// Visual phase only: localStorage stands in for the app's KV store and
// `storage` events provide live updates between tabs. Swap loadAll/saveAll
// for real KV connectivity when the backend lands — the data shape below
// already matches the tournament document spec.
const STORE_KEY = 'billiards.tournaments';

const GAMES = [
    { id: 'eightball', label: '8-Ball', icon: 'assets/eightball.png' },
    { id: 'nineball', label: '9-Ball', icon: 'assets/nineball.png' },
    { id: 'snooker', label: 'Snooker', icon: 'assets/snooker.png' },
    { id: 'threecushion', label: '3-Cushion', icon: 'assets/threecushion.png' },
    { id: 'sagu', label: 'Sagu', icon: 'assets/sagu.png' },
];

const SIZES = [4, 8, 16, 32];

const loadAll = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
};
const saveAll = all => localStorage.setItem(STORE_KEY, JSON.stringify(all));
const genId = () => 't-' + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-3);

const roundLabel = playersLeft =>
    playersLeft === 2 ? 'Final'
        : playersLeft === 4 ? 'Semi-finals'
            : playersLeft === 8 ? 'Quarter-finals'
                : `Round of ${playersLeft}`;

class TournamentApp extends StoreElement {
    static properties = {
        _theme: { type: String, reflect: true, attribute: 'theme' },
        _tournament: { state: true },
        _gameType: { state: true },
        _size: { state: true },
        _name: { state: true },
        _copied: { state: true },
    };

    // Reuses the lobby theme tokens (THEME_VARS) and shared button styles,
    // plus local layout rules for the form, registration list and bracket.
    static styles = [THEME_VARS, SHARED_STYLES, css`
        :host {
            display: flex; flex-direction: column; min-height: 100vh;
            box-sizing: border-box; padding: 0.5rem;
            background: var(--bg); color: var(--text);
            font-size: 0.85rem; overflow-y: auto; scrollbar-width: none;
        }
        :host::-webkit-scrollbar { display: none; }
        .container {
            max-width: 900px; margin: 0 auto; width: 100%;
            display: flex; flex-direction: column; gap: 0.4rem; flex: 1;
        }
        a { color: var(--link); text-decoration: none; }
        a:hover { text-decoration: underline; }
        .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem; }
        .panel-title { font-weight: bold; margin-bottom: 0.35rem; font-size: 0.8rem; color: var(--text-dim); text-align: center; }

        /* Create form */
        .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.6rem; }
        .field-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .game-row { display: flex; flex-wrap: wrap; gap: 0.3rem; }
        .game-btn { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; padding: 0.3rem 0.5rem; min-width: 64px; font-size: 0.72rem; }
        .game-btn img { width: 28px; height: 28px; display: block; }
        .size-row { display: flex; flex-wrap: wrap; gap: 0.3rem; }
        .size-btn { flex: 1; max-width: 80px; padding: 0.35rem 0; font-size: 0.85rem; }
        .game-btn.selected, .size-btn.selected { border-color: #0d6efd; box-shadow: 0 0 0 1px #0d6efd inset; color: var(--link); font-weight: 600; }
        .create-btn { width: 100%; padding: 0.5rem; font-size: 0.9rem; margin-top: 0.15rem; }
        .note { font-size: 0.68rem; color: var(--text-muted); text-align: center; margin: 0.5rem 0 0; }

        /* Tournament header */
        .head-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .head-row img { width: 28px; height: 28px; flex-shrink: 0; }
        .t-title { font-size: 1.05rem; font-weight: 600; margin: 0; flex: 1; min-width: 0; }
        .pill { font-size: 0.68rem; font-weight: 600; padding: 0.1rem 0.5rem; border-radius: 999px; letter-spacing: 0.08em; flex-shrink: 0; }
        .pill.open { background: #198754; color: #fff; }
        .pill.started { background: var(--btn-bg); color: var(--text-muted); border: 1px solid var(--btn-border); }
        .count { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.25rem; }
        .share-row { display: flex; gap: 0.3rem; margin-top: 0.4rem; }
        .share-row input {
            flex: 1; min-width: 0; box-sizing: border-box;
            background: var(--bg); border: 1px solid var(--border); border-radius: 4px;
            color: var(--text-muted); font: inherit; font-size: 0.72rem; padding: 0.25rem 0.4rem;
        }
        input:focus-visible { outline: 2px solid #007bff; outline-offset: 1px; }

        /* Registration */
        .join-row { display: flex; gap: 0.3rem; margin-bottom: 0.5rem; }
        .join-row input {
            flex: 1; min-width: 0; box-sizing: border-box;
            background: var(--bg); border: 1px solid var(--border); border-radius: 4px;
            color: var(--text); font: inherit; padding: 0.25rem 0.4rem;
        }
        .status-line { font-size: 0.78rem; color: var(--text-muted); font-style: italic; margin: 0 0 0.5rem; }
        .status-line.ok { color: #198754; font-style: normal; }
        .players {
            list-style: none; margin: 0; padding: 1px;
            display: flex; flex-direction: column; gap: 2px;
            max-height: 260px; overflow-y: auto;
            scrollbar-width: thin; scrollbar-color: var(--border) transparent;
        }
        .players li {
            display: flex; align-items: center; gap: 0.4rem;
            border: 0.25px solid var(--border-light); border-radius: 4px;
            min-height: 28px; padding: 0 0.4rem; font-size: 0.8rem;
        }
        .players li.you { background: var(--btn-hover); }
        .seed { color: var(--text-faint); font-size: 0.7rem; width: 1.7rem; flex-shrink: 0; }
        .p-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .you-tag { margin-left: auto; font-size: 0.65rem; color: #198754; flex-shrink: 0; }
        li.open-slot { color: var(--text-faint); font-style: italic; justify-content: center; border-style: dashed; }
        .start-btn { width: 100%; padding: 0.6rem; font-size: 0.95rem; font-weight: 600; letter-spacing: 0.1em; margin-top: 0.5rem; }

        /* Bracket */
        .bracket-wrap { overflow-x: auto; padding: 0.25rem 0; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .bracket { display: flex; gap: 1.6rem; align-items: stretch; min-width: max-content; padding-right: 1.6rem; }
        .round { display: flex; flex-direction: column; min-width: 140px; }
        .round-title { font-size: 0.65rem; color: var(--text-muted); text-align: center; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.15rem 0; }
        .matches { flex: 1; display: flex; flex-direction: column; justify-content: space-around; gap: 0.35rem; }
        .round.champion { min-width: 110px; }
        .round.champion .matches { justify-content: center; }
        .match { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
        .match.linked { position: relative; }
        .match.linked::before {
            content: ''; position: absolute; left: -1.6rem; top: 50%;
            width: 1.6rem; border-top: 1px solid var(--border);
        }
        .slot {
            display: flex; align-items: center; gap: 0.35rem;
            padding: 0.2rem 0.45rem; font-size: 0.75rem; min-height: 26px; box-sizing: border-box;
        }
        .slot + .slot { border-top: 1px solid var(--border-light); }
        .slot.empty { color: var(--text-faint); font-style: italic; }
        .slot.big { font-size: 0.85rem; min-height: 30px; justify-content: center; }

        .foot { text-align: center; font-size: 0.7rem; opacity: 0.7; padding: 0.6rem 0; }
        .foot a { color: inherit; }
    `];

    constructor() {
        super();
        this._theme = document.documentElement.getAttribute('theme') || 'dark';
        this._gameType = GAMES[0].id;
        this._size = 8;
        this._name = userStore.userName;
        this._copied = false;
        this._id = new URLSearchParams(window.location.search).get('id');
        this._tournament = this._id ? loadAll()[this._id] || null : null;
    }

    connectedCallback() {
        super.connectedCallback();
        // Live updates: other tabs/documents joining the same tournament
        // re-render us without a refresh (stand-in for the real-time convention).
        this._onStorage = e => {
            if (e.key === STORE_KEY && this._id) {
                this._tournament = loadAll()[this._id] || null;
            } else if (e.key === 'theme' && e.newValue) {
                // Follow theme changes made by the host page (e.g. lobby) or other tabs.
                this._theme = e.newValue;
            }
        };
        window.addEventListener('storage', this._onStorage);
    }

    disconnectedCallback() {
        window.removeEventListener('storage', this._onStorage);
        clearTimeout(this._copyTimer);
        super.disconnectedCallback();
    }

    _save() {
        const all = loadAll();
        all[this._tournament.id] = this._tournament;
        saveAll(all);
        this._tournament = { ...this._tournament };
    }

    _create() {
        const id = genId();
        const all = loadAll();
        all[id] = {
            id,
            gameType: this._gameType,
            size: this._size,
            status: 'open',
            participants: [],
            createdAt: Date.now(),
        };
        saveAll(all);
        window.location.assign(`?id=${id}`);
    }

    _join() {
        const t = this._tournament;
        if (!t || t.status !== 'open' || t.participants.length >= t.size) return;
        if (t.participants.some(p => p.id === userStore.clientId)) return;
        const name = (this._name || '').trim().slice(0, 12) || 'Anonymous';
        if (name !== userStore.userName) userStore.set(userStore.clientId, name);
        t.participants = [...t.participants, { id: userStore.clientId, name }];
        this._save();
    }

    _start() {
        const t = this._tournament;
        if (!t || t.status !== 'open' || t.participants.length < t.size) return;
        t.status = 'started';
        this._save();
    }

    async _copy() {
        const url = `${window.location.origin}${window.location.pathname}?id=${this._tournament.id}`;
        try {
            await navigator.clipboard.writeText(url);
            this._copied = true;
            clearTimeout(this._copyTimer);
            this._copyTimer = setTimeout(() => { this._copied = false; }, 2000);
        } catch {
            // Clipboard unavailable (non-secure context): fall back to selecting
            // the URL so the user can copy it manually.
            const input = this.renderRoot.querySelector('.share-url');
            if (input) { input.focus(); input.select(); }
        }
    }

    // Display-only knockout bracket: participants fill round-1 slots in
    // registration order; later rounds stay as "?" until a backend provides
    // match progression.
    _buildBracket(t) {
        const rounds = [];
        let count = t.size / 2;
        while (count >= 1) {
            rounds.push(Array.from({ length: count }, () => [null, null]));
            count /= 2;
        }
        t.participants.slice(0, t.size).forEach((p, i) => {
            rounds[0][Math.floor(i / 2)][i % 2] = p;
        });
        return rounds;
    }

    _renderRound(matches, roundIndex, size) {
        return html`
            <div class="round">
                <div class="round-title">${roundLabel(size >> roundIndex)}</div>
                <div class="matches">
                    ${matches.map(m => html`
                        <div class="match ${roundIndex > 0 ? 'linked' : ''}">
                            ${m.map(p => p
                                ? html`<div class="slot"><span class="p-name">${p.name}</span></div>`
                                : html`<div class="slot empty"><span class="p-name">${roundIndex === 0 ? '—' : '?'}</span></div>`)}
                        </div>`)}
                </div>
            </div>`;
    }

    _renderCreate() {
        return html`
            <div class="panel">
                <div class="panel-title">Create Tournament</div>
                <div class="field">
                    <span class="field-label" id="game-label">Game type</span>
                    <div class="game-row" role="radiogroup" aria-labelledby="game-label">
                        ${GAMES.map(g => html`
                            <button class="game-btn ${this._gameType === g.id ? 'selected' : ''}"
                                    role="radio" aria-checked="${this._gameType === g.id}"
                                    @click=${() => { this._gameType = g.id; }}>
                                <img src="${g.icon}" alt="" width="28" height="28"/>
                                <span>${g.label}</span>
                            </button>`)}
                    </div>
                </div>
                <div class="field">
                    <span class="field-label" id="size-label">Tournament size</span>
                    <div class="size-row" role="radiogroup" aria-labelledby="size-label">
                        ${SIZES.map(s => html`
                            <button class="size-btn ${this._size === s ? 'selected' : ''}"
                                    role="radio" aria-checked="${this._size === s}"
                                    @click=${() => { this._size = s; }}>${s}</button>`)}
                    </div>
                </div>
                <button class="btn-challenge create-btn" @click=${this._create}>Create Tournament</button>
                <p class="note">Preview mode — tournaments are stored in this browser until backend storage is connected.</p>
            </div>`;
    }

    _renderTournament() {
        const t = this._tournament;
        if (!t) {
            return html`
                <div class="panel">
                    <div class="panel-title">Tournament not found</div>
                    <p class="status-line">This tournament isn't in this browser's preview storage. Until backend
                        storage is connected, tournaments only exist in the browser that created them.</p>
                    <p><a href="tournament.html">← Create a new tournament</a></p>
                </div>`;
        }
        const game = GAMES.find(g => g.id === t.gameType) ?? GAMES[0];
        const open = t.status === 'open';
        const count = t.participants.length;
        const full = count >= t.size;
        const missing = t.size - count;
        const joined = t.participants.some(p => p.id === userStore.clientId);
        const shareUrl = `${window.location.origin}${window.location.pathname}?id=${t.id}`;

        return html`
            <div class="panel">
                <div class="head-row">
                    <img src="${game.icon}" alt="" width="28" height="28"/>
                    <h2 class="t-title">${game.label} Tournament</h2>
                    <span class="pill ${open ? 'open' : 'started'}" role="status">${open ? 'OPEN' : 'STARTED'}</span>
                </div>
                <div class="count">${count} / ${t.size} players registered</div>
                <div class="share-row">
                    <input class="share-url" readonly value="${shareUrl}"
                           aria-label="Shareable tournament URL" @focus=${e => e.target.select()}/>
                    <button @click=${this._copy} aria-label="Copy tournament link">${this._copied ? '✓ Copied' : 'Copy'}</button>
                </div>
            </div>
            <div class="panel">
                <div class="panel-title">Registration</div>
                ${!open ? html`<p class="status-line">Registration closed — the tournament has started.</p>`
            : joined ? html`<p class="status-line ok">✓ You're registered as ${userStore.userName}.</p>`
                : full ? html`<p class="status-line">Tournament is full.</p>`
                    : html`
                        <div class="join-row">
                            <input .value=${this._name} maxlength="12" placeholder="Display name"
                                   aria-label="Display name" @input=${e => { this._name = e.target.value; }}
                                   @keydown=${e => e.key === 'Enter' && this._join()}/>
                            <button class="btn-challenge" @click=${this._join}>Join Tournament</button>
                        </div>`}
                <ul class="players" aria-label="Registered players">
                    ${t.participants.map((p, i) => html`
                        <li class="${p.id === userStore.clientId ? 'you' : ''}">
                            <span class="seed">#${i + 1}</span><span class="p-name">${p.name}</span>
                            ${p.id === userStore.clientId ? html`<span class="you-tag">you</span>` : ''}
                        </li>`)}
                    ${open && !full ? html`<li class="open-slot">Waiting for ${missing} more player${missing === 1 ? '' : 's'}…</li>` : ''}
                </ul>
                ${open && full ? html`<button class="btn-accept start-btn" @click=${this._start}>START TOURNAMENT</button>` : ''}
            </div>
            <div class="panel">
                <div class="panel-title">Bracket</div>
                <div class="bracket-wrap">
                    <div class="bracket">
                        ${this._buildBracket(t).map((matches, r) => this._renderRound(matches, r, t.size))}
                        <div class="round champion">
                            <div class="round-title">Champion</div>
                            <div class="matches">
                                <div class="match linked"><div class="slot empty big">🏆 ?</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    render() {
        return html`
            <div class="container">
                ${this._id ? this._renderTournament() : this._renderCreate()}
                <footer class="foot">
                    Part of <a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">tailuge/billiards</a> — free online billiards.
                </footer>
            </div>`;
    }
}

customElements.define('tournament-app', TournamentApp);
