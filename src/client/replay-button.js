import { LitElement, html, css } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

class ReplayButton extends LitElement {
    static properties = {
        url: { type: String },
        color: { type: String }
    };

    static styles = css`
        :host {
            display: inline-block;
            vertical-align: middle;
            margin: 0;
            padding: 0;
            line-height: 0;
        }
        .pill {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 16px;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.15s ease-in-out;
            border: 1px solid rgba(255, 255, 255, 0.1);
            margin: 0;
            padding: 0;
        }
        .pill:hover {
            filter: brightness(1.25);
            transform: scale(1.08);
        }
        svg {
            width: 14px;
            height: 14px;
            fill: white;
        }
    `;

    render() {
        return html`
            <div
                class="pill"
                style=${styleMap({ backgroundColor: this.color || '#4a90d9' })}
                @click=${() => window.open(this.url, '_blank')}
                role="button">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
        `;
    }
}

customElements.define('replay-button', ReplayButton);
