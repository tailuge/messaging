import { ChallengeMessage, Lobby } from "../../src/index";
import * as ui from "./ui";
import { AppState } from "./state";
import { GameManager } from "./gamemanager";

export class ChallengeManager {
    constructor(
        private state: AppState,
        private config: { userId: string; userName: string },
        private gameManager: GameManager
    ) {}

    onChallenge(challenge: ChallengeMessage) {
        if (challenge.type === 'offer') {
            this.state.activeChallenge = challenge;
            ui.showChallenge(challenge);
        } else if (challenge.type === 'accept') {
            // I am the challenger, the other player accepted
            this.gameManager.joinGame(challenge.tableId!, challenge.challengerId, challenge.ruleType, true);
        } else if (challenge.type === 'decline' || challenge.type === 'cancel') {
            if (this.state.activeChallenge?.challengerId === challenge.challengerId) {
                ui.hideChallenge();
                this.state.activeChallenge = null;
            }
            console.log(`Challenge ${challenge.type}ed by ${challenge.challengerName}`);
        }
    }

    async accept() {
        if (!this.state.activeChallenge || !this.state.lobby) return;
        
        const table = await this.state.lobby.acceptChallenge(
            this.state.activeChallenge.challengerId,
            this.state.activeChallenge.ruleType,
            this.state.activeChallenge.tableId!
        );
        this.state.currentTable = table;
        ui.hideChallenge();
        ui.showGameInfo(
            this.state.activeChallenge.tableId!, 
            this.state.activeChallenge.challengerName, 
            this.state.activeChallenge.ruleType, 
            undefined, 
            this.config.userId, 
            this.config.userName
        );
    }

    async decline() {
        if (!this.state.activeChallenge || !this.state.lobby) return;
        
        await this.state.lobby.declineChallenge(
            this.state.activeChallenge.challengerId, 
            this.state.activeChallenge.ruleType
        );
        ui.hideChallenge();
        this.state.activeChallenge = null;
    }
}
