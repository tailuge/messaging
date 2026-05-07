import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { SOLO_PANEL_STYLES } from './styles.js';

const GAMES = [
    { label: "Nine Ball",     img: "assets/nineball.png",     ruletype: "nineball" },
    { label: "Snooker 6r",       img: "assets/snooker.png",      ruletype: "snooker",      options: { reds: "6" } },
    { label: "Snooker",    img: "assets/snooker.png",      ruletype: "snooker",      options: { reds: "15" } },
    { label: "3-Cushion",     img: "assets/threecushion.png", ruletype: "threecushion", options: { raceTo: "3" }  },
    { label: "3-Cushion 11",  img: "assets/threecushion.png", ruletype: "threecushion", options: { raceTo: "11" } },
    { label: "3-Cushion 21",  img: "assets/threecushion.png", ruletype: "threecushion", options: { raceTo: "21" } },
    { label: "Trickshot",     img: "assets/practice.png",     url: "https://billiards.tailuge.workers.dev/practice" },
    { label: "Research",      img: "assets/practice.png",     url: "https://billiards.tailuge.workers.dev/diagrams/three" },
    { label: "Eight Ball",    img: "assets/eightball.png",    ruletype: "eightball" },
];

const soloUrl = (g, userId, userName) => {
    if (g.url) return g.url;
    let url = `https://billiards.tailuge.workers.dev/?ruletype=${g.ruletype}&clientId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}`;
    if (g.options) Object.entries(g.options).forEach(([k, v]) => url += `&${k}=${encodeURIComponent(v)}`);
    return url;
};

class SoloPanel extends LitElement {
    static properties = { userId: { type: String }, userName: { type: String } };
    static styles = SOLO_PANEL_STYLES;
    render() {
        return html`<div class="grid">${GAMES.map(g => html`
            <button title=${g.label} aria-label="Play ${g.label}"
                @click=${() => { window.location.href = soloUrl(g, this.userId, this.userName); }}>
                <span class="icon-wrap">
                    <img src=${g.img} alt=${g.label} />
                    ${g.options ? html`<span class="badge">${Object.values(g.options)[0]}</span>` : ''}
                </span>
            </button>`)}
        </div>`;
    }
}

customElements.define('solo-panel', SoloPanel);
