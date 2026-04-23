import { NchanClient, Subscription } from "./nchanclient";
import {
  PresenceMessage,
  ChallengeMessage,
  parseMessage,
  RematchInfo,
  ChatMessage,
} from "./types";
import { Table } from "./table";
import { getUID } from "./utils/uid";
import { ChallengeDeduplicator } from "./ChallengeDeduplicator";

export interface LobbyOptions {
  heartbeatInterval?: number;
  pruneInterval?: number;
  staleTtl?: number;
  onReconnect?: () => void;
}

/**
 * Manages the global lobby state, including real-time presence tracking and challenge flows.
 */
export class Lobby {
  private users = new Map<string, PresenceMessage>();
  private listeners: ((users: PresenceMessage[]) => void)[] = [];
  private challengeListeners: ((challenge: ChallengeMessage) => void)[] = [];
  private chatListeners: ((message: ChatMessage) => void)[] = [];
  private pendingChallenges: ChallengeMessage[] = [];
  private deduplicator: ChallengeDeduplicator;
  private subscription: Subscription | null = null;
  private isJoined = false;

  private heartbeatTimer?: any;
  private pruneTimer?: any;
  private presenceMessageCount = 0;

  private readonly heartbeatInterval: number;
  private readonly pruneInterval: number;
  private readonly staleTtl: number;

  constructor(
    private nchan: NchanClient,
    public currentUser: PresenceMessage,
    private options: LobbyOptions = {},
  ) {
    this.heartbeatInterval = options.heartbeatInterval || 60000;
    this.pruneInterval = options.pruneInterval || 30000;
    this.staleTtl = options.staleTtl || 90000;

    this.deduplicator = new ChallengeDeduplicator((msg) => {
      this.pendingChallenges.push(msg);
      this.challengeListeners.forEach((cb) => cb(msg));
    });
  }

  /**
   * Subscribe to incoming chat messages directed at the current user.
   */
  onChat(callback: (message: ChatMessage) => void): void {
    this.chatListeners.push(callback);
  }

  /**
   * Send a chat message to another user.
   */
  async sendChat(recipientId: string, text: string): Promise<void> {
    await this.nchan.publishChat({
      senderId: this.currentUser.userId,
      recipientId,
      text,
    });
  }

  /**
   * Initializes the lobby by subscribing to presence events and broadcasting "join".
   */
  async join(): Promise<void> {
    if (this.isJoined) return;

    this.subscription = this.nchan.subscribePresence((data) => {
      this.handleIncomingMessage(data);
    });

    this.subscription.onReconnect = () => {
      // Trigger any external reconnect handlers first (e.g., MessagingClient.resumeSession)
      // This allows centralized orchestration to handle state and presence updates.
      this.resumeHeartbeat();
      if (this.options.onReconnect) {
        this.options.onReconnect();
      } else {
        // Fallback: Re-broadcast presence state if no external orchestrator is handling it
        this.nchan.publishPresence(this.currentUser).catch((_e) => {
          console.error("Failed to re-broadcast presence on reconnect:", _e);
        });
      }
    };

    await this.subscription.ready;

    // Broadcast our own presence
    await this.nchan.publishPresence(this.currentUser);

    this.startHeartbeat();
    this.startPruning();
    this.isJoined = true;
  }

  /**
   * Pauses the heartbeat timer (e.g. when tab is hidden).
   */
  pauseHeartbeat(): void {
    this.stopHeartbeat();
  }

  /**
   * Resumes the heartbeat timer (e.g. when tab becomes visible).
   */
  resumeHeartbeat(): void {
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.syncPresence({ type: "heartbeat" });
      } catch (_e) {
        console.error("Failed to send heartbeat:", _e);
      }
    }, this.heartbeatInterval);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private startPruning(): void {
    this.stopPruning();
    this.pruneTimer = setInterval(() => {
      const now = Date.now();
      let changed = false;

      for (const [userId, user] of this.users.entries()) {
        if (userId === this.currentUser.userId) continue;

        const lastSeen = user.meta!.ts;
        if (now - lastSeen > this.staleTtl) {
          this.users.delete(userId);
          changed = true;
        }
      }

      if (changed) {
        this.notifyListeners();
      }
    }, this.pruneInterval);
    this.pruneTimer.unref?.();
  }

  private stopPruning(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
  }

  /**
   * Emits the current list of online users whenever it changes.
   */
  onUsersChange(callback: (users: PresenceMessage[]) => void): void {
    this.listeners.push(callback);
    // Immediate emit of current state to the new listener
    callback(this.getUsersList());
  }

  /**
   * Stop listening to user changes.
   */
  offUsersChange(callback: (users: PresenceMessage[]) => void): void {
    this.listeners = this.listeners.filter((l) => l !== callback);
  }

  /**
   * Allows updating the current user's status (e.g. name or playing state).
   */
  async updatePresence(update: Partial<PresenceMessage>): Promise<void> {
    this.currentUser = { ...this.currentUser, ...update };
    await this.syncPresence();
  }

  /**
   * Proactively re-publishes the current presence state to the lobby.
   * Useful for session restoration or ensuring state synchronization.
   */
  async syncPresence(update: Partial<PresenceMessage> = {}): Promise<void> {
    this.presenceMessageCount++;
    if (this.presenceMessageCount >= 120) {
      await this.leave();
      return;
    }
    await this.nchan.publishPresence({
      ...this.currentUser,
      ...update,
    });
  }

  /**
   * Challenge another user to a game.
   * Returns the ID of the table created for the challenge.
   */
  async challenge(
    userId: string,
    ruleType: string,
    rematch?: RematchInfo,
    options?: Record<string, string>,
  ): Promise<string> {
    const tableId = getUID();
    await this.nchan.publishChallenge({
      type: "offer",
      challengerId: this.currentUser.userId,
      challengerName: this.currentUser.userName,
      recipientId: userId,
      ruleType,
      tableId,
      rematch,
      options,
    });
    return tableId;
  }

  /**
   * Accept an incoming challenge.
   * Returns the Table instance for the accepted game.
   */
  async acceptChallenge(
    userId: string,
    ruleType: string,
    tableId: string,
    options?: Record<string, string>,
  ): Promise<Table> {
    await this.nchan.publishChallenge({
      type: "accept",
      challengerId: this.currentUser.userId,
      challengerName: this.currentUser.userName,
      recipientId: userId,
      ruleType,
      tableId,
      options,
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
  async declineChallenge(userId: string, ruleType: string): Promise<void> {
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
  async cancelChallenge(userId: string, ruleType: string): Promise<void> {
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
   * Delivers any pending challenges that were received while disconnected.
   */
  onChallenge(callback: (challenge: ChallengeMessage) => void): void {
    this.challengeListeners.push(callback);
    this.pendingChallenges.forEach((challenge) => callback(challenge));
  }

  /**
   * Gracefully leaves the lobby.
   */
  async leave(options: { isTeardown?: boolean } = {}): Promise<void> {
    this.stopHeartbeat();
    this.stopPruning();
    this.subscription?.stop();

    try {
      await this.nchan.publishPresence(
        {
          ...this.currentUser,
          type: "leave",
        },
        { keepalive: options.isTeardown },
      );
    } catch (e) {
      console.error("Error leaving lobby:", e);
    }

    this.users.clear();
    this.pendingChallenges = [];
    this.deduplicator.clear();
    this.notifyListeners();
    this.isJoined = false;
  }

  private handleIncomingMessage(data: string): void {
    const rawMsg = parseMessage<any>(data);
    if (!rawMsg) return;

    if (rawMsg.messageType === "presence") {
      this.handlePresenceUpdate(rawMsg as PresenceMessage);
    } else if (rawMsg.messageType === "challenge") {
      this.handleChallenge(rawMsg as ChallengeMessage);
    } else if (rawMsg.messageType === "chat") {
      this.handleChat(rawMsg as ChatMessage);
    }
  }

  /**
   * Handles incoming presence updates.
   * Note: Nchan guarantees ordered delivery, so we don't need to check meta.ts for ordering.
   * The last message received for each userId will be the current state.
   */
  private handlePresenceUpdate(msg: PresenceMessage): void {
    if (msg.type === "leave") {
      this.users.delete(msg.userId);
    } else {
      this.users.set(msg.userId, msg);
    }
    this.notifyListeners();
  }

  private handleChallenge(msg: ChallengeMessage): void {
    // Deduplicator tracks state from ALL challenge interactions (offer, accept, decline, cancel)
    this.deduplicator.processMessage(msg, this.currentUser.userId);
  }

  private handleChat(msg: ChatMessage): void {
    if (msg.recipientId === this.currentUser.userId) {
      this.chatListeners.forEach((cb) => cb(msg));
    }
  }

  private notifyListeners(): void {
    const list = this.getUsersList();
    this.listeners.forEach((cb) => cb(list));
  }

  private getUsersList(): PresenceMessage[] {
    return Array.from(this.users.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }
}
