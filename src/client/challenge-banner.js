import { LitElement, html } from 'lit';
import { ruleIcon } from './utils.js';
import {
    SHARED_STYLES, CHALLENGE_BANNER_STYLES, SENT_CHALLENGE_BANNER_STYLES
} from './styles.js';

const emit = (el, type, detail) =>
    el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

// Friendly labels for known challenge options. Unknown keys fall back to the raw key.
const OPTION_LABELS = {
    raceTo: 'Race to',
    reds: 'Reds',
    shotClock: 'Shot clock',
    collaboration: 'Collaboration',
    practice: 'Practice',
};

/**
 * Renders a list of option display strings (e.g. "Race to: 7", "Shot clock: 60",
 * "Collaboration") from a raw options object. Shows every key — not just a
 * curated whitelist — so newly added options surface in the banner automatically.
 * Boolean false values are omitted; boolean true values render as the label only.
 */
const formatOptions = (options) => {
    if (!options) return [];
    return Object.entries(options)
        .filter(([, v]) => !(typeof v === 'boolean' && v === false))
        .map(([k, v]) => {
            const label = OPTION_LABELS[k] ?? k;
            if (typeof v === 'boolean') return label;
            return `${label}: ${v}`;
        });
};

class ChallengeBanner extends LitElement {
    static properties = { challenge: { type: Object }, sent: { type: Object } };
    static styles = [SHARED_STYLES, CHALLENGE_BANNER_STYLES, SENT_CHALLENGE_BANNER_STYLES];

    render() {
        if (this.challenge) return this._incoming(this.challenge);
        if (this.sent) return this._sent(this.sent);
        return html``;
    }

    _incoming(c) {
        const extras = formatOptions(c.options);
        return html`
            <div class="banner">
                <div class="details">${ruleIcon(c.ruleType)} ${c.ruleType}</div>
                <strong>Challenge from ${c.challengerName}</strong>
                <div class="details">${extras.map(e => html`<span>${e}</span>`)}</div>
                <div class="row">
                    <button class="btn-accept" aria-label="Accept challenge" @click=${() => emit(this, 'accept')}>Accept</button>
                    <button class="btn-decline" aria-label="Decline challenge" @click=${() => emit(this, 'decline')}>Decline</button>
                </div>
            </div>`;
    }

    _sent(c) {
        const isWaiting = c.status === 'pending';
        const extras = formatOptions(c.options);
        return html`
            <div class="banner ${c.status}">
                <div class="details">${ruleIcon(c.ruleType)} ${c.ruleType}</div>
                ${extras.length > 0 ? html`<div class="details">${extras.map(e => html`<span>${e}</span>`)}</div>` : ''}
                <strong>${isWaiting ? `Waiting for ${c.recipientName} to accept.` : `${c.recipientName} declined.`}</strong>
                <div class="row">
                    ${isWaiting
                        ? html`<button class="btn-leave" @click=${() => emit(this, 'cancel')}>Cancel</button>`
                        : html`<button aria-label="Dismiss" @click=${() => emit(this, 'dismiss')}>✕</button>`}
                </div>
            </div>`;
    }
}

customElements.define('challenge-banner', ChallengeBanner);
