import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { INFO_PANEL_STYLES } from './styles.js';

class InfoPanel extends LitElement {
    static styles = INFO_PANEL_STYLES;
    connectedCallback() {
        super.connectedCallback();
        fetch('https://scoreboard-tailuge.vercel.app/api/summary', { mode: 'cors' })
            .then(r => r.json())
            .then(d => { this._data = d; this.requestUpdate(); })
            .catch(() => { this._err = true; this.requestUpdate(); });
    }
    render() {
        if (this._err) return html`<span style="color:#999">Could not load scores.</span>`;
        if (!this._data) return html`<span style="color:#999">Loading…</span>`;
        const { hiscores, topPlayers, recentMatches } = this._data;
        return html`
            ${Object.keys(hiscores).map(game => html`
                <h2>${game}</h2>
                <h3>High Scores</h3>
                <table><tr><th>Name</th><th>Score</th></tr>
                    ${hiscores[game].map(s => html`<tr><td>${s.name}</td><td>${s.score}</td></tr>`)}
                </table>
                <h3>Top Players</h3>
                <table><tr><th>Name</th><th>Rating</th><th>W</th><th>L</th></tr>
                    ${topPlayers[game].map(p => html`<tr>
                        <td><a href="/player/${encodeURIComponent(p.name)}?ruleType=${game}">${p.name}</a></td>
                        <td>${Math.round(p.rating)}</td><td>${p.wins}</td><td>${p.losses}</td>
                    </tr>`)}
                </table>
            `)}
            <h2>Recent Matches</h2>
            <table><tr><th>Winner</th><th>Loser</th><th>Rule</th><th>Date</th></tr>
                ${recentMatches.map(m => html`<tr>
                    <td>${m.winner}</td><td>${m.loser||'-'}</td><td>${m.ruleType||'nineball'}</td>
                    <td>${new Date(m.timestamp).toLocaleString()}</td>
                </tr>`)}
            </table>`;
    }
}

customElements.define('info-panel', InfoPanel);
