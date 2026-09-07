import { LitElement, html, css } from 'lit';
import { THEME_VARS, SHARED_STYLES } from './styles.js';
import { arenaGameIcon, API_BASE } from './utils.js';
import './arena-chat.js';
import './tournament/arena-view.js';

export class ArenaPanel extends LitElement {
    static properties = {
        arenaId: { type: String },
        lobby: { type: Object },
        theme: { type: String, reflect: true },
        _arenaName: { state: true },
    };

    static styles = [THEME_VARS, SHARED_STYLES, css`
        :host { display: block; }
        .panel-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 0;
            margin-bottom: 2px;
            gap: .5rem;
        }
        .arena-title {
            display: flex;
            align-items: center;
            gap: .4rem;
            font-size: .85rem;
            font-weight: 600;
            color: var(--text);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
            min-width: 0;
        }
        .loading {
            color: var(--text-muted);
            font-size: .75rem;
        }
        .manage-link {
            font-size: .75rem;
            color: var(--text-muted);
            text-decoration: none;
            flex-shrink: 0;
        }
        .manage-link:hover {
            text-decoration: underline;
            color: var(--text);
        }
        .btn-close {
            background: transparent;
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text);
            cursor: pointer;
            padding: .15rem .4rem;
            font: inherit;
            font-size: .8rem;
            flex-shrink: 0;
        }
        .btn-close:hover {
            background: var(--surface-hover, rgba(255, 255, 255, 0.08));
        }
        .content {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
    `];

    constructor() {
        super();
        this.arenaId = '';
        this.lobby = null;
        this.theme = '';
        this._arenaName = '';
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadArenaName();
    }

    updated(changedProperties) {
        if (changedProperties.has('arenaId') && this.arenaId) {
            this._loadArenaName();
        }
    }

    async _loadArenaName() {
        if (!this.arenaId) return;
        try {
            const response = await fetch(`${API_BASE}/api/arena/${encodeURIComponent(this.arenaId)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.arena) {
                    const arena = data.arena;
                    const name = arena.creatorName ? html`${arenaGameIcon(arena.ruleType, arena.options)} ${arena.creatorName}` : 'Arena';
                    this._arenaName = name;
                }
            }
        } catch (e) {
            console.error('Failed to load arena name:', e);
        }
    }

    _close() {
        this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    }

    render() {
        return html`
            <div class="panel-bar">
                <div class="arena-title">${this._arenaName || html`<span class="loading">Loading...</span>`}</div>
                <a class="manage-link" href="arena.html">Manage Arenas ↗</a>
                <button type="button" class="btn-close" @click=${this._close} aria-label="Close Arena">✕ Close</button>
            </div>
            <div class="content">
                <arena-view .arenaId=${this.arenaId} .lobby=${this.lobby} .theme=${this.theme}></arena-view>
                <arena-chat .arenaId=${this.arenaId}></arena-chat>
            </div>
        `;
    }
}

customElements.define('arena-panel', ArenaPanel);
