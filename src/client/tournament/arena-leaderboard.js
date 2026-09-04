import { LitElement, html, css } from 'lit';
import { THEME_VARS } from '../styles.js';

class ArenaLeaderboard extends LitElement {
    static properties = {
        standings: { attribute: false },
        players: { attribute: false },
        onlineUsers: { attribute: false },
        expired: { type: Boolean },
        countdown: { type: String },
    };

    static styles = [THEME_VARS, css`
        :host { display: block; }
        .leaderboard-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .25rem; }
        .title { margin: 0; font-size: .8rem; font-weight: 600; }
        .meta { color: var(--text-muted); font-size: .75rem; line-height: 1.7; }
        .countdown { font-size: .85rem; font-weight: 600; color: var(--text-muted); font-variant-numeric: tabular-nums; }
        .players-scroll { max-height: 14.85rem; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .players { width: 100%; border-collapse: collapse; }
        thead { position: sticky; top: 0; background: transparent; z-index: 1; }
        th, td { height: 1.35rem; box-sizing: border-box; padding: .15rem .25rem; border-bottom: none; line-height: 1.2; text-align: right; }
        th { color: var(--text-muted); font-size: .7rem; }
        th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
        th:first-child, td:first-child { width: 2rem; }
        .online-dot { display: inline-block; width: .45rem; height: .45rem; margin-right: .3rem; border-radius: 50%; background: #198754; vertical-align: middle; }
        .empty { color: var(--text-muted); text-align: center; padding: 1rem 0; }
    `];

    constructor() {
        super();
        this.standings = [];
        this.players = [];
        this.onlineUsers = [];
        this.expired = false;
        this.countdown = '';
    }

    render() {
        return html`
            <div class="leaderboard-header">
                <h2 class="title">${this.expired ? 'Final standings' : 'Leaderboard'}</h2>
                ${this.countdown ? html`<div class="countdown" aria-label="Time remaining">${this.countdown}</div>` : ''}
            </div>
            ${this.expired ? html`<arena-podium .standings=${this.standings}></arena-podium>` : ''}
            ${this.standings.length
                ? html`<div class="players-scroll"><table class="players">
                    <thead><tr><th>#</th><th>Player</th><th>Points</th><th>Wins</th><th>Games</th></tr></thead>
                    <tbody>${this.standings.map((row, index) => {
                        const record = this.players.find(player => player.playerId === row.playerId);
                        const online = isBotId(row.playerId)
                            ? true
                            : this.onlineUsers.some(user => user.userId === row.playerId);
                        return html`<tr>
                            <td>#${index + 1}</td>
                            <td>
                                ${online ? html`<span class="online-dot" aria-label="Online" title="Online"></span>` : ''}
                                ${row.name}${record?.active === false ? ' (left)' : ''}
                            </td>
                            <td>${row.points}</td>
                            <td>${row.wins}</td>
                            <td>${row.games}</td>
                        </tr>`;
                    })}</tbody>
                </table></div>`
                : html`<div class="empty">No players have joined yet.</div>`}
        `;
    }
}

function isBotId(playerId) {
    return ['bot-thefarjaw', 'bot-clawbreak'].includes(playerId);
}

customElements.define('arena-leaderboard', ArenaLeaderboard);
