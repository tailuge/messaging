import { LitElement, html } from 'lit';
import { INFO_PANEL_STYLES } from './styles.js';
import { SCOREBOARD_URL, timeAgo, flag, ruleIcon, renderTrophy } from './utils.js';
import { userStore } from './user-store.js';
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
        if (this._err) return html`<span class="loading">Could not load scores.</span>`;
        if (!this._data) return html`<span class="loading">Loading…</span>`;
        const { hiscores, topPlayers, recentMatches } = this._data;
        const games = Object.keys(hiscores);
        return html`
            <div class="group">
                <div class="group-title">Hi Scores</div>
                <div class="group-body">
                    ${games.map(game => html`
                        <div class="tbl"><table><caption>${ruleIcon(game)}</caption>
                        <tr><th>Name</th><th>Score</th><th></th></tr>
                            ${hiscores[game].slice(0, 4).map((s, i) => html`<tr><td>${renderTrophy(i)} ${s.name}</td><td>${s.score}</td><td><replay-button url="${SCOREBOARD_URL}/api/rank/${s.id}?ruletype=${game}"></replay-button></td></tr>`)}
                        </table></div>
                    `)}
                </div>
            </div>
            <div class="group">
                <div class="group-title">Top Players</div>
                <div class="group-body">
                    ${games.map(game => html`
                        <div class="tbl"><table><caption>${ruleIcon(game)}</caption>
                        <tr><th>Name</th><th>Rating</th><th>W</th><th>L</th></tr>
                            ${topPlayers[game].slice(0, 4).map((p, i) => html`<tr>
                                <td><a href="${SCOREBOARD_URL}/player/${encodeURIComponent(p.name)}?ruleType=${game}">${renderTrophy(i)} ${p.name}</a></td>
                                <td>${Math.round(p.rating)}</td>
                            </tr>`)}
                        </table></div>
                    `)}
                </div>
            </div>
            <div class="tbl"><table><caption>Recent Matches</caption>
            <tr><th>Rule</th><th>Match</th><th>Date</th><th></th></tr>
                ${recentMatches.map(m => html`<tr>
                    <td>${ruleIcon(m.ruleType)}</td><td>${m.loser ? '🎖️' : ''}${m.winner}${m.loser ? ` vs ${m.loser}` : ''}</td>
                    <td class="date">${timeAgo(m.timestamp)}${m.locationCountry ? ` ${m.locationCity ?? ''} ${flag(m.locationCountry)}` : ''}</td>
                    <td>${m.hasReplay ? html`<replay-button url="${SCOREBOARD_URL}/api/match-replay?id=${m.id}&lod=${userStore.lod}"></replay-button>` : ''}</td>
                </tr>`)}
            </table></div>`;
    }
}

customElements.define('info-panel', InfoPanel);
