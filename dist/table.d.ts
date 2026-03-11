import { NchanClient } from "./nchanclient";
import { TableMessage, PresenceMessage } from "./types";
import { Lobby } from "./lobby";
/**
 * Represents a specific communication channel for a 2-player/spectator scenario at a table.
 */
export declare class Table<T = any> {
    private nchan;
    readonly tableId: string;
    private userId;
    private lobby?;
    private subscription;
    private messageListeners;
    private spectatorListeners;
    private opponentLeftListeners;
    private lobbyUnsubscribe?;
    opponentLeft: boolean;
    private opponentSeen;
    constructor(nchan: NchanClient, tableId: string, userId: string, lobby?: Lobby | undefined);
    /**
     * Initializes the table by subscribing to its specific channel.
     */
    join(): Promise<void>;
    /**
     * Broadcast an event to all participants at the table.
     */
    publish(type: string, data: T): Promise<void>;
    /**
     * Subscribe to events published by other participants.
     */
    onMessage(callback: (event: TableMessage<T>) => void): void;
    /**
     * Subscribe to opponent departure (explicit leave or timeout).
     */
    onOpponentLeft(callback: () => void): void;
    /**
     * Subscribe to changes in the spectator list.
     * Note: In a real implementation, this would track presence messages on the table channel.
     */
    onSpectatorChange(callback: (spectators: PresenceMessage[]) => void): void;
    /**
     * Leave the table and stop all subscriptions.
     */
    leave(): Promise<void>;
    private handleIncomingMessage;
    private handleLobbyUsersChange;
    private notifyOpponentLeft;
}
