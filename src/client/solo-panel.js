import { html } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { soloUrl } from './utils.js';
import { SOLO_PANEL_STYLES, BADGE_STYLES } from './styles.js';

const GAMES = [
    { label: "Nine Ball",     img: "assets/nineball.png",     ruletype: "nineball" },
    { label: "Snooker 6r",       img: "assets/snooker.png",      ruletype: "snooker",      options: { reds: "6" } },
    { label: "Snooker",    img: "assets/snooker.png",      ruletype: "snooker",      options: { reds: "15" } },
    { label: "3-Cushion (3)",     img: "assets/threecushion.png", ruletype: "threecushion", options: { raceTo: "3" }  },
    { label: "3-Cushion (7)",  img: "assets/threecushion.png", ruletype: "threecushion", options: { raceTo: "7" } },
    { label: "3-Cushion (15)",  img: "assets/threecushion.png", ruletype: "threecushion", options: { raceTo: "15" } },
    { label: "Trickshot",     img: "assets/practice.png",     url: "https://billiards.tailuge.workers.dev/practice" },
    { label: "Research",      img: "assets/research.png",     url: "https://billiards.tailuge.workers.dev/diagrams/three" },
    { label: "Eight Ball",    img: "assets/eightball.png",    ruletype: "eightball" },
];


class SoloPanel extends StoreElement {
    static styles = [SOLO_PANEL_STYLES, BADGE_STYLES];
    #games = [...GAMES].sort(() => Math.random() - 0.5);
    render() {
        const { clientId, userName, lod, flipX } = userStore;
        return html`<div class="grid">${this.#games.map(g => html`
            <button title=${g.label} aria-label="Play ${g.label}"
                @click=${() => { window.location.href = soloUrl(g, clientId, userName, lod, flipX); }}>
                <span class="icon-wrap">
                    <img src=${g.img} alt=${g.label} />
                    ${g.options ? html`<span class="badge">${Object.values(g.options)[0]}</span>` : ''}
                </span>
            </button>`)}
        </div>`;
    }
}

customElements.define('solo-panel', SoloPanel);
