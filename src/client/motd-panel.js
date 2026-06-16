import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

const MESSAGES = [
    'This game is free to play and open source on <a href="https://github.com/tailuge/billiards" target="_blank">GitHub</a>',
    'Choose graphics settings in options menu.',
    'Masse trick shot replay: <a href="https://scoreboard-tailuge.vercel.app/api/replay/534?lod=4">here</a>.',
    'You can change your name by clicking on the user badge.',
    'You can flip aim direction in options menu.',
    'Draw lines for three cushion and positional play instruction with mouse right-click.',
    'Do you know <a href="https://www.youtube.com/watch?v=ArNBvY1uEUo" target="_blank">Three Cushion</a> billiards rules? The ultimate game.',
    'Thank you for playing snooker, pool and three cushion at <a href="https://github.com/tailuge/billiards" target="_blank">tailuge/billiards</a>.',
    'Snooker century when? Congratulations on highest snooker break of <a href="https://scoreboard-tailuge.vercel.app/api/rank/8b5fabed?ruletype=snooker&lod=4">66</a>.'    
];

class MotdPanel extends LitElement {
    static styles = css`
        :host {
            display: block;
            text-align: center;
            font-size: 0.75rem;
            color: var(--text-muted);
        }
        a {
            color: var(--link);
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    `;

    constructor() {
        super();
        this.msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    }

    render() {
        return html`${unsafeHTML(this.msg)}`;
    }
}

customElements.define('motd-panel', MotdPanel);
