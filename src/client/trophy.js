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
            .then(data => (Array.isArray(data?.winners) ? data.winners : []))
            .catch(() => {
                winnersPromise = null; // allow a retry on next connect
                return null;          // error: ignore, show nothing
            });
    }
    return winnersPromise;
};

/**
 * <trophy-item> — shows a 🏆 just left of the user badge when the current
 * user's name appears in the arena winners list (`/api/arena/winners`).
 *
 * Lazy: the fetch is deferred until the element is actually visible (via
 * IntersectionObserver, falling back to requestIdleCallback / a timeout), so
 * it never blocks initial layout. The emoji is absolutely positioned to the
 * left of the badge and takes no layout space, so it never shifts anything
 * when it appears. Network or payload errors are ignored silently.
 */
class TrophyItem extends StoreElement {
    // The element is a zero-width flex item: it reserves no space in the topbar
    // and the trophy is absolutely positioned leftwards over the free flex
    // space, so its appearance never shifts or reflows the badge.
    static styles = css`
        :host { position: relative; display: inline-flex; width: 0; min-width: 0; }
        .trophy {
            position: absolute; right: -0.1rem; top: 50%;
            transform: translateY(-50%);
            font-size: 0.95rem; line-height: 1;
            pointer-events: none; user-select: none;
        }
    `;

    constructor() {
        super();
        this._hasTrophy = false;
        this._trophyCheckedFor = null; // userName the current state was computed for
        this._winners = null;          // cached list once fetched
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

    // Re-evaluate trophy visibility for the current user name. Runs after the
    // fetch resolves and whenever the name changes (via StoreElement's
    // requestUpdate on userStore 'change').
    _recheck() {
        const name = (userStore.userName || '').trim();
        if (!name || !this._winners) { this._hasTrophy = false; return; }
        if (this._trophyCheckedFor === name) return;
        this._trophyCheckedFor = name;
        const hasTrophy = this._winners.some(w => typeof w === 'string' && w.trim() === name);
        if (hasTrophy !== this._hasTrophy) {
            this._hasTrophy = hasTrophy;
            this.requestUpdate();
        }
    }

    willUpdate() {
        this._recheck();
    }

    render() {
        if (isVercel || !this._hasTrophy) return html``;
        return html`<span class="trophy" title="Arena winner" aria-hidden="true">🏆</span>`;
    }
}

customElements.define('trophy-item', TrophyItem);
