import { html } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { USER_BADGE_STYLES } from './styles.js';
import { isVercel } from './utils.js';

// Glyph advances are not uniform, so each range carries the glyph's advance in
// `em`. Wide glyphs cannot be sized in `ch`: `ch` is the width of Exo's '0'
// (0.625em) and Exo has no CJK glyphs, while a Hangul or CJK glyph is ~1em
// wide no matter which fallback font draws it. Counting a wide glyph as 2ch
// therefore sizes the input ~25% too wide, leaving a gap after the name.
const GLYPH_RANGES = [
    [0x1100, 0x115F, 1],      // Hangul Jamo
    [0x2E80, 0xA4CF, 1],      // CJK Radicals .. Yi
    [0xAC00, 0xD7A3, 1],      // Hangul Syllables
    [0xF900, 0xFAFF, 1],      // CJK Compatibility Ideographs
    [0xFE10, 0xFE6F, 1],      // Vertical / Small Form Variants
    [0xFF00, 0xFF60, 1],      // Fullwidth Forms
    [0xFFE0, 0xFFE6, 1],      // Fullwidth Signs
    [0x1F300, 0x1FAFF, 1.25], // Emoji & pictographs
    [0x20000, 0x2FA1F, 1],    // CJK Extensions B+
];

// Latin glyphs stay sized in `ch` (Exo's '0' matches their average width).
const displayWidth = (s) => {
    let latin = 0;
    let wide = 0;
    for (const ch of s) {
        const cp = ch.codePointAt(0);
        const range = GLYPH_RANGES.find(([lo, hi]) => cp >= lo && cp <= hi);
        if (range) wide += range[2];
        else latin++;
    }
    if (!latin && !wide) latin = 1;
    return `calc(${latin}ch + ${+wide.toFixed(2)}em)`;
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
                    style="width: ${displayWidth(this._name)}"
                    aria-label="Display name"
                    @input=${e => e.target.style.width = displayWidth(e.target.value)}
                    @change=${e => this._commit(e.target.value)}
                    @keydown=${e => e.key === 'Enter' && e.target.blur()}>
            </div>`;
    }
}

customElements.define('user-badge', UserBadge);
