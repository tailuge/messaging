import { NchanClient } from "./nchanclient";
import { Lobby } from "./lobby";
import { Table } from "./table";
/**
 * The main messaging client library entry point.
 * Encapsulates transport logic and provides access to lobby and table functionality.
 */
export class MessagingClient {
    nchan;
    activeLobbies = [];
    activeTables = [];
    lastLobbyConfig;
    constructor(options) {
        this.nchan = new NchanClient(options.baseUrl);
    }
    /**
     * Initializes the client and ensures connection readiness.
     * In browser environments, attaches lifecycle event listeners.
     */
    async start() {
        if (typeof window !== "undefined") {
            window.addEventListener("pagehide", this.handlePageHide);
            window.addEventListener("pageshow", this.handlePageShow);
            document.addEventListener("visibilitychange", this.handleVisibilityChange);
        }
    }
    /**
     * Stops all active connections and cleans up.
     */
    async stop() {
        if (typeof window !== "undefined") {
            window.removeEventListener("pagehide", this.handlePageHide);
            window.removeEventListener("pageshow", this.handlePageShow);
            document.removeEventListener("visibilitychange", this.handleVisibilityChange);
        }
        await Promise.all(this.activeLobbies.map((lobby) => lobby.leave()));
        this.activeLobbies = [];
        // Use for loop to await each table leave
        for (const table of this.activeTables) {
            await table.leave();
        }
        this.activeTables = [];
    }
    /**
     * Enters the global lobby for presence broadcasting and tracking.
     */
    async joinLobby(user, options) {
        this.lastLobbyConfig = { user, options };
        const lobby = new Lobby(this.nchan, user, options);
        await lobby.join();
        this.activeLobbies.push(lobby);
        return lobby;
    }
    /**
     * Joins a specific table for communication.
     */
    async joinTable(tableId, userId) {
        let table = this.activeTables.find((t) => t.tableId === tableId);
        if (!table) {
            const lobby = this.activeLobbies.find((l) => l.currentUser.userId === userId);
            console.log(`MessagingClient [${userId}] creating new Table ${tableId}`);
            table = new Table(this.nchan, tableId, userId, lobby);
            this.activeTables.push(table);
            if (lobby) {
                await lobby.updatePresence({ tableId });
            }
        }
        else {
            console.log(`MessagingClient [${userId}] reusing existing Table ${tableId}`);
        }
        await table.join();
        // Ensure the subscription has had a moment to actually connect
        await new Promise((r) => setTimeout(r, 100));
        return table;
    }
    handlePageHide = () => {
        // Stop all connections on page hide (prevent ghosting)
        this.stop();
    };
    handlePageShow = (event) => {
        // If returning via bfcache, restore connections
        if (event.persisted && this.lastLobbyConfig) {
            this.joinLobby(this.lastLobbyConfig.user, this.lastLobbyConfig.options);
        }
    };
    handleVisibilityChange = () => {
        if (document.hidden) {
            this.activeLobbies.forEach((l) => l.pauseHeartbeat());
        }
        else {
            this.activeLobbies.forEach((l) => l.resumeHeartbeat());
        }
    };
}
//# sourceMappingURL=messagingclient.js.map