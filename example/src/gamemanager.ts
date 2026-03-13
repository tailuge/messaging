import { MessagingClient, PresenceMessage, Lobby } from "../../src/index";
import { Table } from "../../src/table";
import * as ui from "./ui";
import { AppState } from "./state";

export class GameManager {
    constructor(
        private client: MessagingClient,
        private state: AppState,
        private config: { userId: string; userName: string }
    ) {}

    async joinGame(tableId: string, opponentId: string, ruleType: string = 'standard', isFirst?: boolean) {
        if (this.state.currentTable) {
            await this.state.currentTable.leave();
        }
        
        this.state.currentTable = await this.client.joinTable(tableId, this.config.userId);
        
        if (this.state.lobby) {
            await this.state.lobby.updatePresence({ tableId, seek: undefined });
        }

        ui.showGameInfo(tableId, opponentId, ruleType, isFirst, this.config.userId, this.config.userName);

        this.state.currentTable.onMessage((msg) => {
            console.log('Game Message:', msg);
        });
    }

    async spectate(tableId: string) {
        if (this.state.currentTable) {
            await this.state.currentTable.leave();
        }
        this.state.currentTable = await this.client.joinTable(tableId, this.config.userId);
        ui.showGameInfo(tableId, 'Spectating', 'standard', undefined, this.config.userId, this.config.userName, true);
        
        this.state.currentTable.onMessage((msg) => {
            console.log('Spectate Message:', msg);
        });
    }

    async leave() {
        if (this.state.currentTable) {
            await this.state.currentTable.leave();
            this.state.currentTable = null;
            if (this.state.lobby) {
                await this.state.lobby.updatePresence({ tableId: undefined });
            }
            ui.hideGameInfo();
        }
    }
}
