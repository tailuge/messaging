import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

const MESSAGES = [
    'Check out the project on <a href="https://github.com/tailuge/billiards" target="_blank">GitHub</a>!',
    'Want to see more? Follow the <a href="https://youtu.be/bAeiRQcQuyg" target="_blank">video tutorial</a>.',
    'Play fair and have fun with other players!',
    'Did you know? You can change your name by clicking on the user badge.',
    'Try the <a href="https://scoreboard-tailuge.vercel.app" target="_blank">Scoreboard</a> to see top players.',
    'Billiards is open source and free to play.',
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
