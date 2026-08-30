import { LitElement, html, css } from 'lit';

const GAMES = [
  { key: 'eightball', label: 'Eight Ball', img: 'assets/eightball.png', variants: [{ id: 'std', label: 'Standard', options: {} }] },
  { key: 'nineball', label: 'Nine Ball', img: 'assets/nineball.png', variants: [{ id: 'std', label: 'Standard', options: {} }] },
  { key: 'snooker', label: 'Snooker', img: 'assets/snooker.png', variants: [{ id: '3', label: 'Reds 3', options: { reds: '3' } }, { id: '6', label: 'Reds 6', options: { reds: '6' } }, { id: '10', label: 'Reds 10', options: { reds: '10' } }, { id: '15', label: 'Reds 15', options: { reds: '15' } }] },
  { key: 'threecushion', label: 'Three Cushion', img: 'assets/threecushion.png', variants: [{ id: '7', label: 'Race to 7', options: { raceTo: '7' } }, { id: '15', label: 'Race to 15', options: { raceTo: '15' } }, { id: '25', label: 'Race to 25', options: { raceTo: '25' } }] },
  { key: 'sagu', label: 'Sagu', img: 'assets/sagu.png', variants: [{ id: '5', label: 'Race to 5', options: { raceTo: '5' } }, { id: '11', label: 'Race to 11', options: { raceTo: '11' } }] },
];

class Proto2Modal extends LitElement {
  static properties = { open: { type: Boolean, reflect: true }, _game: { state: true }, _variant: { state: true }, _size: { state: true }, _freeaim: { state: true } };
  static styles = css`
    :host { display: block; color: var(--text, #e0e0e0); font-family: 'Exo', sans-serif; }
    :host(:not([open])) { display: none; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { width: 320px; max-width: calc(100vw - 1.5rem); padding: .75rem; background: var(--surface, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 10px; display: flex; flex-direction: column; gap: .45rem; }
    h3 { margin: 0; text-align: center; font-size: .95rem; }
    button { font: inherit; cursor: pointer; border: 1px solid var(--btn-border, #555); border-radius: 4px; background: var(--btn-bg, #3a3a3a); color: inherit; min-height: 28px; }
    button:focus-visible { outline: 2px solid var(--accent, #0d6efd); outline-offset: 2px; }
    .tiles, .choices { display: flex; flex-wrap: wrap; gap: .3rem; justify-content: center; }
    .tile { width: 58px; padding: .2rem; font-size: .6rem; }
    .tile img { width: 42px; height: 42px; display: block; margin: auto; }
    .selected { border-color: var(--accent, #0d6efd); box-shadow: 0 0 0 1px var(--accent, #0d6efd); }
    .choice { padding: .15rem .45rem; font-size: .72rem; }
    .choice.selected { background: var(--accent, #0d6efd); color: #fff; }
    .label { width: 100%; text-align: center; color: var(--text-muted, #aaa); font-size: .7rem; }
    .action { width: 100%; background: var(--accent, #0d6efd); color: #fff; border: 0; font-size: 1rem; }
    .cancel { width: 100%; }
  `;
  constructor() { super(); this.open = false; this._game = 'threecushion'; this._variant = '15'; this._size = 'full'; this._freeaim = false; }
  show() { this.open = true; }
  hide() { this.open = false; }
  _selectGame(key) { this._game = key; const g = this._currentGame; this._variant = g.variants[0].id; }
  get _currentGame() { return GAMES.find(g => g.key === this._game) || GAMES[0]; }
  _confirm() {
    const g = this._currentGame;
    const v = g.variants.find(x => x.id === this._variant) || g.variants[0];
    const options = { ...v.options };
    if (this._size === 'mini') options.tableSize = ['snooker', 'nineball', 'eightball'].includes(g.key) ? '6' : '5';
    else if (g.key === 'snooker') options.tableSize = '12';
    if (this._freeaim) options.freeaim = 'true';
    this.dispatchEvent(new CustomEvent('confirm', { bubbles: true, composed: true, detail: { ruleType: g.key, options } }));
    this.hide();
  }
  render() {
    const g = this._currentGame;
    return html`<div class="backdrop" @click=${e => e.target === e.currentTarget && this.hide()}><div class="modal" role="dialog" aria-modal="true" aria-label="Select game parameters"><h3>Select game parameters</h3><div class="tiles" role="radiogroup" aria-label="Game type">${GAMES.map(x => html`<button class="tile ${x.key === this._game ? 'selected' : ''}" @click=${() => this._selectGame(x.key)}><img src=${x.img} alt="" /><span>${x.label}</span></button>`)}</div><div class="label">Rule</div><div class="choices">${g.variants.map(v => html`<button class="choice ${v.id === this._variant ? 'selected' : ''}" @click=${() => { this._variant = v.id; }}>${v.label}</button>`)}</div><div class="label">Table size</div><div class="choices"><button class="choice ${this._size === 'full' ? 'selected' : ''}" @click=${() => { this._size = 'full'; }}>Full</button><button class="choice ${this._size === 'mini' ? 'selected' : ''}" @click=${() => { this._size = 'mini'; }}>Mini</button></div><div class="label">Aim</div><div class="choices"><button class="choice ${!this._freeaim ? 'selected' : ''}" @click=${() => { this._freeaim = false; }}>Assist</button><button class="choice ${this._freeaim ? 'selected' : ''}" @click=${() => { this._freeaim = true; }}>Free</button></div><button class="action" @click=${this._confirm}>Use these parameters</button><button class="cancel" @click=${this.hide}>Cancel</button></div></div>`;
  }
}

customElements.define('proto2-modal', Proto2Modal);
