import { PresenceMessage, Lobby } from "../../src/index";
import { getUID } from "../../src/utils/uid";
import * as ui from "./ui";
import { AppState } from "./state";
import { GameManager } from "./gamemanager";

export class SeekManager {
    constructor(
        private lobby: Lobby | null,
        private state: AppState,
        private config: { userId: string; userName: string },
        private gameManager: GameManager
    ) {}

    updateLobby(lobby: Lobby) {
        this.lobby = lobby;
    }

    onUsersChange(users: PresenceMessage[]) {
        this.state.onlineUsers = users;
        
        // Check if someone joined our seek - if so, auto-join the game
        if (this.state.mySeekTableId) {
            const otherUser = users.find(u => u.userId !== this.config.userId && u.tableId === this.state.mySeekTableId);
            if (otherUser) {
                console.log('Someone joined my seek, auto-joining game');
                this.state.mySeekTableId = null;
                ui.hideSeekStatus();
                this.gameManager.joinGame(otherUser.tableId!, otherUser.userId, otherUser.seek?.ruleType || 'standard', true);
            }
        }
    }

    async startSeek() {
        if (!this.lobby) return;
        
        const tableId = getUID();
        this.state.mySeekTableId = tableId;
        await this.lobby.updatePresence({ seek: { tableId, ruleType: 'standard' } });
        ui.showSeekStatus();
    }

    async cancelSeek() {
        if (!this.lobby) return;
        
        this.state.mySeekTableId = null;
        await this.lobby.updatePresence({ seek: undefined });
        ui.hideSeekStatus();
    }

    async joinSeek(targetUserId: string, tableId: string, ruleType: string) {
        console.log('Joining seek from:', targetUserId, 'at table:', tableId);
        await this.gameManager.joinGame(tableId, targetUserId, ruleType || 'standard', undefined);
    }
}
