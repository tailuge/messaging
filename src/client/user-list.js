import { LitElement, html, css } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { userStatus, activeGames, canChallenge, canSpectate } from '../index.ts';
import { flag, getEmoji, isVercel } from './utils.js';
import { SHARED_STYLES, USER_LIST_STYLES } from './styles.js';

const emit = (el, type, detail) =>
    el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

export class UserList extends LitElement {
    static properties = {
        slots: { type: Array },
        users: { type: Array },
        myId: { type: String },
        myName: { type: String },
        tableId: { type: String },
        isChallengePending: { type: Boolean },
        challenges: { type: Object },
        pendingChats: { type: Object },
    };

    #expanded = false;
    static styles = [SHARED_STYLES, USER_LIST_STYLES, css`
        @keyframes throb { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        li { animation: fadeIn 0.2s ease-out; }
        .btn-chat { animation: throb 2s ease-in-out infinite; font-size: 1rem; border: none; background: none; padding: 0 0.2rem; }
        .btn-spectate { background: #7c3aed; color: #fff; border: none; border-radius: 4px; padding: 0.25rem 0.6rem; cursor: pointer; }
        .btn-spectate:hover { background: #6d28d9; }
    `];

    updated() {
        if (!this.#expanded) return;
        const ul = this.renderRoot.querySelector('ul');
        if (!ul) return;
        const height = ul.scrollHeight;
        if (height > 0) {
            ul.style.setProperty('--ul-expanded-height', height + 'px');
        }
    }

    #toggleExpand() {
        this.#expanded = !this.#expanded;
        emit(this, 'user-list-toggle', { expanded: this.#expanded });
        this.requestUpdate();
    }

    render() {
        const slots = this.slots || [];
        const onlineSlots = slots.filter(s => s.status === 'online');
        if (onlineSlots.length === 0) return html`<div class="empty">No other players online yet. Invite a friend!</div>`;

        const activeGameIds = new Set(
            activeGames(this.users || [])
                .filter(g => g.players.length > 1)
                .map(g => g.tableId)
        );

        return html`
            <ul class="${this.#expanded ? 'expanded' : ''}" aria-label="Online players">
                ${repeat(slots, (_, i) => i, (slot, i) => this._rowSlot(slot, i, activeGameIds))}
            </ul>
            <div class="expand-toggle" @click=${this.#toggleExpand}>
                ${this.#expanded ? '▲' : '▼'}
            </div>`;
    }

    _rowSlot(slot, index, activeGameIds) {
        if (slot.status === 'offline') {
            const u = slot.user;
            const status = getEmoji(u.meta?.origin ?? '', u.ruleType ?? '', userStatus(u));
            return html`
                <li class="is-offline" aria-label="${u.userName}">
                    <div class="user-info">
                        <span class="user-name">
                            <span title="${flag(u.meta?.country).title}">${flag(u.meta?.country).emoji}</span>
                            ${u.userName}
                            <span aria-label="${status.title}" role="img">${status.emoji}</span>
                        </span>
                    </div>
                </li>`;
        }
        return this._row(slot.user, activeGameIds);
    }

    _row(u, activeGameIds) {
        const unread = this.pendingChats?.get(u.userId) > 0;
        const hasOffer = this.challenges?.[u.userId]?.challengerId === u.userId;
        const challengeable = !hasOffer && (u.isBot || canChallenge(u, this.myId));

        const spectatable = !u.isBot &&
            userStatus(u) === 'playing' &&
            canSpectate(u, this.tableId) &&
            activeGameIds.has(u.tableId);

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

customElements.define('user-list', UserList);
