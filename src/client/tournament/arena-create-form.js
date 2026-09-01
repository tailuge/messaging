import { LitElement, html, css } from 'lit';
import '../proto2-modal.js';

class ArenaCreateForm extends LitElement {
    static properties = {
        ruleType: { type: String },
        options: { attribute: false },
        durationMinutes: { type: Number },
        busy: { type: Boolean },
        error: { type: String },
    };

    static styles = css`
        :host { display: block; color: var(--text); }
        .field { margin: .6rem 0; }
        label { display: block; margin-bottom: .25rem; color: var(--text-muted); font-size: .75rem; }
        select { width: 100%; box-sizing: border-box; padding: .45rem; background: var(--btn-bg); color: var(--text); border: 1px solid var(--btn-border); border-radius: 4px; font: inherit; }
        .config { display: flex; align-items: center; justify-content: center; gap: .3rem; padding: .45rem; border: 1px dashed var(--border); border-radius: 4px; }
        .config-actions { display: flex; align-items: center; gap: .3rem; flex-shrink: 0; }
        .btn-preset { display: flex; align-items: center; gap: .25rem; padding: .25rem .4rem; background: var(--btn-bg); color: var(--text); border: 1px solid var(--btn-border); border-radius: 4px; cursor: pointer; font: inherit; font-size: .75rem; }
        .btn-preset:hover { background: var(--btn-hover, #444); }
        .btn-preset img { width: 18px; height: 18px; display: block; }
        .create { width: 100%; padding: .55rem; font-size: .95rem; }
        .error { padding: .45rem; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; }
    `;

    constructor() {
        super();
        this.ruleType = '';
        this.options = {};
        this.durationMinutes = 10;
        this.busy = false;
        this.error = '';
    }

    _openChooser() { this.renderRoot.querySelector('proto2-modal').show(); }

    _selectPreset(ruleType, options, durationMinutes = 10) {
        this.ruleType = ruleType;
        this.options = options;
        this.durationMinutes = durationMinutes;
        this._notifyChange();
        this._create();
    }

    _onParameters(e) {
        this.ruleType = e.detail.ruleType;
        this.options = e.detail.options || {};
        this._notifyChange();
        this._create();
    }

    _notifyChange() {
        this.dispatchEvent(new CustomEvent('parameters-change', {
            bubbles: true,
            composed: true,
            detail: { ruleType: this.ruleType, options: this.options, durationMinutes: this.durationMinutes },
        }));
    }

    _onDurationChange(e) {
        this.durationMinutes = Number(e.target.value);
        this._notifyChange();
    }

    _create() {
        this.dispatchEvent(new CustomEvent('create-arena', { bubbles: true, composed: true }));
    }

    render() {
        return html`<div class="field"><label for="duration">Duration</label><select id="duration" .value=${String(this.durationMinutes)} @change=${this._onDurationChange}><option value="10">10 minutes</option><option value="30">30 minutes</option></select></div><div class="field"><label>Game type</label><div class="config"><div class="config-actions"><button type="button" class="btn-preset" title="10 mins Three Cushion (mini, race to 7)" @click=${() => this._selectPreset('threecushion', { raceTo: '7', tableSize: '5' }, 10)}><img src="assets/threecushion.png" alt="" /><span>3-Cushion</span></button><button type="button" class="btn-preset" title="10 mins Nine Ball (mini, freeaim)" @click=${() => this._selectPreset('nineball', { tableSize: '6', freeaim: 'true' }, 10)}><img src="assets/nineball.png" alt="" /><span>9-Ball</span></button><button type="button" class="btn-preset" title="10 mins Eight Ball (mini, freeaim)" @click=${() => this._selectPreset('eightball', { tableSize: '6', freeaim: 'true' }, 10)}><img src="assets/eightball.png" alt="" /><span>8-Ball</span></button><button type="button" class="btn-preset" @click=${this._openChooser}>Custom</button></div></div></div>${this.error ? html`<div class="error" role="alert">${this.error}</div>` : ''}<proto2-modal @confirm=${this._onParameters}></proto2-modal>`;
    }
}

customElements.define('arena-create-form', ArenaCreateForm);
