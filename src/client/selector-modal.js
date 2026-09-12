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

// Shot clock (seconds). Matches the `shotClock` option key used by the
// challenge flows and the game URL parameters.
const SHOT_CLOCKS = ['10', '20', '60'];
const DEFAULT_SHOT_CLOCK = '20';

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
    _shotClock: { state: true },
    _lang: { state: true },
  };

  #strings = selectorStrings;
  #unsubLang;

  // Escape closes the dialog, matching the lobby's settings modal. Bound as a
  // field so the same reference can be removed on disconnect.
  #onKeydown = (e) => {
    if (e.key === 'Escape' && this.open) this.hide();
  };

  static styles = css`
    :host {
      display: block;
      font-family: 'Exo', sans-serif;
      font-weight: 200;
      color: var(--text);
      /* Accent matches the lobby's semantic buttons (.btn-challenge). */
      --accent: #0d6efd;
      --accent-hover: #0b5ed7;
      --accent-active: #0a58ca;
      --accent-tint: rgba(13, 110, 253, 0.12);
    }
    :host(:not([open])) { display: none; }

    /* Button baseline mirrors SHARED_STYLES: flat, 4px radius, --btn-* tokens.
       Only the touch target is enlarged for mobile comfort. */
    button {
      font: inherit;
      cursor: pointer;
      border-radius: 4px;
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      user-select: none;
      background: var(--btn-bg);
      border: 1px solid var(--btn-border);
      color: var(--text);
      transition: background-color 0.2s, border-color 0.2s, color 0.2s, opacity 0.2s,
        transform 0.15s ease, box-shadow 0.2s;
    }
    button:hover { background-color: var(--btn-hover); }
    button:active { background-color: var(--btn-active); }
    button:focus-visible, input:focus-visible, a:focus-visible {
      outline: 2px solid #007bff;
      outline-offset: 2px;
    }
    /* Semantic accent buttons follow .btn-challenge's hover/active ramp. */
    .action, .chip.selected, .chip.toggle.on {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .action:hover, .chip.selected:hover, .chip.toggle.on:hover {
      background: var(--accent-hover);
      border-color: var(--accent-active);
    }
    .action:active, .chip.selected:active, .chip.toggle.on:active {
      background: var(--accent-active);
      border-color: var(--accent-active);
    }

    .backdrop {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(1px);
      -webkit-backdrop-filter: blur(1px);
      display: flex; align-items: center; justify-content: center;
      z-index: 100;
      padding: 0.75rem;
      overflow-y: auto;
      overscroll-behavior: contain;
      animation: backdropIn 0.16s ease-out;
    }
    .modal {
      box-sizing: border-box;
      background: var(--modal-bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.75rem 0.9rem;
      width: min(340px, 100%);
      max-width: calc(100vw - 1.5rem);
      max-height: calc(100dvh - 1.5rem);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
      display: flex; flex-direction: column; gap: 0.5rem;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
      animation: modalIn 0.18s cubic-bezier(0.2, 0.9, 0.3, 1);
    }
    .modal::-webkit-scrollbar { width: 6px; }
    .modal::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    @keyframes backdropIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    /* The dialog rises a hair instead of popping; at this size a plain fade
       reads as a flicker. */
    @keyframes modalIn {
      from { opacity: 0; transform: translateY(6px) scale(0.98); }
      to   { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .backdrop, .modal { animation: none; }
    }
    /* Title mirrors the lobby's uppercase, letterspaced headings and its
       muted .panel-title colour, so the dialog reads as part of the shell. */
    h3 {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-align: center;
      color: var(--text-dim);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .tiles {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0.25rem;
    }
    .tile {
      position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      padding: 0.35rem 0.2rem 0.3rem;
      min-height: 32px;
      border-radius: 6px;
    }
    /* A single accent border over a soft tint, rather than the old border +
       ring (which drew a 2px double line). */
    .tile.selected {
      border-color: var(--accent);
      background: var(--accent-tint);
    }
    @media (hover: hover) {
      .tile:not(.selected):hover { transform: translateY(-1px); }
    }
    .tile img { display: block; width: 42px; height: 42px; object-fit: contain; }
    .tile .tile-label {
      display: block;
      font-size: 0.6rem;
      line-height: 1.1;
      text-align: center;
      color: var(--text-muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 100%;
    }
    .tile.selected .tile-label { color: var(--accent); font-weight: 600; }

    .variants {
      display: flex; flex-direction: column; gap: 0.35rem;
      padding: 0.45rem 0.4rem;
      background: var(--table-head);
      border: 1px solid var(--border-light);
      border-radius: 6px;
    }
    .choice-group, .aim-group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
    }
    /* Hairline between option rows keeps the dense stack legible without
       introducing a second nested card. */
    .choice-group + .choice-group,
    .choice-group + .aim-group {
      padding-top: 0.35rem;
      border-top: 1px solid var(--border-light);
    }
    /* Right-aligned so chips start at a common x and the rows line up. */
    .choice-label {
      color: var(--text-muted);
      font-size: 0.68rem;
      min-width: 56px;
      text-align: right;
      line-height: 1;
    }
    .chip {
      min-height: 32px;
      min-width: 32px;
      padding: 0 0.5rem;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 0.75rem;
      line-height: 1;
    }
    .chip.toggle { min-width: 46px; }

    .languages {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 0 0.3rem;
      padding-top: 0.35rem;
      border-top: 1px solid var(--border-light);
      font-size: 0.66rem;
    }
    /* Same link treatment as the lobby's settings modal (--link, underline
       only on hover). */
    .languages a {
      color: var(--link);
      text-decoration: none;
      cursor: pointer;
      padding: 0.4rem 0.15rem;
    }
    .languages a:hover { text-decoration: underline; }
    .languages a.active { color: var(--accent); font-weight: 600; }

    .action {
      width: 100%;
      min-height: 40px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    }
    @media (hover: hover) {
      .action:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(13, 110, 253, 0.28); }
      .action:active { transform: none; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
    }

    .footer { display: flex; gap: 0.25rem; align-items: stretch; }
    .footer .msg-btn {
      flex-shrink: 0;
      min-width: 40px; min-height: 40px;
      padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 1rem;
      line-height: 1;
    }
    .footer .cancel {
      flex: 1;
      min-height: 40px;
      background: var(--modal-cancel);
      font-size: 0.8rem;
    }

    @media (max-width: 380px) {
      .modal { padding: 0.65rem 0.7rem; }
      .tile { padding: 0.3rem 0.15rem; }
      .tile img { width: 38px; height: 38px; }
      .choice-label { min-width: 48px; font-size: 0.64rem; }
      .chip { padding: 0 0.4rem; }
    }
  `;

  constructor() {
    super();
    this.mode = 'solo';
    this.opponent = '';
    this.open = false;
    this.heading = '';
    this.actionLabel = '';
    this._size = ls.get('size', 'full');
    const storedShotClock = ls.get('shotClock', DEFAULT_SHOT_CLOCK);
    this._shotClock = SHOT_CLOCKS.includes(storedShotClock) ? storedShotClock : DEFAULT_SHOT_CLOCK;
    this._sel = ls.get('game', 'threecushion');
    if (!GAMES.some(g => g.key === this._sel)) this._sel = 'threecushion';
    this.#loadGame(this._sel);
    this._lang = this.#strings.lang;
    // Re-render every modal instance when the language changes.
    this.#unsubLang = this.#strings.onChange((lang) => { this._lang = lang; });
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this.#onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.#onKeydown);
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

  _selectShotClock(seconds) {
    this._shotClock = seconds;
    ls.set('shotClock', seconds);
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
    opts.shotClock = this._shotClock;
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
              <div class="choice-group">
                <span class="choice-label">${this.#t('Shot time:')}</span>
                ${SHOT_CLOCKS.map(secs => html`
                  <button
                    class="chip ${this._shotClock === secs ? 'selected' : ''}"
                    role="radio"
                    aria-checked=${this._shotClock === secs}
                    @click=${() => this._selectShotClock(secs)}
                  >${secs}s</button>
                `)}
              </div>
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
