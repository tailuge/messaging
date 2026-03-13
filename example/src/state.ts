import { PresenceMessage, ChallengeMessage, Lobby } from "../../src/index";
import { Table } from "../../src/table";

export interface AppState {
    lobby: Lobby | null;
    currentTable: Table | null;
    activeChallenge: ChallengeMessage | null;
    mySeekTableId: string | null;
    onlineUsers: PresenceMessage[];
}

export function createInitialState(): AppState {
    return {
        lobby: null,
        currentTable: null,
        activeChallenge: null,
        mySeekTableId: null,
        onlineUsers: []
    };
}
