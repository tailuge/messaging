import { LitElement, html, css } from 'lit';
import { THEME_VARS, SHARED_STYLES } from './styles.js';
import './arena-chat.js';
import './tournament/arena-view.js';

export class ArenaPanel extends LitElement {
    static properties = {
        arenaId: { type: String },
        lobby: { type: Object },
        theme: { type: String, reflect: true },
    };

    static styles = [THEME_VARS, SHARED_STYLES, css`
        :host { display: block; }
        .panel-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: .25rem;
            margin-bottom: .25rem;
        }
        .bar-left {
            display: flex;
            align-items: center;
            gap: .35rem;
        }
        .panel-heading {
            margin: 0;
            font-size: .8rem;
            font-weight: 600;
        }
        .manage-link {
            font-size: .75rem;
            color: var(--text-muted);
            text-decoration: none;
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
        }
        .btn-close:hover {
            background: var(--surface-hover, rgba(255, 255, 255, 0.08));
        }
        .content {
            display: flex;
            flex-direction: column;
            gap: .25rem;
        }
    `];

    constructor() {
        super();
        this.arenaId = '';
        this.lobby = null;
        this.theme = '';
    }

    _close() {
        this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    }

    render() {
        return html`
            <div class="panel-bar">
                <div class="bar-left">
                    <h2 class="panel-heading">Arena</h2>
                    <a class="manage-link" href="arena.html">Manage Arenas ↗</a>
                </div>
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
