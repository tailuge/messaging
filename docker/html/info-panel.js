import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { INFO_PANEL_STYLES } from './styles.js';
import { SCOREBOARD_URL, timeAgo, flag, ruleIcon } from './utils.js';
import './replay-button.js';

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
                    ${hiscores[game].slice(0, 4).map(s => html`<tr><td>${s.name}</td><td>${s.score}</td><td><replay-button url="${SCOREBOARD_URL}/api/rank/${s.id}?ruletype=${game}"></replay-button></td></tr>`)}
                </table></div>
            `)}
            ${games.map(game => html`
                <div class="tbl"><table><caption>${game} · Top Players</caption>
                <tr><th>Name</th><th>Rating</th><th>W</th><th>L</th></tr>
                    ${topPlayers[game].slice(0, 4).map(p => html`<tr>
                        <td><a href="${SCOREBOARD_URL}/player/${encodeURIComponent(p.name)}?ruleType=${game}">${p.name}</a></td>
                        <td>${Math.round(p.rating)}</td>
                    </tr>`)}
                </table></div>
            `)}
            <div class="tbl"><table><caption>Recent Matches</caption>
            <tr><th>Rule</th><th>Match</th><th>Date</th><th></th></tr>
                ${recentMatches.map(m => html`<tr>
                    <td>${ruleIcon(m.ruleType)}</td><td>🎖️${m.winner}${m.loser ? ` vs ${m.loser}` : ''}</td>
                    <td class="date">${timeAgo(m.timestamp)}${m.locationCountry ? ` ${m.locationCity ?? ''} ${flag(m.locationCountry)}` : ''}</td>
                    <td>${m.hasReplay ? html`<replay-button url="${SCOREBOARD_URL}/api/match-replay?id=${m.id}"></replay-button>` : ''}</td>
                </tr>`)}
            </table></div>`;
    }
}

customElements.define('info-panel', InfoPanel);
