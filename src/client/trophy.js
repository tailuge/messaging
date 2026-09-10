import { html, css } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { API_BASE, isVercel } from './utils.js';

// Shared in-flight/settled fetch so multiple placements (lobby + arena page)
// trigger exactly one network request per page load. Reset on failure so a
// later reconnect can retry.
let winnersPromise = null;

const fetchWinners = () => {
    if (!winnersPromise) {
        winnersPromise = fetch(`${API_BASE}/api/arena/winners`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then(data => {
                // API now returns [{userName, arenaId}] objects
                if (!Array.isArray(data?.winners)) return [];
                return data.winners.filter(
                    w => w && typeof w === 'object' && typeof w.userName === 'string'
                );
            })
            .catch(() => {
                winnersPromise = null; // allow a retry on next connect
                return null;          // error: ignore, show nothing
            });
    }
    return winnersPromise;
};

/**
 * <trophy-item> — shows one 🏆 per win the current user has in the arena
 * winners list (`/api/arena/winners`). Multiple trophies stack to the left of
 * the badge, each is a link to `lobby?arenaId=<id>`.
 *
 * The element is a zero-width flex item so it reserves no space in the topbar.
 * Trophies are absolutely positioned leftwards over the free flex space so
 * their appearance never shifts or reflows the badge.
 * Network or payload errors are ignored silently.
 */
class TrophyItem extends StoreElement {
    static styles = css`
        :host { position: relative; display: inline-flex; width: 0; min-width: 0; }
        .trophy-stack {
            position: absolute;
            right: -0.1rem;
            top: 50%;
            transform: translateY(-50%);
            display: flex;
            flex-direction: row;
            gap: 0.05rem;
            /* stack grows leftward from the badge */
            flex-direction: row-reverse;
        }
        .trophy {
            font-size: 0.95rem; line-height: 1;
            user-select: none;
            text-decoration: none;
            cursor: pointer;
        }
        .trophy:hover { opacity: 0.8; }
    `;

    constructor() {
        super();
        this._trophies = [];           // [{userName, arenaId}] for current user
        this._trophyCheckedFor = null; // userName the current state was computed for
        this._winners = null;          // cached full list once fetched
        this._observer = null;
        this._idleTimer = null;
        this._started = false;
    }

    connectedCallback() {
        super.connectedCallback();
        if (!isVercel) this._startLazy();
    }

    disconnectedCallback() {
        this._observer?.disconnect();
        this._observer = null;
        if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
        super.disconnectedCallback();
    }

    // Defer the network work until the badge area is actually on screen. If
    // IntersectionObserver is unavailable (old browsers), fall back to idle
    // time, and to a plain timeout if even that is missing.
    _startLazy() {
        if (this._started) return;
        this._started = true;
        if (typeof IntersectionObserver !== 'undefined') {
            this._observer = new IntersectionObserver(entries => {
                if (entries.some(e => e.isIntersecting)) {
                    this._observer.disconnect();
                    this._observer = null;
                    this._load();
                }
            });
            this._observer.observe(this);
        } else {
            this._whenIdle(() => this._load());
        }
    }

    _whenIdle(fn) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => fn());
        } else {
            this._idleTimer = setTimeout(fn, 200);
        }
    }

    async _load() {
        this._winners = await fetchWinners();
        this._recheck();
    }

    // Re-evaluate trophies for the current user. Runs after the fetch resolves
    // and whenever the name changes (via StoreElement's requestUpdate on
    // userStore 'change').
    _recheck() {
        const name = (userStore.userName || '').trim();
        if (!name || !this._winners) {
            if (this._trophies.length) { this._trophies = []; this.requestUpdate(); }
            return;
        }
        if (this._trophyCheckedFor === name) return;
        this._trophyCheckedFor = name;
        const trophies = this._winners.filter(
            w => typeof w.userName === 'string' && w.userName.trim() === name
        );
        // Only re-render if something actually changed
        if (JSON.stringify(trophies) !== JSON.stringify(this._trophies)) {
            this._trophies = trophies;
            this.requestUpdate();
        }
    }

    willUpdate() {
        this._recheck();
    }

    render() {
        if (isVercel || !this._trophies.length) return html``;
        return html`
            <span class="trophy-stack">
                ${this._trophies.map(t => html`
                    <a
                        class="trophy"
                        href="lobby?arenaId=${encodeURIComponent(t.arenaId)}"
                        title="Arena winner (${t.arenaId})"
                        aria-label="Arena trophy - view arena ${t.arenaId}"
                    >🏆</a>
                `)}
            </span>
        `;
    }
}

customElements.define('trophy-item', TrophyItem);
