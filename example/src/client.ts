import { MessagingClient, PresenceMessage, Lobby, ChallengeMessage } from "../../src/index";
import { Table } from "../../src/table";
import { getUID } from "../../src/utils/uid";
import * as ui from "./ui";

// =============================================================================
// Configuration
// =============================================================================

const params = new URLSearchParams(window.location.search);
const userId = params.get('id') || 'user-' + Math.random().toString(36).substr(2, 5);
const userName = params.get('name') || 'User';

const client = new MessagingClient({
    baseUrl: window.location.hostname
});

// =============================================================================
// Application State
// =============================================================================

let lobby: Lobby | null = null;
let currentTable: Table | null = null;
let activeChallenge: ChallengeMessage | null = null;
let mySeekTableId: string | null = null;
let onlineUsers: PresenceMessage[] = [];

// =============================================================================
// Lobby Setup
// =============================================================================

function setupLobbyEvents(lobbyInstance: Lobby) {
    lobbyInstance.onUsersChange((users: PresenceMessage[]) => {
        onlineUsers = users;
        ui.renderUserList(users, userId, currentTable ? currentTable.tableId : undefined);

        // Check if someone joined our seek - if so, auto-join the game
        if (mySeekTableId) {
            const otherUser = users.find(u => u.userId !== userId && u.tableId === mySeekTableId);
            if (otherUser) {
                console.log('Someone joined my seek, auto-joining game');
                mySeekTableId = null;
                ui.hideSeekStatus();
                joinGame(otherUser.tableId!, otherUser.userId, otherUser.seek?.ruleType || 'standard', true);
            }
        }
    });

    lobbyInstance.onChallenge((challenge: ChallengeMessage) => {
        console.log('Challenge received (full payload):', challenge);
        if (challenge.type === 'offer') {
            activeChallenge = challenge;
            ui.showChallenge(challenge);
        } else if (challenge.type === 'accept') {
            // I am the challenger, the other player accepted
            joinGame(challenge.tableId!, challenge.challengerId, challenge.ruleType, true);
        } else if (challenge.type === 'decline' || challenge.type === 'cancel') {
            if (activeChallenge?.challengerId === challenge.challengerId) {
                ui.hideChallenge();
                activeChallenge = null;
            }
            console.log(`Challenge ${challenge.type}ed by ${challenge.challengerName}`);
        }
    });
}

// =============================================================================
// Game Logic
// =============================================================================

async function joinGame(tableId: string, opponentId: string, ruleType: string = 'standard', isFirst?: boolean) {
    if (currentTable) {
        await currentTable.leave();
    }
    
    currentTable = await client.joinTable(tableId, userId);
    
    if (lobby) {
        await lobby.updatePresence({ tableId, seek: undefined });
    }

    ui.showGameInfo(tableId, opponentId, ruleType, isFirst, userId, userName);

    currentTable.onMessage((msg) => {
        console.log('Game Message:', msg);
    });
}

async function leaveCurrentGame() {
    if (currentTable) {
        await currentTable.leave();
        currentTable = null;
        if (lobby) {
            await lobby.updatePresence({ tableId: undefined });
        }
        ui.hideGameInfo();
    }
}

async function acceptCurrentChallenge() {
    if (!activeChallenge || !lobby) return;
    
    const table = await lobby.acceptChallenge(
        activeChallenge.challengerId,
        activeChallenge.ruleType,
        activeChallenge.tableId!
    );
    currentTable = table;
    ui.hideChallenge();
    ui.showGameInfo(activeChallenge.tableId!, activeChallenge.challengerName, activeChallenge.ruleType, undefined, userId, userName);
}

async function declineCurrentChallenge() {
    if (!activeChallenge || !lobby) return;
    
    await lobby.declineChallenge(activeChallenge.challengerId, activeChallenge.ruleType);
    ui.hideChallenge();
    activeChallenge = null;
}

// =============================================================================
// Connection Lifecycle
// =============================================================================

async function connect() {
    try {
        await client.start();
        lobby = await client.joinLobby({
            messageType: "presence",
            type: "join",
            userId,
            userName
        });

        setupLobbyEvents(lobby);
        ui.updateMyName(userName, userId);
        ui.updateConnectionUI(true);
    } catch (e) {
        console.error("Connection failed", e);
    }
}

async function disconnect() {
    await client.stop();
    lobby = null;
    currentTable = null;
    activeChallenge = null;
    mySeekTableId = null;
    ui.updateConnectionUI(false);
    ui.clearUserList();
    ui.showDisconnected();
}

// =============================================================================
// Window Exports (for HTML button onclick handlers)
// =============================================================================

(window as any).connect = connect;

(window as any).disconnect = disconnect;

(window as any).findGame = async () => {
    if (!lobby) return;
    const tableId = getUID();
    mySeekTableId = tableId;
    await lobby.updatePresence({ seek: { tableId, ruleType: 'standard' } });
    ui.showSeekStatus();
};

(window as any).cancelSeek = async () => {
    if (!lobby) return;
    mySeekTableId = null;
    await lobby.updatePresence({ seek: undefined });
    ui.hideSeekStatus();
};

(window as any).joinSeek = async (targetUserId: string, tableId: string, ruleType: string) => {
    console.log('Joining seek from:', targetUserId, 'at table:', tableId);
    await joinGame(tableId, targetUserId, ruleType || 'standard', undefined);
};

(window as any).challengeUser = async (targetUserId: string) => {
    if (!lobby) return;
    await lobby.challenge(targetUserId, 'standard');
};

(window as any).spectateGame = async (tableId: string) => {
    if (currentTable) {
        await currentTable.leave();
    }
    currentTable = await client.joinTable(tableId, userId);
    ui.showGameInfo(tableId, 'Spectating', 'standard', undefined, userId, userName, true);
    currentTable.onMessage((msg) => {
        console.log('Spectate Message:', msg);
    });
};

(window as any).leaveGame = leaveCurrentGame;

(window as any).updateName = async () => {
    const input = document.getElementById('name-input') as HTMLInputElement;
    const newName = input?.value;
    if (newName && lobby) {
        await lobby.updatePresence({ userName: newName });
        ui.updateMyName(newName, userId);
    }
};

(window as any).consoleUsers = () => {
    console.log('Online users:', onlineUsers);
};

// =============================================================================
// Button Event Listeners
// =============================================================================

document.getElementById('btn-accept')?.addEventListener('click', async () => {
    await acceptCurrentChallenge();
});

document.getElementById('btn-decline')?.addEventListener('click', async () => {
    await declineCurrentChallenge();
});

// =============================================================================
// Initialization
// =============================================================================

ui.updateConnectionUI(false);
(window as any).connect();
