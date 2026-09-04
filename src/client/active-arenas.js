import { LitElement, html, css } from 'lit';
import { arenaGameIcon } from './utils.js';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? ''
    : 'https://billiards-network.onrender.com';

// Poll interval keeps the list fresh (arenas appear when created, drop off when
// they end) without a manual refresh button.
const REFRESH_MS = 30_000;

// Seed only when there is at least this much time left to the next UTC
// :00/:30 boundary; below it the sprint would be noise (or born finished) and
// the poll right after the boundary creates the normal 30-minute slot instead.
const MIN_SEED_MINUTES = 5;
const BOUNDARY_MS = 30 * 60 * 1000; // UTC slots: on the hour and half past

// Next UTC :00/:30 boundary strictly after `now` (epoch ms). Epoch-aligned so
// boundaries are exact multiples of 30 minutes.
const nextUtcBoundary = (now) => (Math.floor(now / BOUNDARY_MS) + 1) * BOUNDARY_MS;

const HOURLY_PRESETS = [
    { name: 'Three Cushion Mini Hourly Arena', ruleType: 'threecushion', options: { raceTo: '7', tableSize: '5' } },
    { name: 'Nine Ball Mini Hourly Arena', ruleType: 'nineball', options: { tableSize: '6', freeaim: 'true' } },
    { name: 'Eight Ball Mini Hourly Arena', ruleType: 'eightball', options: { tableSize: '6', freeaim: 'true' } },
    { name: 'Nine Ball Hourly Arena', ruleType: 'nineball', options: {} },
    { name: 'Eight Ball Hourly Arena', ruleType: 'eightball', options: {} },
    { name: 'Snooker Mini Hourly Arena', ruleType: 'snooker', options: { tableSize: '6', reds: '3', freeaim: 'true' } },        
];

// Row styles shared by the Active Arenas component and the arena page's
// Completed Arenas list, so both lists render identically.
export const ARENA_ROW_STYLES = css`
    .arena-list { display: flex; flex-direction: column; gap: .2rem; }
    .arena-item { display: flex; align-items: center; gap: .35rem; padding: .25rem; border: 1px solid var(--border); border-radius: 4px; text-decoration: none; color: var(--text); }
    .arena-item.completed { opacity: .8; padding-top: .25rem; padding-bottom: .25rem; }
    .arena-item-main { min-width: 0; flex: 1; }
    .arena-item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .arena-item-name { font-weight: 400; }
    .arena-item-meta { color: var(--text-muted); font-size: .72rem; font-weight: 400; white-space: nowrap; }
    .arena-join { cursor: pointer; border: 1px solid #0d6efd; border-radius: 4px; background: #0d6efd; color: #fff; font: inherit; font-size: .75rem; padding: .15rem .4rem; flex-shrink: 0; }
    .arena-join:hover { background-color: #0b5ed7; border-color: #0a58ca; }
    .arena-join:active { background-color: #0a58ca; }
    .arena-join:focus-visible { outline: 2px solid #007bff; outline-offset: 1px; }
    .empty { color: var(--text-muted); text-align: center; padding: .5rem 0; }
`;

export const arenaRow = (arena, completed = false, onSelect = null, showAction = true) => {
    const href = `lobby.html?tournamentId=${encodeURIComponent(arena.id)}`;
    const handleJoin = (e) => {
        if (onSelect) {
            e.preventDefault();
            e.stopPropagation();
            onSelect(arena.id);
        } else if (e.currentTarget instanceof HTMLButtonElement) {
            e.preventDefault();
            window.location.href = e.currentTarget.closest('a').href;
        }
    };
    return html`<a class="arena-item ${completed ? 'completed' : ''}" href=${href} @click=${handleJoin}>
        <div class="arena-item-main"><div class="arena-item-title"><span class="arena-item-name">${arenaGameIcon(arena.ruleType, arena.options)}${arena.creatorName ? html` · ${arena.creatorName}` : ''}</span><span class="arena-item-meta"> 👥\uFE0E ${arena.players.length} · ⏰\uFE0E ${completed ? 'ended' : 'ends'} ${new Date(arena.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div></div>
        ${completed || !showAction ? '' : html`<button class="arena-join btn-challenge" type="button" @click=${handleJoin}>Open</button>`}
    </a>`;
};

class ActiveArenas extends LitElement {
    static properties = {
        // Optional panel heading. The arena page passes "Active Arenas"; the
        // lobby strip passes nothing so no title is rendered.
        heading: { type: String },
        _arenas: { state: true },
        _error: { state: true },
        selectable: { type: Boolean },
    };

    static styles = [ARENA_ROW_STYLES, css`
        :host { display: block; }
        h2.title { margin: 0 0 .25rem; font-size: .8rem; font-weight: 600; }
        .error { color: var(--text-muted); font-size: .75rem; text-align: center; padding: .5rem 0; }
    `];

    constructor() {
        super();
        this.heading = '';
        this._arenas = [];
        this._error = '';
        this.selectable = false;
        this._timer = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._load();
        this._timer = setInterval(() => this._load(), REFRESH_MS);
    }

    disconnectedCallback() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        super.disconnectedCallback();
    }

    async load() {
        await this._load();
    }

    async _load() {
        try {
            let response = await fetch(`${API_BASE}/api/arena`);
            let data = await response.json();
            if (!response.ok) throw new Error(data.error || `Unable to load Arenas (${response.status})`);

            // Hourly seeding: whenever no arena is currently active, create the
            // preset hourly arena ending exactly on the next UTC :00/:30 boundary.
            // Mid-slot seeds run shorter than 30 minutes to reach that boundary;
            // user-created arenas are never touched.
            const now = Date.now();
            const hasActiveArena = (data.arenas || []).some(arena =>
                arena.endTime > now && arena.status !== 'finished');

            if (!hasActiveArena) {
                const endTime = nextUtcBoundary(now);
                const minutesToBoundary = Math.floor((endTime - now) / 60000);
                if (minutesToBoundary >= MIN_SEED_MINUTES) {
                    const boundary = new Date(endTime);
                    const hour = String(boundary.getUTCHours()).padStart(2, '0');
                    const minute = String(boundary.getUTCMinutes()).padStart(2, '0');
                    const slot = `${boundary.getUTCFullYear()}${String(boundary.getUTCMonth() + 1).padStart(2, '0')}${String(boundary.getUTCDate()).padStart(2, '0')}-${hour}${minute}`;
                    // Alternate the preset on the :00 and :30 boundaries: each
                    // half-hour slot of the day maps to its own index, so a full
                    // preset rotation spans 3 hours instead of repeating the same
                    // preset twice within one hour.
                    const halfHourIndex = boundary.getUTCMinutes() >= 30 ? 1 : 0;
                    const slotIndex = (2 * boundary.getUTCHours() + halfHourIndex) % HOURLY_PRESETS.length;
                    const hourlyPreset = HOURLY_PRESETS[slotIndex];
                    await fetch(`${API_BASE}/api/arena`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: `arena-hourly-${slot}`,
                            creatorId: 'hourly-arena',
                            creatorName: hourlyPreset.name,
                            ruleType: hourlyPreset.ruleType,
                            options: hourlyPreset.options,
                            endTime,
                        }),
                    });
                    response = await fetch(`${API_BASE}/api/arena`);
                    data = await response.json();
                    if (!response.ok) throw new Error(data.error || `Unable to reload Arenas (${response.status})`);
                }
            }

            this._arenas = (data.arenas || []).sort((a, b) => b.createdAt - a.createdAt);
            this._error = '';
            this.dispatchEvent(new CustomEvent('arenas-loaded', {
                detail: { arenas: this._arenas },
                bubbles: true,
                composed: true,
            }));
        } catch (error) {
            this._error = error.message || 'Unable to load Arenas.';
        }
    }

    get _activeArenas() {
        const now = Date.now();
        return this._arenas.filter(arena => arena.endTime > now && arena.status !== 'finished');
    }

    _onSelect(arenaId) {
        this.dispatchEvent(new CustomEvent('arena-select', {
            detail: { arenaId },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        const active = this._activeArenas;
        return html`
            ${this.heading ? html`<h2 class="title">${this.heading}</h2>` : ''}
            ${this._error && !active.length
                ? html`<div class="error">Could not load arenas.</div>`
                : active.length
                    ? html`<div class="arena-list" aria-label="Active Arenas">${active.map(arena => arenaRow(arena, false, this.selectable ? id => this._onSelect(id) : null))}</div>`
                    : html`<div class="empty">No active Arenas.</div>`}
        `;
    }
}

customElements.define('active-arenas', ActiveArenas);
