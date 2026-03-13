import { MessagingClient, Lobby, PresenceMessage } from "../../src/index";
import * as ui from "./ui";
import { AppState, createInitialState } from "./state";

export class ConnectionManager {
    private state: AppState;

    constructor(
        private client: MessagingClient,
        private config: { userId: string; userName: string },
        private onLobbyReady: (lobby: Lobby) => void
    ) {
        this.state = createInitialState();
    }

    getState() {
        return this.state;
    }

    async connect(): Promise<Lobby | null> {
        try {
            await this.client.start();
            const lobby = await this.client.joinLobby({
                messageType: "presence",
                type: "join",
                userId: this.config.userId,
                userName: this.config.userName
            });

            this.state.lobby = lobby;
            ui.updateMyName(this.config.userName, this.config.userId);
            ui.updateConnectionUI(true);
            
            this.onLobbyReady(lobby);
            return lobby;
        } catch (e) {
            console.error("Connection failed", e);
            return null;
        }
    }

    async disconnect() {
        await this.client.stop();
        this.state.lobby = null;
        this.state.currentTable = null;
        this.state.activeChallenge = null;
        this.state.mySeekTableId = null;
        ui.updateConnectionUI(false);
        ui.clearUserList();
        ui.showDisconnected();
    }
}
