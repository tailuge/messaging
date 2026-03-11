import { NchanClient } from "./nchanclient";
import { PresenceMessage, ChallengeMessage } from "./types";
import { Table } from "./table";
export interface LobbyOptions {
    heartbeatInterval?: number;
    pruneInterval?: number;
    staleTtl?: number;
}
/**
 * Manages the global lobby state, including real-time presence tracking and challenge flows.
 */
export declare class Lobby {
    private nchan;
    currentUser: PresenceMessage;
    private users;
    private listeners;
    private challengeListeners;
    private subscription;
    private heartbeatTimer?;
    private pruneTimer?;
    private readonly heartbeatInterval;
    private readonly pruneInterval;
    private readonly staleTtl;
    constructor(nchan: NchanClient, currentUser: PresenceMessage, options?: LobbyOptions);
    /**
     * Initializes the lobby by subscribing to presence events and broadcasting "join".
     */
    join(): Promise<void>;
    /**
     * Pauses the heartbeat timer (e.g. when tab is hidden).
     */
    pauseHeartbeat(): void;
    /**
     * Resumes the heartbeat timer (e.g. when tab becomes visible).
     */
    resumeHeartbeat(): void;
    private startHeartbeat;
    private stopHeartbeat;
    private startPruning;
    private stopPruning;
    /**
     * Emits the current list of online users whenever it changes.
     */
    onUsersChange(callback: (users: PresenceMessage[]) => void): void;
    /**
     * Stop listening to user changes.
     */
    offUsersChange(callback: (users: PresenceMessage[]) => void): void;
    /**
     * Allows updating the current user's status (e.g. name or playing state).
     */
    updatePresence(update: Partial<PresenceMessage>): Promise<void>;
    /**
     * Challenge another user to a game.
     * Returns the ID of the table created for the challenge.
     */
    challenge(userId: string, ruleType: string): Promise<string>;
    /**
     * Accept an incoming challenge.
     * Returns the Table instance for the accepted game.
     */
    acceptChallenge(userId: string, ruleType: string, tableId: string): Promise<Table>;
    /**
     * Decline an incoming challenge.
     */
    declineChallenge(userId: string, ruleType: string): Promise<void>;
    /**
     * Cancel an outgoing challenge.
     */
    cancelChallenge(userId: string, ruleType: string): Promise<void>;
    /**
     * Subscribe to incoming challenges directed at the current user.
     */
    onChallenge(callback: (challenge: ChallengeMessage) => void): void;
    /**
     * Gracefully leaves the lobby.
     */
    leave(): Promise<void>;
    private handleIncomingMessage;
    private handlePresenceUpdate;
    private handleChallenge;
    private notifyListeners;
    private getUsersList;
}
