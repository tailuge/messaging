import { LitElement, html, css } from 'lit';
import { THEME_VARS, SHARED_STYLES } from '../styles.js';
import '../user-badge.js';

const GAMES = [
    { id: 'eightball', label: '8-Ball', icon: 'assets/eightball.png' },
    { id: 'nineball', label: '9-Ball', icon: 'assets/nineball.png' },
    { id: 'snooker', label: 'Snooker', icon: 'assets/snooker.png' },
    { id: 'threecushion', label: '3-Cushion', icon: 'assets/threecushion.png' },
    { id: 'sagu', label: 'Sagu', icon: 'assets/sagu.png' },
];

class ArenaApp extends LitElement {
    static properties = { _theme: { type: String, reflect: true, attribute: 'theme' } };

    static styles = [THEME_VARS, SHARED_STYLES, css`
        :host {
            display: block; min-height: 100vh; box-sizing: border-box;
            padding: 0.5rem; background: var(--bg); color: var(--text);
            font-family: 'Exo', sans-serif; font-weight: 200; font-size: 0.85rem;
        }
        .container { max-width: 900px; margin: 0 auto; }
        .topbar { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
        .logo { width: 32px; height: 32px; flex-shrink: 0; filter: grayscale(100%); opacity: 0.7; }
        h1 { flex: 1; min-width: 0; margin: 0; font-size: 1rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-dim); }
        h1 a { color: inherit; text-decoration: none; }
        h1 a:hover { text-decoration: underline; }
        .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem; margin-bottom: 0.4rem; }
        .arena-head { display: flex; align-items: center; gap: 0.5rem; }
        .arena-icon { width: 40px; height: 40px; }
        .arena-title { flex: 1; margin: 0; font-size: 1.15rem; font-weight: 600; }
        .status { color: #198754; font-size: 0.7rem; letter-spacing: 0.08em; }
        .meta { color: var(--text-muted); font-size: 0.72rem; margin-top: 0.25rem; }
        .join { width: 100%; margin-top: 0.6rem; padding: 0.6rem; border: 0; border-radius: 4px; background: var(--accent, #0d6efd); color: #fff; font: inherit; font-size: 1.05rem; font-weight: 200; letter-spacing: 0.1em; cursor: pointer; }
        .join:hover { filter: brightness(1.1); }
        .section-title { margin: 0 0 0.4rem; text-align: center; font-size: 0.8rem; color: var(--text-dim); font-weight: 600; }
        table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
        th, td { padding: 0.35rem 0.25rem; border-bottom: 1px solid var(--border); text-align: left; }
        th { color: var(--text-muted); font-size: 0.68rem; font-weight: 600; }
        th:not(:first-child), td:not(:first-child) { text-align: right; }
        .empty { color: var(--text-muted); text-align: center; padding: 1rem 0; }
    `];

    constructor() {
        super();
        this._theme = document.documentElement.getAttribute('theme') || 'light';
    }

    render() {
        const game = GAMES[3];
        return html`
            <div class="container">
                <header class="topbar">
                    <img src="assets/threecushion.png" class="logo" alt="Billiards Logo" />
                    <h1><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Billiards</a></h1>
                    <user-badge></user-badge>
                </header>

                <section class="panel">
                    <div class="arena-head">
                        <img class="arena-icon" src="${game.icon}" alt="${game.label}" />
                        <h2 class="arena-title">${game.label} Arena</h2>
                        <span class="status">ACTIVE</span>
                    </div>
                    <div class="meta">One-hour tournament · Ends in 59:42</div>
                    <button class="join" type="button" @click=${e => e.preventDefault()}>JOIN ARENA</button>
                </section>

                <section class="panel">
                    <h2 class="section-title">Leaderboard</h2>
                    <div class="empty">No players have joined yet.</div>
                    <table hidden>
                        <thead><tr><th>#</th><th>Player</th><th>Points</th><th>Elo</th></tr></thead>
                        <tbody></tbody>
                    </table>
                </section>
            </div>
        `;
    }
}

customElements.define('arena-app', ArenaApp);
