import { html } from 'lit';
import { INFO_PANEL_STYLES } from './styles.js';
import { SCOREBOARD_URL, timeAgo, flag, ruleIcon, renderTrophy, replayUrl, isVercel } from './utils.js';
import { userStore, StoreElement } from './user-store.js';
import './replay-button.js';

class InfoPanel extends StoreElement {
    static styles = INFO_PANEL_STYLES;
    connectedCallback() {
        super.connectedCallback();
        if (isVercel) {
            this.classList.add('loaded');
            return;
        }
        fetch(`${SCOREBOARD_URL}/api/summary`, { mode: 'cors' })
            .then(r => r.json())
            .then(d => {
                this._data = d;
                this.classList.add('loaded');
                this.requestUpdate();
            })
            .catch(() => {
                this._err = true;
                this.classList.add('loaded');
                this.requestUpdate();
            });
    }
    render() {
        if (isVercel) return html`<span class="loading">We have moved <a href="https://billiards.tailuge.workers.dev/lobby">Play online here</a></span>`;
        if (this._err) return html`<span class="loading">Could not load scores.</span>`;
        if (!this._data) return html`<span class="loading">Connecting to server…</span>`;
        const { hiscores, topPlayers, recentMatches } = this._data;
        const games = Object.keys(hiscores);
        return html`
            <div class="group hiscores">
                <div class="group-body">
                    ${games.map(game => html`
                        <div class="tbl${game === 'sagu' ? ' sagu-hi' : ''}"><table><caption><a href="${SCOREBOARD_URL}/leaderboard" target="_blank" rel="noopener" style="font-weight:200;font-size:0.75rem">${ruleIcon(game)} HiScore</a></caption>
                        <tr><th>Name</th><th></th></tr>
                            ${hiscores[game].slice(0, 4).map((s, i) => html`<tr><td>${renderTrophy(i)} ${s.name}</td><td><replay-button url="${replayUrl(`${SCOREBOARD_URL}/api/rank/${s.id}?ruletype=${game}&lod=${userStore.lod}`, userStore.clientId, userStore.userName)}" label="${s.score}"></replay-button></td></tr>`)}
                        </table></div>
                    `)}
                </div>
            </div>
            <div class="bottom-row">
                <div class="group recent">
                    <div class="group-body">
                        <div class="tbl"><table>
                        <tr><th>Rule</th><th>Match</th><th>Ago</th><th class="city-col">City</th><th></th></tr>
                            ${recentMatches.map(m => html`<tr>
                                <td>${ruleIcon(m.ruleType)}</td><td>${m.arenaId ? '⚔️' : ''}${m.loser ? (m.tableSize != null && m.tableSize < 10 ? '🍼' : '🎖️') : ''}${m.freeaim === true ? '⌖' : ''}${m.beserk === true || m.beserk === 'true' ? '🚀' : ''}${m.winner}${m.winnerScore != null ? html`<span class="score">(${m.winnerScore})</span>` : ''}${m.loser ? html` vs ${m.loser}${m.loserScore != null ? html`<span class="score">(${m.loserScore})</span>` : ''}` : ''}</td>
                                <td class="ago">${timeAgo(m.timestamp)}</td>
                                <td class="city-col">${m.locationCity ?? ''}</td>
<td class="replay-col">
                                    ${m.hasReplay
                                        ? html`<replay-button prefix="${flag(m.locationCountry).emoji}" prefixTitle="${flag(m.locationCountry).title}" url="${replayUrl(`${SCOREBOARD_URL}/api/match-replay?id=${m.id}&lod=${userStore.lod}`, userStore.clientId, userStore.userName)}"></replay-button>`
                                        : flag(m.locationCountry).emoji}
                                </td>
                            </tr>`)}
                        </table></div>
                    </div>
                </div>
                <div class="group top-players">
                    <div class="group-body">
                        ${games.map(game => html`
                            <div class="tbl"><table><caption><a href="${SCOREBOARD_URL}/elo" target="_blank" rel="noopener">${ruleIcon(game)} <span style="font-size:0.75rem;font-weight:200">Rankings</span></a></caption>
                             <tr><th>Name</th><th>Score</th><th>W</th><th>L</th></tr>
                                 ${topPlayers[game].slice(0, 4).map((p, i) => html`<tr>
                                     <td><a href="${SCOREBOARD_URL}/player/${encodeURIComponent(p.name)}?ruleType=${game}">${renderTrophy(i)} ${p.name}</a></td>
                                     <td>${Math.round(p.conservativeRating)}</td>
                                 </tr>`)}
                            </table></div>
                        `)}
                    </div>
                </div>
            </div>`;
    }
}

customElements.define('info-panel', InfoPanel);
