import { LitElement, html, css } from 'lit';
import { fetchWinners } from './trophy.js';

// The cabinet lives in the narrow lobby column, so cap the trophies it draws
// (a runaway winner cannot stretch the panel).
const MAX_TROPHIES = 20;
const DEFAULT_HOLDERS = 3;

// Trophies start at the same 0.95rem used by trophy.js and step down 1px per
// rank (floored so deep ranks stay legible). The colour fade is deliberately
// gentle: a lower rank loses a little size and saturation, never its gold.
const BASE_FONT_REM = 0.95;
const MAX_SIZE_STEPS = 6;
const FADE_PER_RANK = 14; // grayscale percent added per rank
const MAX_FADE = 70;      // cap, so the last trophies never wash out

// Rank lineup borrowed from the trophy display prototype: even ranks fan out to
// the left (largest first), rank 1 sits in the middle and odd ranks fan out to
// the right. Sizes step down and the trophies desaturate as the rank grows.
const trophyLayout = total => {
    const count = Math.max(1, Math.min(MAX_TROPHIES, Math.floor(total)));
    const evens = [];
    for (let rank = count % 2 === 0 ? count : count - 1; rank >= 2; rank -= 2) evens.push(rank);
    const odds = [];
    for (let rank = 3; rank <= count; rank += 2) odds.push(rank);
    return [...evens, 1, ...odds].map(rank => {
        const sizeSteps = Math.min(rank - 1, MAX_SIZE_STEPS);
        const grayscale = Math.min((rank - 1) * FADE_PER_RANK, MAX_FADE);
        return {
            rank,
            size: `calc(${BASE_FONT_REM}rem - ${sizeSteps}px)`,
            zIndex: count - rank + 1,
            filter: `grayscale(${grayscale}%)`,
            opacity: Number((1 - (grayscale / MAX_FADE) * 0.25).toFixed(2)),
        };
    });
};

// Aggregate the winners list ([{userName, arenaId}]) into a leaderboard of the
// most decorated names, highest first. Each holder keeps the winning arenaIds
// (newest first) so every trophy can link back to the arena it was won in.
const topHolders = winners => {
    const byName = new Map();
    for (const winner of winners) {
        const name = String(winner.userName).trim();
        if (!name) continue;
        const holder = byName.get(name) || { name, count: 0, arenaIds: [] };
        holder.count += 1;
        if (winner.arenaId) holder.arenaIds.push(String(winner.arenaId));
        byName.set(name, holder);
    }
    return [...byName.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
};

/**
 * <trophy-cabinet> — the most decorated arena trophy holders, one per row.
 * Reuses the shared winners fetch from trophy.js, so it costs no extra network
 * request. Hosts set `limit` to control how many holders are listed (the lobby
 * widens the cabinet from 3 to 8 rows while an arena is open).
 */
class TrophyCabinet extends LitElement {
    static properties = {
        limit: { type: Number },
        _leaderboard: { state: true },
        _loaded: { state: true },
    };

    static styles = css`
        :host { display: block; font-family: 'Exo', sans-serif; font-weight: 200; }
        .panel-title { font-weight: bold; margin-bottom: 0.25rem; font-size: 0.8rem; color: var(--text-dim); text-align: center; }
        .cabinet-list { display: flex; flex-direction: column; gap: 0.1rem; }
        .cabinet-row { display: flex; align-items: center; gap: 0.3rem; padding: 0 0.2rem; border: 1px solid var(--border); border-radius: 4px; min-height: 22px; }
        .cabinet-name { flex: 0 1 auto; max-width: 45%; font-size: 0.75rem; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cabinet-trophies { display: flex; align-items: center; justify-content: flex-end; flex: 1 1 auto; min-width: 0; overflow: hidden; }
        .trophy { line-height: 1; user-select: none; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.35); transition: transform 0.15s ease, filter 0.15s ease, opacity 0.15s ease; }
        a.trophy { text-decoration: none; cursor: pointer; }
        .trophy + .trophy { margin-left: -0.35em; }
        .trophy:hover { transform: translateY(-2px) scale(1.25); filter: none !important; opacity: 1 !important; z-index: 100 !important; }
        .empty { color: var(--text-muted); text-align: center; padding: 0.5rem 0; font-size: 0.75rem; }
    `;

    constructor() {
        super();
        this.limit = DEFAULT_HOLDERS;
        this._leaderboard = [];
        this._loaded = false;
    }

    async connectedCallback() {
        super.connectedCallback();
        const winners = await fetchWinners();
        // A null result means the shared fetch failed; leave the panel blank
        // rather than claiming there are no trophies.
        if (winners) {
            this._leaderboard = topHolders(winners);
            this._loaded = true;
        }
    }

    render() {
        const holders = this._leaderboard.slice(0, Math.max(1, this.limit));
        return html`
            <div class="panel-title">Trophy Cabinet</div>
            ${holders.length
                ? html`<div class="cabinet-list" aria-label="Top trophy holders">
                    ${holders.map(holder => html`
                        <div class="cabinet-row" title="${holder.name}: ${holder.count} arena ${holder.count === 1 ? 'win' : 'wins'}">
                            <span class="cabinet-name">${holder.name}</span>
                            <span class="cabinet-trophies">
                                ${trophyLayout(holder.count).map(t => {
                                    const arenaId = holder.arenaIds[t.rank - 1];
                                    const style = `font-size:${t.size};z-index:${t.zIndex};filter:${t.filter};opacity:${t.opacity}`;
                                    return arenaId
                                        ? html`<a
                                            class="trophy"
                                            style="${style}"
                                            href="lobby?tournamentId=${encodeURIComponent(arenaId)}"
                                            title="Arena winner (${arenaId})"
                                            aria-label="Arena trophy - view arena ${arenaId}"
                                        >🏆</a>`
                                        : html`<span class="trophy" style="${style}">🏆</span>`;
                                })}
                            </span>
                        </div>`)}
                </div>`
                : this._loaded ? html`<div class="empty">No trophies yet</div>` : ''}
        `;
    }
}

customElements.define('trophy-cabinet', TrophyCabinet);
