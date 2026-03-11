import { parseMessage } from "./types";
import { Table } from "./table";
import { getUID } from "./utils/uid";
/**
 * Manages the global lobby state, including real-time presence tracking and challenge flows.
 */
export class Lobby {
    nchan;
    currentUser;
    users = new Map();
    listeners = [];
    challengeListeners = [];
    subscription = null;
    heartbeatTimer;
    pruneTimer;
    heartbeatInterval;
    pruneInterval;
    staleTtl;
    constructor(nchan, currentUser, options = {}) {
        this.nchan = nchan;
        this.currentUser = currentUser;
        this.heartbeatInterval = options.heartbeatInterval || 30000;
        this.pruneInterval = options.pruneInterval || 10000;
        this.staleTtl = options.staleTtl || 90000;
    }
    /**
     * Initializes the lobby by subscribing to presence events and broadcasting "join".
     */
    async join() {
        this.subscription = this.nchan.subscribePresence((data) => {
            this.handleIncomingMessage(data);
        });
        // Broadcast our own presence
        await this.nchan.publishPresence(this.currentUser);
        this.startHeartbeat();
        this.startPruning();
    }
    /**
     * Pauses the heartbeat timer (e.g. when tab is hidden).
     */
    pauseHeartbeat() {
        this.stopHeartbeat();
    }
    /**
     * Resumes the heartbeat timer (e.g. when tab becomes visible).
     */
    resumeHeartbeat() {
        this.startHeartbeat();
    }
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(async () => {
            try {
                await this.nchan.publishPresence({
                    ...this.currentUser,
                    type: "heartbeat",
                });
            }
            catch (_e) {
                console.error("Failed to send heartbeat:", _e);
            }
        }, this.heartbeatInterval);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }
    startPruning() {
        this.stopPruning();
        this.pruneTimer = setInterval(() => {
            const now = Date.now();
            let changed = false;
            for (const [userId, user] of this.users.entries()) {
                if (userId === this.currentUser.userId)
                    continue;
                // Use lastSeen (ms) or fall back to current time if just joined
                const lastSeen = user.lastSeen || now;
                if (now - lastSeen > this.staleTtl) {
                    this.users.delete(userId);
                    changed = true;
                }
            }
            if (changed) {
                this.notifyListeners();
            }
        }, this.pruneInterval);
    }
    stopPruning() {
        if (this.pruneTimer) {
            clearInterval(this.pruneTimer);
            this.pruneTimer = undefined;
        }
    }
    /**
     * Emits the current list of online users whenever it changes.
     */
    onUsersChange(callback) {
        this.listeners.push(callback);
        // Immediate emit of current state to the new listener
        callback(this.getUsersList());
    }
    /**
     * Stop listening to user changes.
     */
    offUsersChange(callback) {
        this.listeners = this.listeners.filter((l) => l !== callback);
    }
    /**
     * Allows updating the current user's status (e.g. name or playing state).
     */
    async updatePresence(update) {
        this.currentUser = { ...this.currentUser, ...update };
        await this.nchan.publishPresence(this.currentUser);
    }
    /**
     * Challenge another user to a game.
     * Returns the ID of the table created for the challenge.
     */
    async challenge(userId, ruleType) {
        const tableId = getUID();
        await this.nchan.publishChallenge({
            type: "offer",
            challengerId: this.currentUser.userId,
            challengerName: this.currentUser.userName,
            recipientId: userId,
            ruleType,
            tableId,
        });
        return tableId;
    }
    /**
     * Accept an incoming challenge.
     * Returns the Table instance for the accepted game.
     */
    async acceptChallenge(userId, ruleType, tableId) {
        await this.nchan.publishChallenge({
            type: "accept",
            challengerId: this.currentUser.userId,
            challengerName: this.currentUser.userName,
            recipientId: userId,
            ruleType,
            tableId,
        });
        // Automatically update our presence to show we've joined the table
        await this.updatePresence({ tableId });
        const table = new Table(this.nchan, tableId, this.currentUser.userId, this);
        await table.join();
        return table;
    }
    /**
     * Decline an incoming challenge.
     */
    async declineChallenge(userId, ruleType) {
        await this.nchan.publishChallenge({
            type: "decline",
            challengerId: this.currentUser.userId,
            challengerName: this.currentUser.userName,
            recipientId: userId,
            ruleType,
        });
    }
    /**
     * Cancel an outgoing challenge.
     */
    async cancelChallenge(userId, ruleType) {
        await this.nchan.publishChallenge({
            type: "cancel",
            challengerId: this.currentUser.userId,
            challengerName: this.currentUser.userName,
            recipientId: userId,
            ruleType,
        });
    }
    /**
     * Subscribe to incoming challenges directed at the current user.
     */
    onChallenge(callback) {
        this.challengeListeners.push(callback);
    }
    /**
     * Gracefully leaves the lobby.
     */
    async leave() {
        this.stopHeartbeat();
        this.stopPruning();
        this.subscription?.stop();
        try {
            await this.nchan.publishPresence({
                ...this.currentUser,
                type: "leave",
            });
        }
        catch (e) {
            console.error("Error leaving lobby:", e);
        }
        this.users.clear();
        this.notifyListeners();
    }
    handleIncomingMessage(data) {
        const rawMsg = parseMessage(data);
        if (!rawMsg)
            return;
        if (rawMsg.messageType === "presence") {
            this.handlePresenceUpdate(rawMsg);
        }
        else if (rawMsg.messageType === "challenge") {
            this.handleChallenge(rawMsg);
        }
    }
    handlePresenceUpdate(msg) {
        if (msg.type === "leave") {
            this.users.delete(msg.userId);
        }
        else {
            // Use local time for real-time pruning to avoid clock skew
            msg.lastSeen = Date.now();
            this.users.set(msg.userId, msg);
        }
        this.notifyListeners();
    }
    handleChallenge(msg) {
        // Filter messages directed at us (or broadcasted ones)
        if (msg.recipientId === this.currentUser.userId) {
            this.challengeListeners.forEach((cb) => cb(msg));
        }
    }
    notifyListeners() {
        const list = this.getUsersList();
        this.listeners.forEach((cb) => cb(list));
    }
    getUsersList() {
        return Array.from(this.users.values());
    }
}
//# sourceMappingURL=lobby.js.map