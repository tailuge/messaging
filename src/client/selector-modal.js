import { LitElement, html, css } from 'lit';
import { selectorStrings } from './selector-strings.js';

const GAMES = [
  {
    key: 'eightball',
    label: 'Eight Ball',
    img: 'assets/eightball.png',
    freeaim: true,
    variants: [
      { id: 'std', short: '', label: 'Eight Ball', options: {} },
    ],
  },
  {
    key: 'nineball',
    label: 'Nine Ball',
    img: 'assets/nineball.png',
    freeaim: true,
    variants: [
      { id: 'std', short: '', label: 'Nine Ball', options: {} },
    ],
  },
  {
    key: 'snooker',
    label: 'Snooker',
    img: 'assets/snooker.png',
    freeaim: true,
    variants: [
      { id: '3',  short: 'Reds 3',  label: 'Reds 3',  options: { reds: '3' } },
      { id: '6',  short: 'Reds 6',  label: 'Reds 6',  options: { reds: '6' } },
      { id: '10', short: 'Reds 10', label: 'Reds 10', options: { reds: '10' } },
      { id: '15', short: 'Reds 15', label: 'Reds 15', options: { reds: '15' } },
    ],
    sizes: true,
  },
  {
    key: 'threecushion',
    label: 'Three Cushion',
    img: 'assets/threecushion.png',
    freeaim: true,
    variants: [
      { id: '7',  short: 'Race to 7',  label: 'Race to 7',  options: { raceTo: '7' } },
      { id: '15', short: 'Race to 15', label: 'Race to 15', options: { raceTo: '15' } },
      { id: '25', short: 'Race to 25', label: 'Race to 25', options: { raceTo: '25' } },
    ],
    sizes: true,
  },
  {
    key: 'sagu',
    label: 'Sagu',
    img: 'assets/sagu.png',
    freeaim: true,
    variants: [
      { id: '5',  short: 'Race to 5',  label: 'Race to 5',  options: { raceTo: '5' } },
      { id: '11', short: 'Race to 11', label: 'Race to 11', options: { raceTo: '11' } },
    ],
    sizes: true,
  },
];

// Every game supports the same table-size choice; keep it independent
// from the rule-specific variant definitions.
for (const game of GAMES) game.sizes = true;

const ls = {
  get(k, d) { const v = localStorage.getItem(`selector_${k}`); return v === null ? d : v; },
  set(k, v) { localStorage.setItem(`selector_${k}`, v); },
};

const emit = (el, type, detail) =>
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

/**
 * Shared game/variant selection modal.
 *
 * Properties:
 * - mode: 'solo' | 'challenge' — challenge adds the opponent title and a
 *   message button in the footer.
 * - opponent: name shown in the challenge title.
 * - heading: dialog title as an i18n key (English string). Defaults to
 *   'Play Solo' / 'Challenge {name}' based on mode.
 * - actionLabel: confirm button text as an i18n key (English string).
 *   Defaults to 'PLAY'.
 *
 * Events:
 * - confirm: detail { mode, ruleType, options, opponent }
 * - cancel
 * - message (challenge mode only)
 */
class SelectorModal extends LitElement {
  static properties = {
    mode: { type: String },
    opponent: { type: String },
    open: { type: Boolean, reflect: true },
    heading: { type: String },
    actionLabel: { type: String },
    _sel: { state: true },
    _freeaim: { state: true },
    _vid: { state: true },
    _size: { state: true },
    _lang: { state: true },
  };

  #strings = selectorStrings;
  #unsubLang;

  static styles = css`
    :host {
      display: block;
      font-family: 'Exo', sans-serif;
      font-weight: 200;
      color: var(--text);
    }
    :host(:not([open])) { display: none; }
    button { font: inherit; cursor: pointer; border-radius: 4px; box-sizing: border-box; }
    button:focus-visible, input:focus-visible {
      outline: 2px solid var(--accent, #4a9eff);
      outline-offset: 2px;
    }

    .backdrop {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(1px);
      display: flex; align-items: center; justify-content: center;
      z-index: 100;
    }
    .modal {
      box-sizing: border-box;
      background: var(--modal-bg, #2a2a2a);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.65rem 0.75rem;
      width: 320px;
      max-width: calc(100vw - 1.5rem);
      display: flex; flex-direction: column; gap: 6px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    }
    h3 { margin: 0 0 2px; font-size: 0.9rem; text-align: center; font-weight: 600; }

    .tiles { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
    .tile {
      position: relative;
      width: 54px;
      padding: 3px 3px 2px;
      background: var(--btn-bg);
      border: 1px solid var(--btn-border);
      transition: border-color 0.12s, box-shadow 0.12s, transform 0.12s;
    }
    .tile:hover { background: var(--btn-hover); transform: translateY(-1px); }
    .tile.selected { border-color: var(--accent, #4a9eff); box-shadow: 0 0 0 1px var(--accent, #4a9eff); }
    .tile img { display: block; width: 46px; height: 46px; object-fit: contain; }
    .tile .tile-label {
      display: block;
      font-size: 0.53rem;
      text-align: center;
      color: var(--text-muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tile.selected .tile-label { color: var(--accent, #4a9eff); font-weight: 600; }
    .variants {
      display: flex; flex-wrap: wrap; gap: 3px;
      justify-content: center;
      min-height: 22px;
    }
    .choice-group {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
    }
    .choice-label {
      color: var(--text-muted);
      font-size: 0.66rem;
      margin-right: 2px;
    }
    .chip {
      min-height: 22px;
      padding: 1px 9px;
      font-size: 0.72rem;
      background: var(--btn-bg);
      border: 1px solid var(--btn-border);
      color: var(--text);
      transition: all 0.1s;
    }
    .chip:hover { background: var(--btn-hover); border-color: var(--accent, #4a9eff); }
    .chip.selected {
      background: var(--accent, #4a9eff);
      border-color: var(--accent, #4a9eff);
      color: #fff;
      font-weight: 600;
    }
    .chip.toggle { font-size: 0.66rem; }
    .aim-group {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
    }
    .chip.toggle.on { background: var(--accent, #4a9eff); border-color: var(--accent, #4a9eff); color: #fff; }

    .hint {
      text-align: center;
      font-size: 0.62rem;
      color: var(--text-muted);
      min-height: 1em;
    }
    .languages {
      text-align: center;
      font-size: 0.62rem;
    }
    .languages a {
      color: var(--text-muted);
      text-decoration: underline;
      cursor: pointer;
      margin: 0 0.2rem;
    }
    .languages a.active {
      color: var(--accent, #4a9eff);
      font-weight: 600;
      text-decoration: none;
    }

    .action {
      width: 100%;
      min-height: 42px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: var(--accent, #4a9eff);
      border: none;
      color: #fff;
      font-size: 1.25rem;
      font-weight: 200;
      letter-spacing: 0.12em;
      transition: background 0.12s, transform 0.05s;
    }
    .action:hover { background: var(--accent-hover, var(--accent, #4a9eff)); }
    .action:active { transform: scale(0.985); }

    .footer { display: flex; gap: 4px; }
    .footer .msg-btn {
      flex-shrink: 0;
      min-width: 30px;
      background: var(--btn-bg);
      border: 1px solid var(--btn-border);
    }
    .footer .msg-btn:hover { background: var(--btn-hover); }
    .footer .cancel {
      flex: 1;
      background: var(--modal-cancel, #3a3a3a);
      color: var(--text);
      border: 1px solid var(--btn-border);
    }
    .footer .cancel:hover { background: var(--btn-hover); }
  `;

  constructor() {
    super();
    this.mode = 'solo';
    this.opponent = '';
    this.open = false;
    this.heading = '';
    this.actionLabel = '';
    this._size = ls.get('size', 'full');
    this._sel = ls.get('game', 'threecushion');
    if (!GAMES.some(g => g.key === this._sel)) this._sel = 'threecushion';
    this.#loadGame(this._sel);
    this._lang = this.#strings.lang;
    // Re-render every modal instance when the language changes.
    this.#unsubLang = this.#strings.onChange((lang) => { this._lang = lang; });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#unsubLang?.();
  }

  #t(key, params) {
    return this.#strings.t(key, params);
  }

  get game() { return GAMES.find(g => g.key === this._sel); }
  get variant() {
    const g = this.game;
    return g.variants.find(v => v.id === this._vid[this._sel]) ?? g.variants[0];
  }

  #loadGame(key) {
    const g = GAMES.find(x => x.key === key);
    const stored = ls.get(`v_${key}`, null);
    this._vid = { ...this._vid, [key]: g.variants.some(v => v.id === stored) ? stored : g.variants[0].id };
    this._freeaim = ls.get('freeaim', 'false') === 'true' && Boolean(g.freeaim);
    this._size = ls.get(`size_${key}`, 'full');
  }

  show() { this.open = true; }
  hide() { this.open = false; }

  _selectGame(key) {
    if (this._sel !== key) {
      this._sel = key;
      ls.set('game', key);
      this.#loadGame(key);
    }
  }

  _selectVariant(id) {
    this._vid = { ...this._vid, [this._sel]: id };
    ls.set(`v_${this._sel}`, id);
  }

  _selectSize(size) {
    this._size = size;
    ls.set(`size_${this._sel}`, size);
    if (this._sel === 'snooker' && size === 'mini' && !['3', '6'].includes(this._vid[this._sel])) {
      this._selectVariant('3');
    }
  }

  _toggleFreeaim() {
    this._freeaim = !this._freeaim;
    ls.set('freeaim', String(this._freeaim));
  }

  _confirm() {
    const opts = { ...this.variant.options };
    if (this._size === 'mini') {
      opts.tableSize = ['snooker', 'nineball', 'eightball'].includes(this.game.key) ? '6' : '5';
    } else if (this.game.key === 'snooker') {
      opts.tableSize = '12';
    }
    if (this.game.freeaim && this._freeaim) opts.freeaim = 'true';
    emit(this, 'confirm', {
      mode: this.mode,
      ruleType: this.game.key,
      options: opts,
      opponent: this.opponent || undefined,
    });
    this.hide();
  }

  #tileLabel(x) {
    const label = this.#t(x.label);
    // Keep the compact English abbreviation only when there is no
    // translation (the ellipsis CSS handles longer translated labels).
    return label === 'Three Cushion' ? '3-Cush.' : label;
  }

  _actionLabel() {
    return this.#t(this.actionLabel || 'PLAY');
  }

  _title() {
    if (this.heading) return this.#t(this.heading);
    return this.mode === 'challenge'
      ? this.#t('Challenge {name}', { name: this.opponent })
      : this.#t('Play Solo');
  }

  render() {
    if (!this.open) return html``;
    const g = this.game;
    return html`
      <div class="backdrop" @click=${e => e.target === e.currentTarget && this.hide()}>
        <div class="modal" role="dialog" aria-modal="true" aria-label=${this.#t('Select game variant')}>
          <h3>${this._title()}</h3>

          <div class="tiles" role="radiogroup" aria-label=${this.#t('Game type')}>
            ${GAMES.map(x => html`
              <button
                class="tile ${x.key === this._sel ? 'selected' : ''}"
                role="radio"
                aria-checked=${x.key === this._sel}
                title=${this.#t(x.label)}
                @click=${() => this._selectGame(x.key)}
              >
                <img src=${x.img} alt="" />
                <span class="tile-label">${this.#tileLabel(x)}</span>
              </button>
            `)}
          </div>

          ${g.variants.length > 1 || g.freeaim || g.sizes ? html`
            <div class="variants" role="radiogroup" aria-label=${this.#t('{game} variant', { game: this.#t(g.label) })}>
              ${g.sizes ? html`
                <div class="choice-group">
                  <span class="choice-label">${this.#t('Table:')}</span>
                  <button
                    class="chip ${this._size === 'full' ? 'selected' : ''}"
                    role="radio"
                    aria-checked=${this._size === 'full'}
                    @click=${() => this._selectSize('full')}
                  >${this.#t('Full size')}</button>
                  <button
                    class="chip ${this._size === 'mini' ? 'selected' : ''}"
                    role="radio"
                    aria-checked=${this._size === 'mini'}
                    @click=${() => this._selectSize('mini')}
                  >${this.#t('Mini')}</button>
                </div>
              ` : ''}
              ${g.variants.length > 1 ? html`
                <div class="choice-group">
                  <span class="choice-label">${this.#t('Rule:')}</span>
                  ${g.variants
                    .filter(v => g.key !== 'snooker' || this._size !== 'mini' || ['3', '6'].includes(v.id))
                    .map(v => html`
                    <button
                      class="chip ${this.variant.id === v.id ? 'selected' : ''}"
                      role="radio"
                      aria-checked=${this.variant.id === v.id}
                      title=${v.label}
                      @click=${() => this._selectVariant(v.id)}
                    >${this.#t(v.short || v.label)}</button>
                  `)}
                </div>
              ` : ''}
              ${g.freeaim ? html`
                <div class="aim-group">
                  <span class="choice-label">${this.#t('Aim:')}</span>
                  <button
                    class="chip toggle ${this._freeaim ? 'on' : ''}"
                    aria-pressed=${this._freeaim}
                    title=${this.#t('Free aim')}
                    @click=${() => this._toggleFreeaim()}
                  >${this.#t('Free')}</button>
                  <button
                    class="chip toggle ${!this._freeaim ? 'on' : ''}"
                    aria-pressed=${!this._freeaim}
                    title=${this.#t('Aim assist')}
                    @click=${() => this._toggleFreeaim()}
                  >${this.#t('Assist')}</button>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <button class="action" @click=${() => this._confirm()}>
            ${this._actionLabel()}
          </button>

          <div class="footer">
            ${this.mode === 'challenge'
              ? html`<button class="msg-btn" type="button" aria-label=${this.#t('Send message')}
                  @click=${() => { emit(this, 'message'); this.hide(); }}>💬</button>`
              : ''}
            <button class="cancel" @click=${() => { emit(this, 'cancel'); this.hide(); }}>
              ${this.#t('Cancel')}
            </button>
          </div>

          <div class="languages" aria-label=${this.#t('Language')}>
            ${this.#strings.languages.map(l => html`
              <a
                href="#"
                class=${l.code === this._lang ? 'active' : ''}
                aria-current=${l.code === this._lang ? 'true' : 'false'}
                @click=${e => { e.preventDefault(); this.#strings.set(l.code); }}
              >${l.label}</a>
            `)}
          </div>
        </div>
      </div>`;
  }
}

customElements.define('selector-modal', SelectorModal);
