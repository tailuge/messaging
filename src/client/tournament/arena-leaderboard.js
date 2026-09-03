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
        .leaderboard-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .5rem; }
        .title { margin: 0; font-size: 1.1rem; font-weight: 600; }
        .meta { color: var(--text-muted); font-size: .75rem; line-height: 1.7; }
        .countdown { font-size: .85rem; font-weight: 600; color: var(--text-muted); font-variant-numeric: tabular-nums; }
        .players { width: 100%; border-collapse: collapse; }
        th, td { padding: .4rem .25rem; border-bottom: 1px solid var(--border); text-align: left; }
        th { color: var(--text-muted); font-size: .7rem; }
        th:not(:first-child), td:not(:first-child) { text-align: right; }
        .inactive { color: var(--text-muted); }
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
                ? html`<table class="players">
                    <thead><tr><th>Player</th><th>Points</th><th>Wins</th><th>Games</th></tr></thead>
                    <tbody>${this.standings.map(row => {
                        const record = this.players.find(player => player.playerId === row.playerId);
                        const online = isBotId(row.playerId)
                            ? true
                            : this.onlineUsers.some(user => user.userId === row.playerId);
                        return html`<tr class=${record?.active === false ? 'inactive' : ''}>
                            <td>
                                ${online ? html`<span class="online-dot" aria-label="Online" title="Online"></span>` : ''}
                                ${row.name}${record?.active === false ? ' (left)' : ''}
                            </td>
                            <td>${row.points}</td>
                            <td>${row.wins}</td>
                            <td>${row.games}</td>
                        </tr>`;
                    })}</tbody>
                </table>`
                : html`<div class="empty">No players have joined yet.</div>`}
        `;
    }
}

function isBotId(playerId) {
    return ['bot-thefarjaw', 'bot-clawbreak'].includes(playerId);
}

customElements.define('arena-leaderboard', ArenaLeaderboard);
