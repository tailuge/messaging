import { PresenceMessage, ChallengeMessage, canChallenge, canSpectate } from "../../src/index";
import { countryToFlag } from "./utils/flag";

// =============================================================================
// UI Rendering Functions
// These functions handle all DOM manipulation and display logic.
// =============================================================================

const escape = (s: string | undefined) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const jsEscape = (s: string | undefined) => escape((s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"));

export function updateConnectionUI(online: boolean) {
    const statusEl = document.getElementById('conn-status');
    const btnConnect = document.getElementById('btn-connect');
    const btnDisconnect = document.getElementById('btn-disconnect');
    const btnFindGame = document.getElementById('btn-find-game') as HTMLButtonElement;

    if (statusEl) {
        statusEl.innerText = online ? 'ONLINE' : 'OFFLINE';
        statusEl.className = `connection-status ${online ? 'online' : 'offline'}`;
    }
    if (btnConnect) btnConnect.style.display = online ? 'none' : 'block';
    if (btnDisconnect) btnDisconnect.style.display = online ? 'block' : 'none';
    if (btnFindGame) btnFindGame.disabled = !online;
}

export function showChallenge(challenge: ChallengeMessage) {
    const container = document.getElementById('challenge-container');
    const text = document.getElementById('challenge-text');
    if (container && text) {
        text.innerText = `${challenge.challengerName} has challenged you to a game!`;
        container.style.display = 'block';
    }
}

export function hideChallenge() {
    const container = document.getElementById('challenge-container');
    if (container) container.style.display = 'none';
}

export function showChat(senderId: string, text: string) {
    const container = document.getElementById('chat-container');
    const textEl = document.getElementById('chat-text');
    const input = document.getElementById('chat-reply-input') as HTMLInputElement;
    if (container && textEl) {
        textEl.innerText = `${senderId}: ${text}`;
        container.style.display = 'block';
        if (input) {
            input.dataset.recipientId = senderId;
            input.value = '';
        }
    }
}

export function renderUserList(users: PresenceMessage[], currentUserId: string, currentTableId?: string) {
    const list = document.getElementById('user-list');
    const countEl = document.getElementById('count');
    
    if (countEl) countEl.innerText = `Online Users: ${users.length}`;
    if (list) {
        list.innerHTML = users.map(u => {
            const isMe = u.userId === currentUserId, inGame = !!u.tableId, isSeeking = !!u.seek;
            const jsId = jsEscape(u.userId), jsTid = jsEscape(u.tableId), jsSid = jsEscape(u.seek?.tableId), jsRule = jsEscape(u.seek?.ruleType);
            const escId = escape(u.userId), escName = escape(u.userName), escTid = escape(u.tableId);
            
            let actionBtn = '';
            if (!isMe) {
                if (canSpectate(u, currentTableId)) {
                    actionBtn = `<button class="btn-spectate" onclick="spectateGame('${jsTid}')">Spectate</button>`;
                } else if (isSeeking) {
                    actionBtn = `<button class="btn-join" onclick="joinSeek('${jsId}', '${jsSid}', '${jsRule}')">Join Game</button>`;
                } else if (!inGame && canChallenge(u, currentUserId)) {
                    actionBtn = `<button class="btn-challenge" onclick="challengeUser('${jsId}')">Challenge</button>
                                 <button class="btn-join" onclick="promptChat('${jsId}')">Chat</button>`;
                }
            }

            return `
                <li class="user-item ${isMe ? 'me' : ''}">
                    <div>
                        <span>${countryToFlag(u.meta?.country)} ${escName}</span>
                        <div class="status">
                            ${escId} ${inGame ? '(In Game: ' + escTid + ')' : ''} ${isSeeking ? '(Seeking Game...)' : ''}
                        </div>
                    </div>
                    ${actionBtn}
                </li>
            `;
        }).join('');
    }
}

export function showGameInfo(tableId: string, opponentName: string, ruleType: string, isFirst: boolean | undefined, userId: string, userName: string, isSpectator: boolean = false) {
    const container = document.getElementById('game-container');
    const text = document.getElementById('game-text');
    const iframe = document.getElementById('game-iframe') as HTMLIFrameElement;
    if (container && text) {
        text.innerText = isSpectator 
            ? `Spectating game: ${tableId}`
            : `Playing on table: ${tableId} against ${opponentName}`;
        container.style.display = 'flex';
    }
    if (iframe) {
        let url = `https://billiards.tailuge.workers.dev/?websocketserver=wss://billiards.onrender.com/ws&tableId=${tableId}&name=${encodeURIComponent(userName)}&clientId=${userId}&ruletype=${ruleType}`;
        if (isSpectator) {
            url += `&spectator=true`;
        } else if (isFirst === true) {
            url += `&first=true`;
        }
        iframe.src = url;
    }
}

export function hideGameInfo() {
    const container = document.getElementById('game-container');
    const iframe = document.getElementById('game-iframe') as HTMLIFrameElement;
    if (container) container.style.display = 'none';
    if (iframe) iframe.src = '';
}

export function showSeekStatus() {
    document.getElementById('seek-container')!.style.display = 'block';
}

export function hideSeekStatus() {
    document.getElementById('seek-container')!.style.display = 'none';
}

export function updateMyName(name: string, userId: string) {
    const myNameEl = document.getElementById('my-name');
    if (myNameEl) myNameEl.innerText = `Hello, ${name} (${userId})`;
}

export function clearUserList() {
    const list = document.getElementById('user-list');
    if (list) list.innerHTML = '';
}

export function showDisconnected() {
    const myNameEl = document.getElementById('my-name');
    if (myNameEl) myNameEl.innerText = 'Disconnected';
}
