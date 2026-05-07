import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { INFO_PANEL_STYLES } from './styles.js';
import { SCOREBOARD_URL } from './utils.js';

class InfoPanel extends LitElement {
    static styles = INFO_PANEL_STYLES;
    connectedCallback() {
        super.connectedCallback();
        fetch(`${SCOREBOARD_URL}/api/summary`, { mode: 'cors' })
            .then(r => r.json())
            .then(d => { this._data = d; this.requestUpdate(); })
            .catch(() => { this._err = true; this.requestUpdate(); });
    }
    render() {
        if (this._err) return html`<span style="color:#999">Could not load scores.</span>`;
        if (!this._data) return html`<span style="color:#999">Loading…</span>`;
        const { hiscores, topPlayers, recentMatches } = this._data;
        const games = Object.keys(hiscores);
        return html`
            ${games.map(game => html`
                <div class="tbl"><table><caption>${game} · High Scores</caption>
                <tr><th>Name</th><th>Score</th><th></th></tr>
                    ${hiscores[game].map(s => html`<tr><td>${s.name}</td><td>${s.score}</td><td><a href="${SCOREBOARD_URL}/api/rank/${s.id}?ruletype=${game}">replay</a></td></tr>`)}
                </table></div>
            `)}
            ${games.map(game => html`
                <div class="tbl"><table><caption>${game} · Top Players</caption>
                <tr><th>Name</th><th>Rating</th><th>W</th><th>L</th></tr>
                    ${topPlayers[game].map(p => html`<tr>
                        <td><a href="${SCOREBOARD_URL}/player/${encodeURIComponent(p.name)}?ruleType=${game}">${p.name}</a></td>
                        <td>${Math.round(p.rating)}</td><td>${p.wins}</td><td>${p.losses}</td>
                    </tr>`)}
                </table></div>
            `)}
            <div class="tbl"><table><caption>Recent Matches</caption>
            <tr><th>Winner</th><th>Loser</th><th>Rule</th><th>Date</th><th></th></tr>
                ${recentMatches.map(m => html`<tr>
                    <td>${m.winner}</td><td>${m.loser||'-'}</td><td>${m.ruleType||'nineball'}</td>
                    <td>${new Date(m.timestamp).toLocaleString()}</td>
                    <td>${m.hasReplay ? html`<a href="${SCOREBOARD_URL}/api/match-replay?id=${m.id}">replay</a>` : ''}</td>
                </tr>`)}
            </table></div>`;
    }
}

customElements.define('info-panel', InfoPanel);
