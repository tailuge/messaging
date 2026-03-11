import { Lobby, LobbyOptions } from "./lobby";
import { Table } from "./table";
import { PresenceMessage } from "./types";
/**
 * The main messaging client library entry point.
 * Encapsulates transport logic and provides access to lobby and table functionality.
 */
export declare class MessagingClient {
    private nchan;
    private activeLobbies;
    private activeTables;
    private lastLobbyConfig?;
    constructor(options: {
        baseUrl: string;
    });
    /**
     * Initializes the client and ensures connection readiness.
     * In browser environments, attaches lifecycle event listeners.
     */
    start(): Promise<void>;
    /**
     * Stops all active connections and cleans up.
     */
    stop(): Promise<void>;
    /**
     * Enters the global lobby for presence broadcasting and tracking.
     */
    joinLobby(user: PresenceMessage, options?: LobbyOptions): Promise<Lobby>;
    /**
     * Joins a specific table for communication.
     */
    joinTable<T = any>(tableId: string, userId: string): Promise<Table<T>>;
    private handlePageHide;
    private handlePageShow;
    private handleVisibilityChange;
}
