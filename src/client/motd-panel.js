import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

const MESSAGES = [
    'This game is free to play and open source on <a href="https://github.com/tailuge/billiards" target="_blank">GitHub</a>',
    'Choose graphics settings in options menu.',
    'Masse trick shot replay: <a href="https://scoreboard-tailuge.vercel.app/api/replay/534?lod=4">here</a>.',
    'You can change your name by clicking on the user badge.',
    'Do you know <a href="https://www.youtube.com/watch?v=ArNBvY1uEUo" target="_blank">Three Cushion</a> billiards rules?',
    'Thank you for playing.',
    'A great three cushion <a href="https://scoreboard-tailuge.vercel.app/api/rank/24872636?ruletype=threecushion&lod=4">break</a>'
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
