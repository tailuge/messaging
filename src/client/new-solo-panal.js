import { css, html, LitElement } from "lit";

const GAMES = [
  { label: "Nine Ball", img: "assets/nineball.png" },
  { label: "Eight Ball", img: "assets/eightball.png" },
  { label: "Sagu", img: "assets/sagu.png" },
  { label: "Three-Cushion", img: "assets/threecushion.png" },
  { label: "Drill", img: "assets/drill.png" },
];

const SETTINGS = {
  raceTo: ["7", "15", "25", "40"],
  aiming: ["Off", "On"],
  tableSize: ["5 ft", "10 ft"],
  ruleSet: ["Traditional", "Proximity"],
  timeControl: ["15s", "30s", "60s", "120s"],
};

const CONFIG_PANEL_STYLES = css`
  :host {
    display: block;
    width: 250px;
    color: #f7f7f2;
    font-family: "Exo", sans-serif;
    font-weight: 200;
  }

  button {
    box-sizing: border-box;
    margin: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .navigation {
    display: grid;
    grid-template-columns: repeat(5, 48px);
    justify-content: space-between;
    width: 250px;
  }

  .game-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    width: 48px;
  }

  .game-button {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    padding: 5px;
    background: #20231f;
    border: 1px solid #454a40;
    border-radius: 5px;
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  }

  .game-button:hover {
    background: #30352d;
    border-color: #bacd73;
    transform: translateY(-1px);
  }

  .game-button.selected {
    background: #d1e879;
    border-color: #f2ffc0;
    box-shadow: 0 0 0 1px #8ea94b;
  }

  .game-button:focus-visible,
  .choice:focus-visible,
  .play:focus-visible {
    outline: 2px solid #d1e879;
    outline-offset: 2px;
  }

  .game-button img {
    display: block;
    width: 36px;
    height: 36px;
    object-fit: contain;
  }

  .game-toggle {
    display: grid;
    place-items: center;
    width: 48px;
    height: 16px;
    padding: 0;
    background: #20231f;
    border: 1px solid #454a40;
    border-radius: 3px;
  }

  .game-toggle::before {
    content: "";
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid #d8ddd1;
  }

  .game-toggle:hover {
    background: #30352d;
    border-color: #bacd73;
  }

  .game-toggle:focus-visible {
    outline: 2px solid #d1e879;
    outline-offset: 2px;
  }

  .config {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 250px;
    margin-top: 4px;
    padding: 5px;
    background: #171a16;
    border: 1px solid #454a40;
    border-radius: 5px;
    box-sizing: border-box;
  }

  .config-row {
    display: grid;
    grid-template-columns: 67px minmax(0, 1fr);
    align-items: center;
    gap: 4px;
    min-height: 24px;
  }

  .label {
    color: #ffffff;
    font-size: 0.59rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    line-height: 1;
    text-transform: uppercase;
  }

  .choices {
    display: flex;
    min-width: 0;
    gap: 2px;
  }

  .choice {
    flex: 1 1 0;
    min-width: 0;
    height: 22px;
    padding: 0 2px;
    overflow: hidden;
    color: #d8ddd1;
    background: #292d27;
    border: 1px solid #4a5044;
    border-radius: 3px;
    font-size: 0.62rem;
    line-height: 20px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .choice:hover {
    background: #3a4135;
    border-color: #b4c86d;
  }

  .choice.selected {
    color: #12150f;
    background: #d1e879;
    border-color: #d1e879;
    font-weight: 600;
  }

  .play {
    width: 100%;
    height: 29px;
    margin-top: 2px;
    color: #10130d;
    background: #d1e879;
    border: 1px solid #efffb1;
    border-radius: 3px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.16em;
  }

  .play:hover {
    background: #e1f68e;
  }

  .play:active {
    background: #b8d05f;
  }
`;

class NewSoloPanal extends LitElement {
  static styles = CONFIG_PANEL_STYLES;

  #selectedGame = 0;
  #settings = {
    raceTo: "15",
    aiming: "Off",
    tableSize: "10 ft",
    ruleSet: "Traditional",
    timeControl: "30s",
  };

  selectGame(index) {
    this.#selectedGame = index;
    this.requestUpdate();
  }

  selectSetting(name, value) {
    this.#settings = { ...this.#settings, [name]: value };
    this.requestUpdate();
  }

  play() {
    this.dispatchEvent(
      new CustomEvent("play-game", {
        bubbles: true,
        composed: true,
        detail: {
          game: GAMES[this.#selectedGame],
          settings: { ...this.#settings },
        },
      }),
    );
  }

  renderChoiceRow(label, name) {
    return html`
      <div class="config-row">
        <span class="label">${label}</span>
        <div class="choices">
          ${SETTINGS[name].map(
            (value) => html`
              <button
                class="choice ${this.#settings[name] === value ? "selected" : ""}"
                type="button"
                aria-pressed=${this.#settings[name] === value}
                @click=${() => this.selectSetting(name, value)}
              >
                ${value}
              </button>
            `,
          )}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <nav class="navigation" aria-label="Game type">
        ${GAMES.map(
          (game, index) =>          html`
            <div class="game-option">
              <button
                class="game-button ${this.#selectedGame === index ? "selected" : ""}"
                type="button"
                aria-label=${game.label}
                aria-pressed=${this.#selectedGame === index}
                title=${game.label}
                @click=${() => this.selectGame(index)}
              >
                <img src=${game.img} alt="" />
              </button>
              <button
                class="game-toggle"
                type="button"
                aria-label=${`Open ${game.label} options`}
                title="Open options"
              ></button>
            </div>
          `,
        )}
      </nav>

      <section class="config" aria-label="Game configuration">
        ${this.renderChoiceRow("Race To", "raceTo")}
        ${this.renderChoiceRow("Aiming Assist", "aiming")}
        ${this.renderChoiceRow("Table Size", "tableSize")}
        ${this.renderChoiceRow("Rule Set", "ruleSet")}
        ${this.renderChoiceRow("Time Control", "timeControl")}
        <button class="play" type="button" @click=${() => this.play()}>PLAY</button>
      </section>
    `;
  }
}

customElements.define("new-solo-panal", NewSoloPanal);
