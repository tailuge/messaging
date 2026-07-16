import { LitElement, html } from 'lit';
import { SHARED_STYLES, CHALLENGE_MODAL_STYLES, BADGE_STYLES } from './styles.js';

const emit = (el, type, detail) =>
    el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

class ChallengeModal extends LitElement {
    static properties = { userId: { type: String }, userName: { type: String } };
    static styles = [SHARED_STYLES, CHALLENGE_MODAL_STYLES, BADGE_STYLES];
    static RULES = [
        { id: 'eightball',    label: 'Eight Ball',          img: 'assets/eightball.png' },
        { id: 'nineball',     label: 'Nine Ball',           img: 'assets/nineball.png' },
        { id: 'snooker',      label: 'Snooker (6 reds)',    img: 'assets/snooker.png', options: { reds: '6' } },
        { id: 'snooker',      label: 'Snooker (10 reds)',   img: 'assets/snooker.png', options: { reds: '10' } },
        { id: 'snooker',      label: 'Snooker (15 reds)',   img: 'assets/snooker.png' },
        { id: 'threecushion', label: 'Three Cushion (7)',   img: 'assets/threecushion.png', options: { raceTo: '7' } },
        { id: 'threecushion', label: 'Three Cushion (25)',  img: 'assets/threecushion.png', options: { raceTo: '25' } },
        { id: 'threecushion', label: 'Small Table (15)',    img: 'assets/baby.png', options: { raceTo: '15', collaboration: true, shotClock: '60', tableSize: '5' } },
        { id: 'threecushion', label: 'Collaboration (15)',  img: 'assets/threecushion.png', options: { raceTo: '15', collaboration: true, shotClock: '60' } },
        { id: 'threecushion', label: 'Traditional (10)',    img: 'assets/threecushion.png', options: { raceTo: '10', practice: false, shotClock: '45' } },
        { id: 'sagu',         label: '4-ball Small Table (5)', img: 'assets/sagu.png', options: { raceTo: '5', tableSize: '5' } },
        { id: 'sagu',         label: '4-ball (20)',         img: 'assets/sagu.png', options: { raceTo: '20' } },
    ];

    render() {
        if (!this.userId) return html``;
        return html`
            <div class="backdrop" @click=${e => e.target === e.currentTarget && emit(this, 'cancel')}>
                <div class="modal" role="dialog" aria-modal="true" aria-label="Select game type">
                    <h3>Challenge ${this.userName}</h3>
                    <div class="rules">
                        ${ChallengeModal.RULES.map(r => html`
                            <button class="rule btn-challenge" @click=${() => emit(this, 'confirm', { ruleType: r.id, options: r.options })}>
                                <span class="icon-wrap">
                                    <img src=${r.img} alt=${r.label} />
                                    ${r.options ? html`<span class="badge">${Object.values(r.options)[0]}</span>` : ''}
                                </span>
                                ${r.label}
                            </button>`)}
                    </div>
                    <button @click=${() => emit(this, 'message')}>💬 Send message</button>
                    <button class="cancel" @click=${() => emit(this, 'cancel')}>Cancel</button>
                </div>
            </div>`;
    }
}

customElements.define('challenge-modal', ChallengeModal);
