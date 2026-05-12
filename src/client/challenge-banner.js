import { LitElement, html } from 'lit';
import { ruleIcon } from './utils.js';
import {
    SHARED_STYLES, CHALLENGE_BANNER_STYLES, SENT_CHALLENGE_BANNER_STYLES
} from './styles.js';

const emit = (el, type, detail) =>
    el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

class ChallengeBanner extends LitElement {
    static properties = { challenge: { type: Object }, sent: { type: Object } };
    static styles = [SHARED_STYLES, CHALLENGE_BANNER_STYLES, SENT_CHALLENGE_BANNER_STYLES];

    render() {
        if (this.challenge) return this._incoming(this.challenge);
        if (this.sent) return this._sent(this.sent);
        return html``;
    }

    _incoming(c) {
        const extras = Object.entries(c.options ?? {})
            .filter(([k]) => ['raceTo', 'reds'].includes(k))
            .map(([k, v]) => `${k}: ${v}`);
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
        return html`
            <div class="banner ${c.status}">
                <div class="details">${ruleIcon(c.ruleType)} ${c.ruleType}</div>
                <div class="row">
                    <strong>${isWaiting ? `⏳ Waiting for ${c.recipientName}…` : `❌ ${c.recipientName} declined.`}</strong>
                    ${isWaiting
                        ? html`<button class="btn-leave" @click=${() => emit(this, 'cancel')}>Cancel</button>`
                        : html`<button aria-label="Dismiss" @click=${() => emit(this, 'dismiss')}>✕</button>`}
                </div>
            </div>`;
    }
}

customElements.define('challenge-banner', ChallengeBanner);
