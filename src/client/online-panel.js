import { LitElement, html, css } from 'lit';
import { MessagingClient, canChallenge, canSpectate } from '../index.ts';
import { userStore } from './user-store.js';
import { gameUrl, spectateUrl, INITIAL_STATE, reduce, flag, getEmoji, ruleIcon } from './utils.js';
import {
    SHARED_STYLES, USER_LIST_STYLES, CHALLENGE_BANNER_STYLES,
    SENT_CHALLENGE_BANNER_STYLES, PLAYER_PANEL_STYLES, CHALLENGE_MODAL_STYLES, BADGE_STYLES
} from './styles.js';
import './message-modal.js';

const BOTS = [
    { userId: 'bot-clawbreak', userName: 'ClawBreak', isBot: true, meta: { country: 'BOT' } },
    { userId: 'bot-thefarjaw', userName: 'TheFarJaw', isBot: true, meta: { country: 'BOT' } },
];

const emit = (el, type, detail) =>
    el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

// ── UserList ──────────────────────────────────────────────────────────────────

class UserList extends LitElement {
    static properties = {
        users: { type: Array },
        myId: { type: String },
        myName: { type: String },
        tableId: { type: String },
        isChallengePending: { type: Boolean },
        pendingChats: { type: Object },
    };
    static styles = [SHARED_STYLES, USER_LIST_STYLES, css`
        @keyframes throb { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        .btn-chat { animation: throb 2s ease-in-out infinite; font-size: 1rem; border: none; background: none; padding: 0 0.2rem; }
        .btn-spectate { background: #7c3aed; color: #fff; border: none; border-radius: 4px; padding: 0.25rem 0.6rem; cursor: pointer; }
        .btn-spectate:hover { background: #6d28d9; }
    `];

    render() {
        const others = (this.users || []).filter(u => u.userId !== this.myId);
        if (others.length === 0) return html`<div class="empty">No other players online yet. Invite a friend!</div>`;
        return html`<ul aria-label="Online players">${others.map(u => this._row(u))}</ul>`;
    }

    _row(u) {
        const unread = this.pendingChats?.get(u.userId) > 0;
        const challengeable = u.isBot || canChallenge(u, this.myId);
        const spectatable = !u.isBot && canSpectate(u, this.tableId);
        const status = getEmoji(u.meta?.origin ?? '', u.tableId ?? '');
        const actions = unread
            ? html`<button class="btn-chat" aria-label="Unread message from ${u.userName}" @click=${() => emit(this, 'open-chat', u.userId)}>💬</button>`
            : spectatable
                ? html`<button class="btn-spectate" aria-label="Spectate ${u.userName}'s game" @click=${() => emit(this, 'spectate', u)}>Spectate</button>`
                : challengeable
                    ? html`<button class="btn-challenge" aria-label="Challenge ${u.userName}" ?disabled=${this.isChallengePending} @click=${() => emit(this, 'challenge', u.userId)}>Challenge</button>`
                    : html``;
        return html`
            <li aria-label="${u.userName}">
                <div class="user-info">
                    <span class="user-name">${flag(u.meta?.country)} ${u.userName} <span aria-label="${status.title}" role="img">${status.emoji}</span></span>
                </div>
                <div class="actions">${actions}</div>
            </li>`;
    }
}

// ── ChallengeBanner ───────────────────────────────────────────────────────────

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
                <div class="details"><span>${ruleIcon(c.ruleType)} ${c.ruleType}</span>${extras.map(e => html`<span>${e}</span>`)}</div>
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
                <div class="row">
                    <strong>${isWaiting ? `⏳ Waiting for ${c.recipientName}…` : `❌ ${c.recipientName} declined.`}</strong>
                    ${isWaiting
                        ? html`<button class="btn-leave" @click=${() => emit(this, 'cancel')}>Cancel</button>`
                        : html`<button aria-label="Dismiss" @click=${() => emit(this, 'dismiss')}>✕</button>`}
                </div>
                <div class="details">${ruleIcon(c.ruleType)} ${c.ruleType}</div>
            </div>`;
    }
}

// ── ChallengeModal ────────────────────────────────────────────────────────────

class ChallengeModal extends LitElement {
    static properties = { userId: { type: String }, userName: { type: String } };
    static styles = [SHARED_STYLES, CHALLENGE_MODAL_STYLES, BADGE_STYLES];
    static RULES = [
        { id: 'eightball',    label: 'Eight Ball',          img: 'assets/eightball.png' },
        { id: 'nineball',     label: 'Nine Ball',           img: 'assets/nineball.png' },
        { id: 'threecushion', label: 'Three Cushion (3)',   img: 'assets/threecushion.png', options: { raceTo: '3' } },
        { id: 'threecushion', label: 'Three Cushion (7)',   img: 'assets/threecushion.png', options: { raceTo: '7' } },
        { id: 'threecushion', label: 'Three Cushion (15)',  img: 'assets/threecushion.png', options: { raceTo: '15' } },
        { id: 'snooker',      label: 'Snooker (15 reds)',   img: 'assets/snooker.png' },
        { id: 'snooker',      label: 'Snooker (6 reds)',    img: 'assets/snooker.png', options: { reds: '6' } },
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

// ── OnlinePanel ───────────────────────────────────────────────────────────────

class OnlinePanel extends LitElement {
    static styles = [SHARED_STYLES, PLAYER_PANEL_STYLES];

    #state = { ...INITIAL_STATE };
    #lobby = null;
    #table = null;
    #myId;
    #myName;
    #connectTime;
    #client;
    #pendingChallenge = null;
    #pendingMessage = null;
    #pendingChats = new Map(); // userId → unread count

    constructor() {
        super();
        const p = new URLSearchParams(location.search);
        this.#myId   = p.get('userId') || localStorage.getItem('userId') || 'user-' + Math.random().toString(36).slice(2, 7);
        this.#myName = p.get('userName')  || localStorage.getItem('userName')  || 'Anonymous';

        let baseUrl = 'https://billiards-network.onrender.com';
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
            baseUrl = `${protocol}//${location.host}`;
        }
        this.#client = new MessagingClient({ baseUrl });
    }

    connectedCallback() {
        super.connectedCallback();
        this._onUserChanged = e => {
            this.#myId   = e.detail.userId;
            this.#myName = e.detail.userName;
            if (this.#lobby) {
                this.#lobby.updatePresence({ userId: this.#myId, userName: this.#myName })
                    .catch(err => console.error('Failed to update presence:', err));
            } else {
                this._connect().catch(e => console.error('Lobby connect failed:', e));
            }
        };
        document.addEventListener('user-name-changed', this._onUserChanged);
        this._connect().catch(e => console.error('Lobby connect failed:', e));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('user-name-changed', this._onUserChanged);
        this.#lobby?.leave();
    }

    dispatch(action) {
        this.#state = reduce(this.#state, { ...action, myId: this.#myId });
        this.requestUpdate();
    }

    get #connected()       { return this.#state.connected; }
    get #users()           { return this.#state.users; }
    get #tableId()         { return this.#state.currentMatch?.tableId; }
    get #ruleType()        { return this.#state.currentMatch?.ruleType || 'standard'; }
    get #isFirst()         { return !!this.#state.currentMatch?.isFirst; }
    get #matchOptions()    { return this.#state.currentMatch?.options; }
    get #activeChallenge() {
        return Object.values(this.#state.challenges).find(c => c.challengeeId === this.#myId && c.status === 'pending');
    }
    get #sentChallenge() {
        return Object.values(this.#state.challenges).find(c => c.challengerId === this.#myId);
    }

    get #visibleUsers() { return [...this.#users, ...BOTS]; }

    async _connect() {
        this.#connectTime = Date.now();
        this.#lobby = await this.#client.joinLobby({
            messageType: 'presence', type: 'join',
            userId: this.#myId, userName: this.#myName,
        });
        this.dispatch({ type: 'CONNECTED', payload: true });
        this.#lobby.onUsersChange(users => this.dispatch({ type: 'USERS_UPDATE', payload: users }));
        this.#lobby.onChallenge(msg => {
            const msgTime = msg.meta?.ts ? new Date(msg.meta.ts).getTime() : Infinity;
            if (msgTime < this.#connectTime) return;
            this.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
            if (msg.type === 'offer' && msg.challengeeId === this.#myId && document.hidden && Notification.permission === 'granted') {
                new Notification('Challenge received!', { body: `${msg.challengerName} challenged you to ${msg.ruleType}`, icon: 'assets/threecushion.png' });
            }
        });
    }

    async #challenge(userId, ruleType, options) {
        const u = this.#visibleUsers.find(u => u.userId === userId);
        if (u?.isBot) {
            const tableId = 'bot-' + Math.random().toString(36).slice(2, 8);
            window.location.href = gameUrl({ tableId, userId: this.#myId, userName: this.#myName, ruleType, isFirst: true, options, bot: u.userName, lod: userStore.lod });
            return;
        }
        const tableId = await this.#lobby.challenge(userId, ruleType, undefined, options);
        this.dispatch({ type: 'CHALLENGE_SENT', payload: { challengerId: this.#myId, challengeeId: userId, recipientName: u?.userName || userId, ruleType, options, tableId } });
    }

    async #cancelChallenge() {
        const s = this.#sentChallenge;
        if (s?.status === 'pending') {
            await this.#lobby.cancelChallenge(s.challengeeId, s.ruleType);
            this.dispatch({ type: 'CHALLENGE_DISMISS', payload: s.challengeeId });
        }
    }

    async #acceptChallenge() {
        const c = this.#activeChallenge;
        this.#table = await this.#lobby.acceptChallenge(c.challengerId, c.ruleType, c.tableId, c.options, c.challengerName);
        this.dispatch({ type: 'MATCH_SET', payload: { tableId: c.tableId, ruleType: c.ruleType, options: c.options, isFirst: false } });
    }

    async #declineChallenge() {
        const c = this.#activeChallenge;
        await this.#lobby.declineChallenge(c.challengerId, c.ruleType, c.challengerName);
        this.dispatch({ type: 'CHALLENGE_DISMISS', payload: c.challengerId });
    }

    #clearSentChallenge() {
        const s = this.#sentChallenge;
        if (s) this.dispatch({ type: 'CHALLENGE_DISMISS', payload: s.challengeeId });
    }

    render() {
        if (this.#tableId) {
            const url = gameUrl({ tableId: this.#tableId, userId: this.#myId, userName: this.#myName, ruleType: this.#ruleType, isFirst: this.#isFirst, options: this.#matchOptions, lod: userStore.lod });
            window.location.href = url;
            return html``;
        }

        const p = this.#pendingChallenge;
        return html`
            <div class="panel-header">
                <span class="dot ${this.#connected ? 'on' : ''}" role="status" aria-label="${this.#connected ? 'Connected' : 'Disconnected'}"></span>
                <span class="panel-title">Play Online (${this.#visibleUsers.filter(u => u.userId !== this.#myId).length})</span>
            </div>
            <challenge-banner
                .challenge=${this.#activeChallenge}
                .sent=${this.#sentChallenge}
                @accept=${() => this.#acceptChallenge()}
                @decline=${() => this.#declineChallenge()}
                @cancel=${() => this.#cancelChallenge()}
                @dismiss=${() => this.#clearSentChallenge()}>
            </challenge-banner>
            <user-list
                .users=${this.#visibleUsers}
                myId=${this.#myId}
                myName=${this.#myName}
                tableId=${this.#tableId || ''}
                .isChallengePending=${this.#sentChallenge?.status === 'pending'}
                .pendingChats=${this.#pendingChats}
                @challenge=${e => {
                    const u = this.#visibleUsers.find(u => u.userId === e.detail);
                    this.#pendingChallenge = { userId: e.detail, userName: u?.userName ?? e.detail };
                    this.requestUpdate();
                }}
                @spectate=${e => {
                    const u = e.detail;
                    window.location.href = spectateUrl({ tableId: u.tableId, userId: this.#myId, userName: this.#myName, ruleType: u.ruleType || 'nineball' });
                }}
                @open-chat=${e => {
                    const u = this.#visibleUsers.find(u => u.userId === e.detail);
                    this.#pendingMessage = { userId: e.detail, userName: u?.userName ?? e.detail };
                    this.requestUpdate();
                }}>
            </user-list>
            <challenge-modal
                .userId=${p?.userId ?? null}
                .userName=${p?.userName ?? ''}
                @confirm=${e => { this.#challenge(p.userId, e.detail.ruleType, e.detail.options); this.#pendingChallenge = null; }}
                @message=${() => {
                    this.#pendingMessage = { userId: p.userId, userName: p.userName };
                    this.#pendingChallenge = null;
                    this.requestUpdate();
                }}
                @cancel=${() => { this.#pendingChallenge = null; this.requestUpdate(); }}>
            </challenge-modal>
            <message-modal
                .lobby=${this.#lobby}
                .targetId=${this.#pendingMessage?.userId ?? null}
                .targetName=${this.#pendingMessage?.userName ?? ''}
                @close=${() => { this.#pendingMessage = null; this.requestUpdate(); }}
                @unread-changed=${e => {
                    this.#pendingChats = new Map(this.#pendingChats).set(e.detail.userId, e.detail.count);
                    this.requestUpdate();
                }}>
            </message-modal>`;
    }
}

customElements.define('user-list',        UserList);
customElements.define('challenge-banner', ChallengeBanner);
customElements.define('challenge-modal',  ChallengeModal);
customElements.define('online-panel',     OnlinePanel);
