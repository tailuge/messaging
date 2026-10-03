import { html } from 'lit';
import { ruleIcon } from './utils.js';
import { I18nElement, i18n } from './i18n.js';
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
 *
 * handicap_${userId} keys are relabeled: "Your handicap" when the userId matches
 * myId, otherwise just "Handicap".
 */
const formatOptions = (options, myId) => {
    if (!options) return [];
    return Object.entries(options)
        .filter(([, v]) => !(typeof v === 'boolean' && v === false))
        .map(([k, v]) => {
            if (k.startsWith('handicap_')) {
                const uid = k.slice('handicap_'.length);
                const label = myId && uid === myId ? 'Your handicap' : 'Handicap';
                if (typeof v === 'boolean') return label;
                return `${label}: ${v}`;
            }
            const label = OPTION_LABELS[k] ?? k;
            if (typeof v === 'boolean') return label;
            return `${label}: ${v}`;
        });
};

class ChallengeBanner extends I18nElement {
    static properties = { challenge: { type: Object }, sent: { type: Object }, myId: { type: String } };
    static styles = [SHARED_STYLES, CHALLENGE_BANNER_STYLES, SENT_CHALLENGE_BANNER_STYLES];

    render() {
        if (this.challenge) return this._incoming(this.challenge);
        if (this.sent) return this._sent(this.sent);
        return html``;
    }

    _incoming(c) {
        const opts = { ...c.options };
        if (Object.keys(opts).some(k => k.startsWith('handicap_'))) {
            const myHandicap = localStorage.getItem(`handicap_${c.ruleType}`) || '15';
            opts['handicap_' + this.myId] = myHandicap;
        }
        const extras = formatOptions(opts, this.myId);
        return html`
            <div class="banner">
                <div class="details">${ruleIcon(c.ruleType)} ${c.ruleType}</div>
                <strong>${i18n.t('Challenge from {name}', { name: c.challengerName })}</strong>
                <div class="details">${extras.map(e => html`<span>${e}</span>`)}</div>
                <div class="row">
                    <button class="btn-accept" aria-label=${i18n.t('Accept challenge')} @click=${() => emit(this, 'accept')}>${i18n.t('Accept')}</button>
                    <button class="btn-decline" aria-label=${i18n.t('Decline challenge')} @click=${() => emit(this, 'decline')}>${i18n.t('Decline')}</button>
                </div>
            </div>`;
    }

    _sent(c) {
        const isWaiting = c.status === 'pending';
        const extras = formatOptions(c.options, this.myId);
        return html`
            <div class="banner ${c.status}">
                <div class="details">${ruleIcon(c.ruleType)} ${c.ruleType}</div>
                ${extras.length > 0 ? html`<div class="details">${extras.map(e => html`<span>${e}</span>`)}</div>` : ''}
                <strong>${isWaiting
                    ? i18n.t('Waiting for {name} to accept.', { name: c.recipientName })
                    : i18n.t('{name} declined.', { name: c.recipientName })}</strong>
                <div class="row">
                    ${isWaiting
                        ? html`<button class="btn-leave" @click=${() => emit(this, 'cancel')}>${i18n.t('Cancel')}</button>`
                        : html`<button aria-label=${i18n.t('Dismiss')} @click=${() => emit(this, 'dismiss')}>✕</button>`}
                </div>
            </div>`;
    }
}

customElements.define('challenge-banner', ChallengeBanner);
