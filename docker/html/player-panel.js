import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { canChallenge } from '/messaging.js';
import { flag, getEmoji } from './utils.js';
import { SHARED_STYLES, USER_LIST_STYLES, CHALLENGE_BANNER_STYLES, SENT_CHALLENGE_BANNER_STYLES, PLAYER_PANEL_STYLES } from './styles.js';

const emit = (el, type, detail) =>
    el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

class UserList extends LitElement {
    static properties = {
        users: { type: Array },
        myId: { type: String },
        tableId: { type: String },
        isChallengePending: { type: Boolean },
    };
    static styles = [SHARED_STYLES, USER_LIST_STYLES];

    render() {
        const others = (this.users || []).filter(u => u.userId !== this.myId);
        if (others.length === 0) return html`<div style="padding:1rem;text-align:center;color:#757575;font-style:italic;font-size:0.8rem">No other players online yet. Invite a friend!</div>`;
        return html`<ul>${others.map(u => this._row(u))}</ul>`;
    }

    _row(u) {
        const actions = canChallenge(u, this.myId)
            ? html`<button class="btn-challenge" aria-label="Challenge ${u.userName}" ?disabled=${this.isChallengePending} @click=${() => emit(this, 'challenge', u.userId)}>Challenge</button>`
            : html``;
        return html`
            <li>
                <div class="user-info">
                    <span class="user-name">${flag(u.meta?.country)} ${u.userName} ${getEmoji(u.meta?.origin ?? '', u.tableId ?? '').emoji}</span>
                </div>
                <div class="actions">${actions}</div>
            </li>`;
    }
}

class ChallengeBanner extends LitElement {
    static properties = { challenge: { type: Object }, sent: { type: Object } };
    static styles = [SHARED_STYLES, CHALLENGE_BANNER_STYLES, SENT_CHALLENGE_BANNER_STYLES];

    render() {
        if (this.challenge) return this._incoming(this.challenge);
        if (this.sent) return this._sent(this.sent);
        return html``;
    }

    _incoming(c) {
        const extras = Object.entries(c.options ?? {}).map(([k, v]) => `${k}: ${v}`);
        return html`
            <div class="banner">
                <strong>Challenge from ${c.challengerName}</strong>
                <div class="details"><span>📋 ${c.ruleType}</span>${extras.map(e => html`<span>${e}</span>`)}</div>
                <div class="row">
                    <button class="btn-accept" @click=${() => emit(this, 'accept')}>Accept</button>
                    <button class="btn-decline" @click=${() => emit(this, 'decline')}>Decline</button>
                </div>
            </div>`;
    }

    _sent(c) {
        const isWaiting = c.status === 'pending';
        return html`
            <div class="banner ${c.status}">
                <div class="row">
                    <strong>${isWaiting ? `⏳ Waiting for ${c.recipientName}…` : `❌ ${c.recipientName} declined.`}</strong>
                    ${isWaiting
                        ? html`<button class="btn-leave" @click=${() => emit(this, 'cancel')}>Cancel</button>`
                        : html`<button @click=${() => emit(this, 'dismiss')}>✕</button>`}
                </div>
                <div class="details">📋 ${c.ruleType}</div>
            </div>`;
    }
}

class PlayerPanel extends LitElement {
    static properties = {
        users: { type: Array },
        myId: { type: String },
        myName: { type: String },
        connected: { type: Boolean },
        tableId: { type: String },
        activeChallenge: { type: Object },
        sentChallenge: { type: Object },
    };
    static styles = [SHARED_STYLES, PLAYER_PANEL_STYLES];

    render() {
        return html`
            <div class="panel-header">
                <span class="dot ${this.connected ? 'on' : ''}"></span>
                <span class="user-name">${this.myName}</span>
                <span class="panel-title">Play Online</span>
            </div>
            <challenge-banner
                .challenge=${this.activeChallenge}
                .sent=${this.sentChallenge}
                @accept=${() => emit(this, 'accept')}
                @decline=${() => emit(this, 'decline')}
                @cancel=${() => emit(this, 'cancel')}
                @dismiss=${() => emit(this, 'dismiss')}>
            </challenge-banner>
            <user-list
                .users=${this.users}
                myId=${this.myId}
                tableId=${this.tableId || ''}
                .isChallengePending=${this.sentChallenge?.status === 'pending'}
                @challenge=${e => emit(this, 'challenge', e.detail)}>
            </user-list>`;
    }
}

customElements.define('user-list', UserList);
customElements.define('challenge-banner', ChallengeBanner);
customElements.define('player-panel', PlayerPanel);
