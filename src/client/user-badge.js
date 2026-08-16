import { html } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { USER_BADGE_STYLES } from './styles.js';
import { isVercel } from './utils.js';

// CJK and other fullwidth glyphs are ~2x the width of a Latin 'ch' unit,
// so count them as 2 when sizing the input in `ch`.
const WIDE_RANGES = [
    [0x1100, 0x115F],   // Hangul Jamo
    [0x2E80, 0xA4CF],   // CJK Radicals .. Yi
    [0xAC00, 0xD7A3],   // Hangul Syllables
    [0xF900, 0xFAFF],   // CJK Compatibility Ideographs
    [0xFE10, 0xFE6F],   // Vertical / Small Form Variants
    [0xFF00, 0xFF60],   // Fullwidth Forms
    [0xFFE0, 0xFFE6],   // Fullwidth Signs
    [0x1F300, 0x1FAFF], // Emoji & pictographs
    [0x20000, 0x2FA1F], // CJK Extensions B+
];

const displayCh = (s) => {
    let w = 0;
    for (const ch of s) {
        const cp = ch.codePointAt(0);
        w += WIDE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1;
    }
    return Math.max(w, 1);
};

class UserBadge extends StoreElement {
    static properties = { _dotColor: { state: true } };
    static styles = USER_BADGE_STYLES;

    constructor() {
        super();
        this._clientId = userStore.clientId;
        this._name = userStore.userName;
        this._dotColor = userStore.isForcedId ? '#9fca10ff' : '#4caf50';
    }

    _commit(value) {
        const val = value.trim().slice(0, 12) || 'Anonymous';
        this._name = val;
        userStore.set(this._clientId, val);
        this.dispatchEvent(new CustomEvent('user-name-changed', {
            bubbles: true, composed: true,
            detail: { userId: this._clientId, userName: val }
        }));
    }

    render() {
        if (isVercel) return html``;
        return html`
            <div class="badge" style="--dot-color:${this._dotColor}">
                <span class="dot"></span>
                <input size="1" maxlength="12" .value=${this._name}
                    name="name" autocomplete="nickname"
                    style="width: ${displayCh(this._name)}ch"
                    aria-label="Display name"
                    @input=${e => e.target.style.width = displayCh(e.target.value) + 'ch'}
                    @change=${e => this._commit(e.target.value)}
                    @keydown=${e => e.key === 'Enter' && e.target.blur()}>
            </div>`;
    }
}

customElements.define('user-badge', UserBadge);
