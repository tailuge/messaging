import { LitElement, html } from 'lit';
import { SHARED_STYLES, CHALLENGE_MODAL_STYLES, BADGE_STYLES } from './styles.js';

const emit = (el, type, detail) =>
    el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

class ChallengeModal extends LitElement {
    static properties = {
        userId: { type: String },
        userName: { type: String },
        _expanded: { state: true },
        _handicap: { state: true },
    };
    static styles = [SHARED_STYLES, CHALLENGE_MODAL_STYLES, BADGE_STYLES];

    static SECTIONS = [
        {
            key: 'eightball',
            label: 'Eight Ball',
            img: 'assets/eightball.png',
            rules: [
                { id: 'eightball', label: 'Eight Ball', img: 'assets/eightball.png' },
            ],
        },
        {
            key: 'nineball',
            label: 'Nine Ball',
            img: 'assets/nineball.png',
            rules: [
                { id: 'nineball', label: 'Nine Ball', img: 'assets/nineball.png' },
            ],
        },
        {
            key: 'snooker',
            label: 'Snooker',
            img: 'assets/snooker.png',
            rules: [
                { id: 'snooker', label: '6 reds',  img: 'assets/snooker.png', options: { reds: '6' } },
                { id: 'snooker', label: '10 reds', img: 'assets/snooker.png', options: { reds: '10' } },
                { id: 'snooker', label: '15 reds', img: 'assets/snooker.png' },
            ],
        },
        {
            key: 'threecushion',
            label: 'Three Cushion',
            img: 'assets/threecushion.png',
            rules: [
                { id: 'threecushion', label: 'Small Table (15)',   img: 'assets/baby.png', options: { raceTo: '15', collaboration: true, shotClock: '60', tableSize: '5' } },
                { id: 'threecushion', label: 'Race to 7',          img: 'assets/threecushion.png', options: { raceTo: '7' } },
                { id: 'threecushion', label: 'Race to 25',         img: 'assets/threecushion.png', options: { raceTo: '25' } },
                { id: 'threecushion', label: 'Collaboration (15)', img: 'assets/threecushion.png', options: { raceTo: '15', collaboration: true, shotClock: '60' } },
                { id: 'threecushion', label: 'Traditional (10)',   img: 'assets/threecushion.png', options: { raceTo: '10', practice: false, shotClock: '45' } },
                { id: 'threecushion', label: 'Handicap',           img: 'assets/threecushion.png', options: { handicap: true } },
            ],
        },
        {
            key: 'sagu',
            label: 'Sagu',
            img: 'assets/sagu.png',
            rules: [
                { id: 'sagu', label: 'Small Table (5)', img: 'assets/baby.png', options: { raceTo: '5', tableSize: '5' } },
                { id: 'sagu', label: 'Race to 20',      img: 'assets/sagu.png', options: { raceTo: '20' } },
                { id: 'sagu', label: 'Handicap',        img: 'assets/sagu.png', options: { handicap: true } },
            ],
        },
    ];

    constructor() {
        super();
        this._expanded = null;
        this._handicap = 15;
    }

    _loadHandicap(key) {
        const stored = localStorage.getItem(`handicap_${key}`);
        if (stored !== null) {
            const n = parseInt(stored, 10);
            if (!isNaN(n) && n >= 5 && n <= 30) { this._handicap = n; return; }
        }
        this._handicap = 15;
    }

    _onHandicapChange(e) {
        const val = parseInt(e.target.value, 10);
        this._handicap = val;
        if (this._expanded) localStorage.setItem(`handicap_${this._expanded}`, String(val));
    }

    _toggle(key) {
        const wasExpanded = this._expanded === key;
        this._expanded = wasExpanded ? null : key;
        if (!wasExpanded) {
            const section = ChallengeModal.SECTIONS.find(s => s.key === key);
            if (section?.rules.some(r => r.options?.handicap === true)) {
                this._loadHandicap(key);
            }
        }
    }

    render() {
        if (!this.userId) return html``;
        return html`
            <div class="backdrop" @click=${e => e.target === e.currentTarget && emit(this, 'cancel')}>
                <div class="modal" role="dialog" aria-modal="true" aria-label="Select game type">
                    <h3>Challenge ${this.userName}</h3>
                    <div class="sections">
                        ${ChallengeModal.SECTIONS.map(s => html`
                            <div class="section">
                                <button
                                    type="button"
                                    class="section-header${this._expanded === s.key ? ' active' : ''}"
                                    @click=${() => this._toggle(s.key)}
                                    aria-label=${s.key}
                                    aria-expanded=${this._expanded === s.key}
                                >
                                    <img src=${s.img} alt=${s.key} />
                                    <span class="section-label">${s.label}</span>
                                </button>
                                <div class="section-body${this._expanded === s.key ? ' expanded' : ''}">
                                        ${s.rules.map(r => html`
                                            <button class="rule btn-challenge" @click=${() => {
                                                const opts = r.options ? { ...r.options } : {};
                                                if (opts.handicap === true) opts.handicap = String(this._handicap);
                                                emit(this, 'confirm', { ruleType: r.id, options: opts });
                                            }}>
                                                <span class="icon-wrap">
                                                    <img src=${r.img} alt=${r.label} />
                                                    ${r.options && r.options.handicap !== true ? html`<span class="badge">${Object.values(r.options)[0]}</span>` : ''}
                                                </span>
                                                ${r.options?.handicap === true ? html`
                                                    <span class="handicap-label">Handicap (${this._handicap})</span>
                                                    <input
                                                        type="range"
                                                        min="5"
                                                        max="30"
                                                        step="1"
                                                        .value=${String(this._handicap)}
                                                        @input=${this._onHandicapChange}
                                                        @click=${(e) => e.stopPropagation()}
                                                        class="handicap-inline-slider"
                                                        aria-label="Handicap level"
                                                    />
                                                ` : html`${r.label}`}
                                            </button>`)}
                                    </div>
                            </div>`)}
                    </div>
                    <button class="msg-btn" type="button" aria-label="Send message" @click=${() => emit(this, 'message')}>💬</button>
                    <button class="cancel" @click=${() => emit(this, 'cancel')}>Cancel</button>
                </div>
            </div>`;
    }
}

customElements.define('challenge-modal', ChallengeModal);
