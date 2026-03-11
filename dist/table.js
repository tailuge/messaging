import { parseMessage } from "./types";
/**
 * Represents a specific communication channel for a 2-player/spectator scenario at a table.
 */
export class Table {
    nchan;
    tableId;
    userId;
    lobby;
    subscription = null;
    messageListeners = [];
    spectatorListeners = [];
    opponentLeftListeners = [];
    lobbyUnsubscribe;
    opponentLeft = false;
    opponentSeen = false;
    constructor(nchan, tableId, userId, lobby) {
        this.nchan = nchan;
        this.tableId = tableId;
        this.userId = userId;
        this.lobby = lobby;
        if (this.lobby) {
            const handler = (users) => this.handleLobbyUsersChange(users);
            this.lobby.onUsersChange(handler);
            this.lobbyUnsubscribe = () => {
                this.lobby?.offUsersChange(handler);
            };
        }
    }
    /**
     * Initializes the table by subscribing to its specific channel.
     */
    async join() {
        this.subscription = this.nchan.subscribeTable(this.tableId, (data) => {
            this.handleIncomingMessage(data);
        });
    }
    /**
     * Broadcast an event to all participants at the table.
     */
    async publish(type, data) {
        await this.nchan.publishTable(this.tableId, { type, data }, this.userId);
    }
    /**
     * Subscribe to events published by other participants.
     */
    onMessage(callback) {
        this.messageListeners.push(callback);
    }
    /**
     * Subscribe to opponent departure (explicit leave or timeout).
     */
    onOpponentLeft(callback) {
        this.opponentLeftListeners.push(callback);
        if (this.opponentLeft) {
            callback();
        }
    }
    /**
     * Subscribe to changes in the spectator list.
     * Note: In a real implementation, this would track presence messages on the table channel.
     */
    onSpectatorChange(callback) {
        this.spectatorListeners.push(callback);
    }
    /**
     * Leave the table and stop all subscriptions.
     */
    async leave() {
        try {
            // Explicitly notify the opponent we are leaving
            await this.publish("SYSTEM_DISCONNECT", {});
            // Small delay to ensure the message is dispatched before closing the socket
            await new Promise((r) => setTimeout(r, 100));
        }
        catch (e) {
            console.error("Error leaving table:", e);
        }
        // Clear lobby presence if we have one
        if (this.lobby) {
            await this.lobby.updatePresence({ tableId: undefined });
        }
        this.subscription?.stop();
        this.messageListeners = [];
        this.spectatorListeners = [];
        this.opponentLeftListeners = [];
        this.lobbyUnsubscribe?.();
    }
    handleIncomingMessage(data) {
        const msg = parseMessage(data);
        if (!msg || !msg.type)
            return;
        // Handle system messages internally
        if (msg.type === "SYSTEM_DISCONNECT" && msg.senderId !== this.userId) {
            this.notifyOpponentLeft();
        }
        // Notify message listeners
        this.messageListeners.forEach((cb) => cb(msg));
    }
    handleLobbyUsersChange(users) {
        const playersAtThisTable = users.filter((u) => u.tableId === this.tableId);
        const opponent = playersAtThisTable.find((u) => u.userId !== this.userId);
        if (opponent) {
            this.opponentSeen = true;
        }
        // Watchdog trigger: Opponent was here, but now is gone.
        if (this.opponentSeen && !opponent) {
            this.notifyOpponentLeft();
        }
    }
    notifyOpponentLeft() {
        if (this.opponentLeft)
            return; // Only notify once
        this.opponentLeft = true;
        this.opponentLeftListeners.forEach((cb) => cb());
    }
}
//# sourceMappingURL=table.js.map