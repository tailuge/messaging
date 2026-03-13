import { PresenceMessage, ChallengeMessage } from "../../src/index";
import { countryToFlag } from "./utils/flag";

// =============================================================================
// UI Rendering Functions
// These functions handle all DOM manipulation and display logic.
// =============================================================================

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

export function renderUserList(users: PresenceMessage[], currentUserId: string) {
    const list = document.getElementById('user-list');
    const countEl = document.getElementById('count');
    
    if (countEl) countEl.innerText = `Online Users: ${users.length}`;
    if (list) {
        list.innerHTML = users.map(u => {
            const isMe = u.userId === currentUserId;
            const inGame = !!u.tableId;
            const isSeeking = !!u.seek;
            
            let actionBtn = '';
            if (!isMe) {
                if (inGame) {
                    actionBtn = `<button class="btn-spectate" onclick="spectateGame('${u.tableId}')">Spectate</button>`;
                } else if (isSeeking) {
                    actionBtn = `<button class="btn-join" onclick="joinSeek('${u.userId}', '${u.seek?.tableId}', '${u.seek?.ruleType}')">Join Game</button>`;
                } else {
                    actionBtn = `<button class="btn-challenge" onclick="challengeUser('${u.userId}')">Challenge</button>`;
                }
            }

            return `
                <li class="user-item ${isMe ? 'me' : ''}">
                    <div>
                        <span>${countryToFlag(u._meta?.country)} ${u.userName}</span>
                        <div class="status">
                            ${u.userId} 
                            ${inGame ? '(In Game: ' + u.tableId + ')' : ''}
                            ${isSeeking ? '(Seeking Game...)' : ''}
                        </div>
                    </div>
                    ${actionBtn}
                </li>
            `;
        }).join('');
    }
}

export function showGameInfo(tableId: string, opponentName: string, ruleType: string, isFirst: boolean | undefined, userId: string, userName: string) {
    const container = document.getElementById('game-container');
    const text = document.getElementById('game-text');
    const iframe = document.getElementById('game-iframe') as HTMLIFrameElement;
    if (container && text) {
        text.innerText = `Playing on table: ${tableId} against ${opponentName}`;
        container.style.display = 'block';
    }
    if (iframe) {
        let url = `https://billiards.tailuge.workers.dev/?websocketserver=wss://billiards.onrender.com/ws&tableId=${tableId}&name=${encodeURIComponent(userName)}&clientId=${userId}&ruletype=${ruleType}`;
        if (isFirst === true) {
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
