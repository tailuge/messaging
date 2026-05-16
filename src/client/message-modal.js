import { LitElement, html, css } from 'lit';
import { SHARED_STYLES, CHALLENGE_MODAL_STYLES } from './styles.js';

const emit = (el, type, detail) =>
    el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

/**
 * message-modal — self-contained chat window.
 *
 * Props:
 *   lobby      — Lobby instance (registers onChat once when set)
 *   targetId   — userId of the conversation partner (falsy = hidden)
 *   targetName — display name of the conversation partner
 *
 * Events:
 *   unread-changed  { userId, count }  — fired when unread count changes
 */
class MessageModal extends LitElement {
    static properties = {
        lobby:      { type: Object },
        targetId:   { type: String },
        targetName: { type: String },
        _messages:  { state: true },
        _unread:    { state: true },
    };

    static styles = [SHARED_STYLES, CHALLENGE_MODAL_STYLES, css`
        .modal { min-width: 280px; max-width: 360px; }
        .thread { display: flex; flex-direction: column; gap: 0.3rem; max-height: 220px; overflow-y: auto; padding: 0.2rem 0; scrollbar-width: none; -ms-overflow-style: none; }
        .thread::-webkit-scrollbar { display: none; }
        .msg { font-size: 0.82rem; padding: 0.25rem 0.5rem; border-radius: 6px; max-width: 85%; word-break: break-word; }
        .msg.mine { align-self: flex-end; background: #0d6efd; color: #fff; }
        .msg.theirs { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
        .compose { display: flex; gap: 0.3rem; }
        .compose input { flex: 1; padding: 0.25rem 0.4rem; border: 1px solid var(--btn-border); border-radius: 4px; background: var(--surface); color: var(--text); font: inherit; font-size: 0.82rem; }
        .compose input:focus { outline: 2px solid #0d6efd; outline-offset: 1px; }
        .empty { font-size: 0.78rem; color: var(--text-muted); text-align: center; padding: 0.5rem 0; }
    `];

    constructor() {
        super();
        this._messages = new Map(); // userId → ChatMessage[]
        this._unread   = new Map(); // userId → number
        this._lobbyBound = false;
    }

    willUpdate(changed) {
        if (changed.has('lobby') && this.lobby && !this._lobbyBound) {
            this._lobbyBound = true;
            this.lobby.onChat(msg => {
                const key = msg.senderId;
                const thread = [...(this._messages.get(key) ?? []), msg];
                this._messages = new Map(this._messages).set(key, thread);

                // Only count as unread if this conversation isn't currently open
                if (key !== this.targetId) {
                    const count = (this._unread.get(key) ?? 0) + 1;
                    this._unread = new Map(this._unread).set(key, count);
                    emit(this, 'unread-changed', { userId: key, count });
                }
                this.requestUpdate();
            });
        }
        // Clear unread when opening a conversation
        if (changed.has('targetId') && this.targetId) {
            if (this._unread.has(this.targetId)) {
                this._unread = new Map(this._unread).set(this.targetId, 0);
                emit(this, 'unread-changed', { userId: this.targetId, count: 0 });
            }
        }
    }

    _send(e) {
        e.preventDefault();
        const input = this.shadowRoot.querySelector('input');
        const text = input.value.trim();
        if (!text || !this.lobby || !this.targetId) return;
        this.lobby.sendChat(this.targetId, text);
        // Optimistically add to thread
        const myId = this.lobby.currentUser.userId;
        const msg = { messageType: 'chat', senderId: myId, recipientId: this.targetId, text };
        const thread = [...(this._messages.get(this.targetId) ?? []), msg];
        this._messages = new Map(this._messages).set(this.targetId, thread);
        input.value = '';
        this.requestUpdate();
    }

    updated(changedProperties) {
        if (changedProperties.has('targetId')) {
            const thread = this.shadowRoot.querySelector('.thread');
            if (thread) thread.scrollTop = thread.scrollHeight;
            const input = this.shadowRoot.querySelector('input');
            if (input) input.focus();
        } else if (changedProperties.has('_messages')) {
            const oldMessages = changedProperties.get('_messages');
            if (this._messages.get(this.targetId) !== oldMessages?.get(this.targetId)) {
                const thread = this.shadowRoot.querySelector('.thread');
                if (thread) thread.scrollTop = thread.scrollHeight;
            }
        }
    }

    render() {
        if (!this.targetId) return html``;
        const myId = this.lobby?.currentUser?.userId;
        const thread = this._messages.get(this.targetId) ?? [];
        return html`
            <div class="backdrop" @click=${e => e.target === e.currentTarget && emit(this, 'close')}>
                <div class="modal" role="dialog" aria-modal="true" aria-label="Chat with ${this.targetName}">
                    <h3>💬 ${this.targetName}</h3>
                    <div class="thread">
                        ${thread.length === 0
                            ? html`<div class="empty">No messages yet</div>`
                            : thread.map(m => html`<div class="msg ${m.senderId === myId ? 'mine' : 'theirs'}">${m.text}</div>`)}
                    </div>
                    <form class="compose" @submit=${this._send}>
                        <input type="text" placeholder="Message…" autocomplete="off" aria-label="Message text">
                        <button type="submit" class="btn-challenge">Send</button>
                    </form>
                    <button class="cancel" @click=${() => emit(this, 'close')}>Close</button>
                </div>
            </div>`;
    }
}

customElements.define('message-modal', MessageModal);
