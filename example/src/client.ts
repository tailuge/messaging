import { Lobby, PresenceMessage, ChallengeMessage } from "../../src/index";
import * as ui from "./ui";
import { getConfig, createClient } from "./config";
import { GameManager } from "./gamemanager";
import { ChallengeManager } from "./challengemanager";
import { SeekManager } from "./seekmanager";
import { ConnectionManager } from "./connectionmanager";

// =============================================================================
// Configuration
// =============================================================================

const config = getConfig();
const client = createClient(config.baseUrl);

// =============================================================================
// Managers (created after lobby is ready)
// =============================================================================

let gameManager: GameManager;
let challengeManager: ChallengeManager;
let seekManager: SeekManager;
let connectionManager: ConnectionManager;

function initializeManagers(lobby: Lobby) {
    // Create managers with shared dependencies
    gameManager = new GameManager(client, connectionManager.getState(), config);
    seekManager = new SeekManager(lobby, connectionManager.getState(), config, gameManager);
    challengeManager = new ChallengeManager(connectionManager.getState(), config, gameManager);
    
    // Wire up lobby events
    lobby.onUsersChange((users: PresenceMessage[]) => {
        ui.renderUserList(users, config.userId, connectionManager.getState().currentTable?.tableId);
        seekManager.onUsersChange(users);
    });

    lobby.onChallenge((challenge: ChallengeMessage) => {
        console.log('Challenge received (full payload):', challenge);
        challengeManager.onChallenge(challenge);
    });

    lobby.onChat((msg) => {
        console.log('Chat received:', msg);
        ui.showChat(msg.senderId, msg.text);
    });
}

// =============================================================================
// Window Exports (for HTML button onclick handlers)
// =============================================================================

(window as any).connect = async () => {
    connectionManager = new ConnectionManager(client, config, initializeManagers);
    await connectionManager.connect();
};

(window as any).disconnect = async () => {
    await connectionManager.disconnect();
};

(window as any).findGame = async () => {
    await seekManager.startSeek();
};

(window as any).cancelSeek = async () => {
    await seekManager.cancelSeek();
};

(window as any).joinSeek = async (targetUserId: string, tableId: string, ruleType: string) => {
    await seekManager.joinSeek(targetUserId, tableId, ruleType);
};

(window as any).challengeUser = async (targetUserId: string) => {
    const state = connectionManager.getState();
    if (state.lobby) {
        await state.lobby.challenge(targetUserId, 'standard');
    }
};

(window as any).promptChat = async (targetUserId: string) => {
    const text = prompt(`Message to ${targetUserId}:`);
    const state = connectionManager.getState();
    if (text && state.lobby) {
        await state.lobby.sendChat(targetUserId, text);
    }
};

(window as any).spectateGame = async (tableId: string) => {
    await gameManager.spectate(tableId);
};

(window as any).leaveGame = async () => {
    await gameManager.leave();
};

(window as any).updateName = async () => {
    const input = document.getElementById('name-input') as HTMLInputElement;
    const newName = input?.value;
    const state = connectionManager.getState();
    if (newName && state.lobby) {
        await state.lobby.updatePresence({ userName: newName });
        ui.updateMyName(newName, config.userId);
    }
};

(window as any).consoleUsers = () => {
    console.log('Online users:', connectionManager.getState().onlineUsers);
};

// =============================================================================
// Button Event Listeners
// =============================================================================

document.getElementById('btn-accept')?.addEventListener('click', async () => {
    await challengeManager.accept();
});

document.getElementById('btn-decline')?.addEventListener('click', async () => {
    await challengeManager.decline();
});

document.getElementById('btn-chat-reply')?.addEventListener('click', async () => {
    const input = document.getElementById('chat-reply-input') as HTMLInputElement;
    const recipientId = input?.dataset.recipientId;
    const text = input?.value;
    const state = connectionManager.getState();
    if (recipientId && text && state.lobby) {
        await state.lobby.sendChat(recipientId, text);
        document.getElementById('chat-container')!.style.display = 'none';
    }
});

document.getElementById('chat-reply-input')?.addEventListener('keyup', async (event) => {
    if (event.key === 'Enter') {
        document.getElementById('btn-chat-reply')?.click();
    }
});

document.getElementById('name-input')?.addEventListener('keyup', async (event) => {
    if (event.key === 'Enter') {
        (window as any).updateName();
    }
});

// =============================================================================
// Initialization
// =============================================================================

ui.updateConnectionUI(false);
(window as any).connect();
