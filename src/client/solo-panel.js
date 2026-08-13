import { html } from "lit";
import { userStore, StoreElement } from "./user-store.js";
import { soloUrl } from "./utils.js";
import { SOLO_PANEL_STYLES, BADGE_STYLES } from "./styles.js";

const GAMES = [
  { label: "Nine Ball", img: "assets/nineball.png", ruletype: "nineball" },
  {
    label: "Snooker 6r",
    img: "assets/snooker.png",
    ruletype: "snooker",
    options: { reds: "6", tableSize: "12" },
  },
  {
    label: "Snooker 10r",
    img: "assets/snooker.png",
    ruletype: "snooker",
    options: { reds: "10", tableSize: "12" },
  },    
  {
    label: "3-Cushion 5ft",
    img: "assets/baby.png",
    ruletype: "threecushion",
      options: { raceTo: "15", tableSize: "5" },
  },
  {
    label: "Snooker",
    img: "assets/snooker.png",
    ruletype: "snooker",
      options: { reds: "15", tableSize: "12" },
  },
  {
    label: "3-Cushion (7)",
    img: "assets/threecushion.png",
    ruletype: "threecushion",
    options: { raceTo: "7" },
  },
  {
    label: "Speedrun",
    img: "assets/speedrun.png",
    url: "speedrun/index.html",
  },
  {
    label: "3-Cushion analysis",
    img: "assets/drill.png",
    url: "https://velikodimov.github.io/billiards/dist/index.html?ruletype=threecushion&practice&drill",
    absolute: true,
  },
  {
    label: "Books",
    img: "assets/book.png",
    url: "book/index.html",
  },    
  {
    label: "3-Cushion (40)",
    img: "assets/threecushion.png",
    ruletype: "threecushion",
    options: { raceTo: "40" },
  },
  {
    label: "3-Cushion (15)",
    img: "assets/threecushion.png",
    ruletype: "threecushion",
    options: { raceTo: "15" },
  },
  {
    label: "Sagu (5)",
    img: "assets/sagu.png",
    ruletype: "sagu",
    options: { raceTo: "5" },
  },    
  {
    label: "Trickshot",
    img: "assets/practice.png",
    url: "https://billiards.tailuge.workers.dev/practice",
  },
  {
    label: "Research",
    img: "assets/research.png",
    url: "https://billiards.tailuge.workers.dev/diagrams/three",
  },
  { label: "Eight Ball", img: "assets/eightball.png", ruletype: "eightball" },
  {
    label: "Exam",
    img: "assets/cert.png",
    url: "exam/index.html",
    absolute: true,
  },
];

class SoloPanel extends StoreElement {
  static styles = [SOLO_PANEL_STYLES, BADGE_STYLES];
  #games = [...GAMES].sort(() => Math.random() - 0.5);
  render() {
    const { clientId, userName, lod, flip } = userStore;
    return html`<div class="grid">
      ${this.#games.map(
        (g) =>
          html` <a
            href=${soloUrl(g, clientId, userName, lod, flip, userStore.getCustom())}
            title=${g.label}
            aria-label="Play ${g.label}"
          >
            <span class="icon-wrap">
              <img src=${g.img} alt=${g.label} />
              ${g.options ? html`<span class="badge">${Object.values(g.options)[0]}</span>` : ""}
            </span>
          </a>`,
      )}
    </div>`;
  }
}

customElements.define("solo-panel", SoloPanel);
