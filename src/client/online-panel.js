import { LitElement, html, css } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { MessagingClient, canChallenge, canSpectate, userStatus } from '../index.ts';
import { userStore } from './user-store.js';
import { gameUrl, spectateUrl, INITIAL_STATE, reduce, flag, getEmoji, isVercel, CLIENTVERSION, formatVersion, NCHANBASE } from './utils.js';
import { logUsage } from './logusage.js';
import { SHARED_STYLES, USER_LIST_STYLES, PLAYER_PANEL_STYLES, CHALLENGE_MODAL_STYLES, BADGE_STYLES } from './styles.js';
import './message-modal.js';
import './challenge-banner.js';

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
        challenges: { type: Object },
        pendingChats: { type: Object },
    };
    static styles = [SHARED_STYLES, USER_LIST_STYLES, css`
        @keyframes throb { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        li { animation: fadeIn 0.2s ease-out; }
        .btn-chat { animation: throb 2s ease-in-out infinite; font-size: 1rem; border: none; background: none; padding: 0 0.2rem; }
        .btn-spectate { background: #7c3aed; color: #fff; border: none; border-radius: 4px; padding: 0.25rem 0.6rem; cursor: pointer; }
        .btn-spectate:hover { background: #6d28d9; }
    `];

    render() {
        const others = (this.users || []).filter(u => u.userId !== this.myId);
        if (others.length === 0) return html`<div class="empty">No other players online yet. Invite a friend!</div>`;
        return html`<ul aria-label="Online players">${repeat(others, u => u.userId, u => this._row(u))}</ul>`;
    }

    _row(u) {
        const unread = this.pendingChats?.get(u.userId) > 0;
        const hasOffer = this.challenges?.[u.userId]?.challengerId === u.userId;
        const challengeable = !hasOffer && (u.isBot || canChallenge(u, this.myId));
        const spectatable = !u.isBot && userStatus(u) === 'playing' && canSpectate(u, this.tableId);
        const status = getEmoji(u.meta?.origin ?? '', u.ruleType ?? '', userStatus(u));
        const actions = unread
            ? html`<button class="btn-chat" aria-label="Unread message from ${u.userName}" @click=${() => emit(this, 'open-chat', u.userId)}>💬</button>`
            : spectatable
                ? html`<button class="btn-spectate" aria-label="Spectate ${u.userName}'s game" @click=${() => emit(this, 'spectate', u)}>Spectate</button>`
                : challengeable
                    ? html`<button class="btn-challenge" aria-label="Challenge ${u.userName}" ?disabled=${this.isChallengePending} @click=${() => isVercel ? window.location.href = 'https://billiards.tailuge.workers.dev/lobby' : emit(this, 'challenge', u.userId)}>Challenge</button>`
                    : html``;
        return html`
            <li aria-label="${u.userName}">
                <div class="user-info">
                    <span class="user-name" @click=${() => emit(this, 'open-chat', u.userId)} style="cursor: pointer"><span title="${flag(u.meta?.country).title}">${flag(u.meta?.country).emoji}</span> ${u.userName} <span aria-label="${status.title}" role="img">${status.emoji}</span></span>
                </div>
                <div class="actions">${actions}</div>
            </li>`;
    }
}

// ── ChallengeModal ────────────────────────────────────────────────────────────

class ChallengeModal extends LitElement {
    static properties = { userId: { type: String }, userName: { type: String } };
    static styles = [SHARED_STYLES, CHALLENGE_MODAL_STYLES, BADGE_STYLES];
    static RULES = [
        { id: 'eightball',    label: 'Eight Ball',          img: 'assets/eightball.png' },
        { id: 'nineball',     label: 'Nine Ball',           img: 'assets/nineball.png' },
        { id: 'snooker',      label: 'Snooker (6 reds)',    img: 'assets/snooker.png', options: { reds: '6' } },
        { id: 'snooker',      label: 'Snooker (10 reds)',    img: 'assets/snooker.png', options: { reds: '10' } },	
        { id: 'snooker',      label: 'Snooker (15 reds)',   img: 'assets/snooker.png' },
        { id: 'threecushion', label: 'Three Cushion (7)',   img: 'assets/threecushion.png', options: { raceTo: '7' } },
        { id: 'threecushion', label: 'Three Cushion (25)',  img: 'assets/threecushion.png', options: { raceTo: '25' } },
        { id: 'threecushion', label: 'Three Cushion Collaboration (15)', img: 'assets/threecushion.png', options: { raceTo: '15', collaboration: true, shotClock: '60' } },
        { id: 'threecushion', label: 'Three Cushion Traditional (15)', img: 'assets/threecushion.png', options: { raceTo: '15', practice: false, shotClock: '45' } },

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
    #myId;
    #myName;
    #client;
    #pendingChallenge = null;
    #pendingMessage = null;
    #pendingChats = new Map(); // userId → unread count
    #autoChallenge = null;

    constructor() {
        super();
        this.#myId   = userStore.clientId;
        this.#myName = userStore.userName;

        const p = new URLSearchParams(location.search);
        const opponentId = p.get('opponentId');
        if (opponentId) {
            this.#autoChallenge = {
                opponentId,
                opponentName: p.get('opponentName') || opponentId,
                ruleType: p.get('ruletype') || 'nineball',
                nextTurnId: p.get('nextTurnId')
            };
        }

        if (opponentId || p.has('action')) {
            const url = new URL(location.href);
            url.searchParams.delete('action');
            url.searchParams.delete('opponentId');
            url.searchParams.delete('opponentName');
            url.searchParams.delete('ruletype');
            url.searchParams.delete('nextTurnId');
            history.replaceState(null, '', url);
        }

        let baseUrl = `https://${NCHANBASE}`;
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
            baseUrl = `${protocol}//${location.host}`;
        }
        this.#client = new MessagingClient({ baseUrl });
        this.#client.setVersion(formatVersion(CLIENTVERSION));
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
        if (action.type === 'CONNECTED' && action.payload) {
            this.#checkAutoChallenge();
        } else if (action.type === 'USERS_UPDATE') {
            this.#checkAutoChallenge();
        } else if (action.type === 'CHALLENGE_MSG') {
            this.#handleAutoChallengeOnMessage(action.payload);
        }
        this.requestUpdate();
    }

    #checkAutoChallenge() {
        if (!this.#autoChallenge || !this.#state.connected) return;
        const opponentId = this.#autoChallenge.opponentId;
        const incoming = Object.values(this.#state.challenges).find(
            c => c.challengerId === opponentId && c.status === 'pending'
        );
        if (incoming) {
            this.#acceptChallenge(incoming.challengerId).catch(err => console.error(err));
        } else if (!this.#sentChallenge && this.#state.users.some(u => u.userId === opponentId)) {
            this.#challenge(opponentId, this.#autoChallenge.ruleType, this.#autoChallenge.options);
        }
    }

    #handleAutoChallengeOnMessage(msg) {
        if (this.#autoChallenge && (msg.challengerId === this.#autoChallenge.opponentId || msg.challengeeId === this.#autoChallenge.opponentId)) {
            if (msg.type === 'decline' || msg.type === 'cancel') {
                this.#autoChallenge = null;
            }
        }
        if (msg.type === 'offer' && msg.challengeeId === this.#myId) {
            if (this.#autoChallenge && this.#autoChallenge.opponentId === msg.challengerId) {
                this.#acceptChallenge(msg.challengerId).catch(e => console.error('Auto-join accept failed:', e));
                return;
            }
            const sent = this.#sentChallenge;
            if (sent && sent.challengeeId === msg.challengerId && sent.status === 'pending') {
                if (this.#myId < msg.challengerId) {
                    this.#acceptChallenge(msg.challengerId).catch(e => console.error('Simultaneous auto-accept failed:', e));
                }
            }
        }
    }

    get state()            { return this.#state; }
    get #connected()       { return this.#state.connected; }
    get #users()           { return this.#state.users; }
    get #tableId()         { return this.#state.currentMatch?.tableId; }
    get #ruleType()        { return this.#state.currentMatch?.ruleType || 'standard'; }
    get #isFirst() {
        if (this.#autoChallenge?.nextTurnId) {
            return this.#autoChallenge.nextTurnId === this.#myId;
        }
        return !!this.#state.currentMatch?.isFirst;
    }
    get #matchOptions()    { return this.#state.currentMatch?.options; }
    get #activeChallenge() {
        return Object.values(this.#state.challenges).find(c => c.challengeeId === this.#myId && c.status === 'pending');
    }
    get #sentChallenge() {
        return Object.values(this.#state.challenges).find(c => c.challengerId === this.#myId);
    }

    get #visibleUsers() { return [...this.#users, ...BOTS]; }

    async _connect() {
        this.#lobby = await this.#client.joinLobby({
            messageType: 'presence', type: 'join',
            userId: this.#myId, userName: this.#myName,
        });
        this.dispatch({ type: 'CONNECTED', payload: true });
        this.#lobby.onUsersChange(users => this.dispatch({ type: 'USERS_UPDATE', payload: users }));
        this.#lobby.onChallenge(msg => {
            this.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
            if (msg.type === 'offer' && msg.challengeeId === this.#myId && document.hidden && Notification.permission === 'granted') {
                new Notification('Challenge received!', { body: `${msg.challengerName} challenged you to ${msg.ruleType}`, icon: 'assets/threecushion.png' });
            }
        });
    }

    async #challenge(userId, ruleType, options) {
        const isAutoChallenge = this.#autoChallenge && this.#autoChallenge.opponentId === userId;
        if (!isAutoChallenge) this.#autoChallenge = null;
        const u = this.#visibleUsers.find(u => u.userId === userId);
        if (u?.isBot) {
            const tableId = 'bot-' + Math.random().toString(36).slice(2, 8);
            const isFirst = true; // Bot challenges always make user first or handled by game engine
            window.location.href = gameUrl({ tableId, userId: this.#myId, userName: this.#myName, ruleType, isFirst, options, bot: u.userName, lod: userStore.lod, flip: userStore.flip });
            return;
        }
        const tableId = this.#lobby ? await this.#lobby.challenge(userId, ruleType, options) : 'test-' + Math.random().toString(36).slice(2, 7);
        logUsage("createTable");
        this.dispatch({ type: 'CHALLENGE_SENT', payload: { challengerId: this.#myId, challengeeId: userId, recipientName: u?.userName || userId, ruleType, options, tableId } });
    }

    async #cancelChallenge() {
        this.#autoChallenge = null;
        const s = this.#sentChallenge;
        if (s?.status === 'pending') {
            if (this.#lobby) await this.#lobby.cancelChallenge(s.challengeeId, s.ruleType);
            this.dispatch({ type: 'CHALLENGE_DISMISS', payload: s.challengeeId });
        }
    }

    async #acceptChallenge(challengerId) {
        const c = challengerId ? this.#state.challenges[challengerId] : this.#activeChallenge;
        if (!c) return;
        if (this.#lobby) await this.#lobby.acceptChallenge(c.challengerId, c.ruleType, c.tableId, c.options, c.challengerName);
        logUsage("joinTable");
        this.dispatch({
            type: 'CHALLENGE_MSG',
            payload: {
                type: 'accept',
                challengerId: c.challengerId,
                challengerName: c.challengerName,
                challengeeId: this.#myId,
                ruleType: c.ruleType,
                tableId: c.tableId,
                options: c.options,
                nextTurnId: this.#autoChallenge?.nextTurnId
            }
        });
        this.#autoChallenge = null;
    }

    async #declineChallenge() {
        this.#autoChallenge = null;
        const c = this.#activeChallenge;
        if (this.#lobby) await this.#lobby.declineChallenge(c.challengerId, c.ruleType, c.challengerName);
        this.dispatch({ type: 'CHALLENGE_DISMISS', payload: c.challengerId });
    }

    #clearSentChallenge() {
        this.#autoChallenge = null;
        const s = this.#sentChallenge;
        if (s) this.dispatch({ type: 'CHALLENGE_DISMISS', payload: s.challengeeId });
    }

    #info() {
        const data = [...this.#visibleUsers]
            .filter(u => u.meta?.country !== 'BOT')
            .map(u => {
                const { meta = {}, ...user } = u;
                const { ts: _ts, since: _since, ...restMeta } = meta;
                return { ...user, meta: restMeta };
            });
        console.log(JSON.stringify(data, null, 2));
	console.log(JSON.stringify({ myId: this.#myId, myName: this.#myName }));
    }

    render() {
        if (this.#tableId) {
            const url = gameUrl({ tableId: this.#tableId, userId: this.#myId, userName: this.#myName, ruleType: this.#ruleType, isFirst: this.#isFirst, options: this.#matchOptions, lod: userStore.lod, flip: userStore.flip });
            this.#autoChallenge = null;
            this.#state = { ...this.#state, currentMatch: null };
            window.location.href = url;
            return html``;
        }

        const p = this.#pendingChallenge;
        return html`
            <div class="panel-header">
                <span class="dot ${this.#connected ? 'on' : ''}" role="status" aria-label="${this.#connected ? 'Connected' : 'Disconnected'}"></span>
                <span class="panel-title" @click=${() => this.#info()}>Play Online (${this.#visibleUsers.filter(u => u.userId !== this.#myId).length})</span>
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
                .challenges=${this.#state.challenges}
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
customElements.define('challenge-modal',  ChallengeModal);
customElements.define('online-panel',     OnlinePanel);

