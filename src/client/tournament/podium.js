import { LitElement, html, css } from 'lit';
import { THEME_VARS, SHARED_STYLES } from '../styles.js';

class ArenaPodium extends LitElement {
    static properties = {
        standings: { attribute: false },
    };

    static styles = [THEME_VARS, SHARED_STYLES, css`
        :host { display: block; }
        .podium { display: flex; align-items: flex-end; justify-content: center; gap: .35rem; height: 148px; padding: .25rem .5rem 0; }
        .step { min-width: 0; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
        .player { width: 100%; min-width: 0; text-align: center; margin-bottom: .3rem; }
        .medal { font-size: 1.25rem; line-height: 1; }
        .name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .72rem; font-weight: 600; }
        .score { display: block; color: var(--text-muted); font-size: .65rem; white-space: nowrap; }
        .block { width: 100%; border-radius: 5px 5px 0 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1rem; font-weight: 800; text-shadow: 0 1px 2px rgba(0, 0, 0, .25); box-shadow: inset 0 2px 4px rgba(255, 255, 255, .35); }
        .gold .block { height: 76px; background: linear-gradient(180deg, #ffe066, #ffb703); }
        .silver .block { height: 54px; background: linear-gradient(180deg, #e2e8f0, #94a3b8); }
        .bronze .block { height: 38px; background: linear-gradient(180deg, #fde68a, #cd7f32); }
        .empty { color: var(--text-muted); font-size: .75rem; text-align: center; padding: 1rem; }
    `];

    constructor() {
        super();
        this.standings = [];
    }

    render() {
        const places = [this.standings[1], this.standings[0], this.standings[2]];
        const classes = ['silver', 'gold', 'bronze'];
        const medals = ['🥈', '🥇', '🥉'];

        if (!this.standings.length) return html`<div class="empty">No final standings available.</div>`;

        return html`<div class="podium" aria-label="Top three final standings">
            ${places.map((player, index) => player ? html`
                <div class="step ${classes[index]}">
                    <div class="player">
                        <div class="medal" aria-hidden="true">${medals[index]}</div>
                        <span class="name" title=${player.name}>${player.name}</span>
                        <span class="score">${player.points} pts</span>
                    </div>
                    <div class="block" aria-label="Place ${index === 0 ? 2 : index === 1 ? 1 : 3}">${index === 0 ? 2 : index === 1 ? 1 : 3}</div>
                </div>` : html`<div class="step ${classes[index]}" aria-hidden="true"><div class="block"></div></div>`)}
        </div>`;
    }
}

customElements.define('arena-podium', ArenaPodium);
