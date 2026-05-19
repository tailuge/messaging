import { LitElement, html, css } from 'lit';
import { flag } from './utils.js';

const STATS_URL = 'https://billiards-network.onrender.com/api/stats';

class StatsPanel extends LitElement {
    static styles = css`
        :host { display: block; font-family: inherit; }
        .loading { color: var(--text-muted, #757575); font-size: 0.85rem; }
        .uptime { font-size: 0.8rem; color: var(--text-muted, #757575); margin-bottom: 0.5rem; }
        ul { list-style: none; margin: 0; padding: 0; }
        li { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; padding: 0.15rem 0; }
        .count { color: var(--text-muted, #757575); font-size: 0.8rem; }
    `;

    connectedCallback() {
        super.connectedCallback();
        fetch(STATS_URL, { mode: 'cors' })
            .then(r => r.json())
            .then(d => { this._data = d; this.requestUpdate(); })
            .catch(() => { this._err = true; this.requestUpdate(); });
    }

    _formatUptime(u) {
        if (!u) return '';
        const parts = [];
        if (u.days) parts.push(`${u.days}d`);
        if (u.hours) parts.push(`${u.hours}h`);
        if (u.mins !== undefined) parts.push(`${u.mins}m`);
        return parts.join(' ');
    }

    _countryCounts(ip_cache) {
        const counts = {};
        for (const val of Object.values(ip_cache)) {
            const code = val.split('|')[0] || 'XX';
            counts[code] = (counts[code] ?? 0) + 1;
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }

    render() {
        if (this._err) return html`<span class="loading">Could not load stats.</span>`;
        if (!this._data) return html`<span class="loading">Loading…</span>`;
        const { uptime, ip_cache } = this._data;
        const countries = this._countryCounts(ip_cache ?? {});
        return html`
            ${uptime ? html`<div class="uptime">⏱ ${this._formatUptime(uptime)}</div>` : ''}
            <ul>
                ${countries.map(([code, n]) => html`
                    <li>${flag(code).emoji} <span>${code}</span> <span class="count">${n}</span></li>
                `)}
            </ul>`;
    }
}

customElements.define('stats-panel', StatsPanel);
