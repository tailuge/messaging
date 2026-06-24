import { NchanClient, Subscription } from "./nchanclient";
import {
  PresenceMessage,
  ChallengeMessage,
  parseMessage,
  ChatMessage,
} from "./types";
import { Table } from "./table";
import { getUID } from "./utils/uid";
import { MessageDeduplicator } from "./MessageDeduplicator";

export interface LobbyOptions {
  heartbeatInterval?: number;
  onReconnect?: () => void;
  onLeave?: () => void;
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
  private subscription: Subscription | null = null;
  private isJoined = false;

  private heartbeatTimer?: any;
  private presenceMessageCount = 0;

  // Settle detection: sentinel-based replay completion
  private joinSentinelTs: number | null = null;
  private settledListeners: (() => void)[] = [];
  private isSettled = false;
  // Buffered messages during unsettled period (Nchan buffer replay), deduped on settle
  private unsettledChallengeMessages: ChallengeMessage[] = [];
  private unsettledPresenceMessages: PresenceMessage[] = [];

  private readonly heartbeatInterval: number;

  constructor(
    private nchan: NchanClient,
    public currentUser: PresenceMessage,
    private options: LobbyOptions = {},
  ) {
    this.heartbeatInterval = options.heartbeatInterval || 60000;
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

    this.subscription = this.nchan.subscribePresence(this.currentUser.userId, (data) => {
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
        this.nchan.publishPresence({ ...this.currentUser, clientTs: Date.now() }).catch((_e) => {
          console.error("Failed to re-broadcast presence on reconnect:", _e);
        });
      }
    };

    await this.subscription.ready;

    // Broadcast our own presence with retry on failure (e.g. slow cold start)
    // Capture the clientTs to use as a sentinel for Nchan buffer replay completion.
    for (let attempt = 1; ; attempt++) {
      try {
        const sentinelTs = Date.now();
        await this.nchan.publishPresence({
          ...this.currentUser,
          clientTs: sentinelTs,
        });
        this.joinSentinelTs = sentinelTs;
        break;
      } catch (e) {
        const delay = Math.min(Math.pow(2, attempt) * 4000, 30000);
        console.warn(`[Lobby] Initial presence publish failed (attempt ${attempt}), retrying in ${delay}ms:`, e);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    this.startHeartbeat();
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
    let firstTick = true;
    const schedule = () => {
      this.heartbeatTimer = setTimeout(async () => {
        try {
          await this.syncPresence({ type: "heartbeat" });
        } catch (_e) {
          console.error("Failed to send heartbeat:", _e);
        }
        if (this.heartbeatTimer !== undefined) schedule();
      }, firstTick ? 3000 : this.heartbeatInterval);
      this.heartbeatTimer.unref?.();
      firstTick = false;
    };
    schedule();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Whether the lobby has finished replaying buffered Nchan messages and
   * caught up to realtime. True once the sentinel is detected.
   */
  public get settled(): boolean {
    return this.isSettled;
  }

  /**
   * Registers a callback that fires when the lobby has caught up to realtime
   * after Nchan buffer replay. The sentinel is our own join presence message
   * with a matching clientTs, which Nchan delivers after all buffered messages
   * (FIFO guarantee). The callback fires immediately on sentinel detection.
   *
   * Fires exactly once per join(). If already settled, fires immediately.
   */
  onSettled(callback: () => void): void {
    if (this.isSettled) {
      callback();
    } else {
      this.settledListeners.push(callback);
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
      clientTs: Date.now(),
    });
  }

  /**
   * Challenge another user to a game.
   * Returns the ID of the table created for the challenge.
   */
  async challenge(
    userId: string,
    ruleType: string,
    options?: Record<string, string>,
    nextTurnId?: string,
  ): Promise<string> {
    const tableId = getUID();
    await this.nchan.publishChallenge({
      type: "offer",
      challengerId: this.currentUser.userId,
      challengerName: this.currentUser.userName,
      challengeeId: userId,
      ruleType,
      tableId,
      options,
      nextTurnId,
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
    challengerName?: string,
    nextTurnId?: string,
  ): Promise<Table> {
    await this.nchan.publishChallenge({
      type: "accept",
      challengerId: userId,
      challengerName: challengerName ?? userId,
      challengeeId: this.currentUser.userId,
      ruleType,
      tableId,
      options,
      nextTurnId,
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
  async declineChallenge(userId: string, ruleType: string, challengerName?: string): Promise<void> {
    await this.nchan.publishChallenge({
      type: "decline",
      challengerId: userId,
      challengerName: challengerName ?? userId,
      challengeeId: this.currentUser.userId,
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
      challengeeId: userId,
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
    this.subscription?.stop();

    try {
      await this.nchan.publishPresence(
        { ...this.currentUser, type: "leave", clientTs: Date.now() },
        { keepalive: options.isTeardown },
      );
    } catch (e) {
      console.error("Error leaving lobby:", e);
    }

    this.users.clear();
    this.pendingChallenges = [];
    this.presenceMessageCount = 0;
    this.clearSettleState();
    this.notifyListeners();
    this.isJoined = false;
    this.options.onLeave?.();
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
   *
   * We deduplicate notifications here because the Lobby has domain knowledge of which
   * fields are "meaningful" (e.g. userName, tableId) vs "noise" (e.g. meta.ts heartbeats).
   */
  private handlePresenceUpdate(msg: PresenceMessage): void {
    // Only buffer during an active join cycle (sentinel published, waiting for echo).
    // If joinSentinelTs is null (tests bypassing join, or pre-join), apply directly.
    if (!this.isSettled && this.joinSentinelTs !== null) {
      this.unsettledPresenceMessages.push(msg);
      if (
        msg.userId === this.currentUser.userId &&
        msg.type === "join" &&
        msg.clientTs === this.joinSentinelTs
      ) {
        this.fireSettled();
      }
      return;
    }

    // Settled path (or no join cycle in progress): apply presence directly
    this.applyPresence(msg);
  }

  /**
   * Applies a single presence message to the users map and notifies listeners.
   * Extracted so fireSettled can replay deduplicated presence messages.
   */
  private applyPresence(msg: PresenceMessage): void {
    const existing = this.users.get(msg.userId);

    if (msg.type === "leave") {
      if (existing) {
        this.users.delete(msg.userId);
        this.notifyListeners();
      }
    } else if (msg.type === "join") {
      this.users.set(msg.userId, msg);
      this.notifyListeners();
    } else {
      // Heartbeat or other update
      const changed = !existing || this.hasMeaningfulChange(existing, msg);
      this.users.set(msg.userId, msg);
      if (changed) {
        this.notifyListeners();
      }
    }
  }

  private handleChallenge(msg: ChallengeMessage): void {
    // During the unsettled period (Nchan buffer replay), buffer all challenge
    // messages so we can dedup them when settle fires. This prevents stale
    // offers from being emitted when a resolution (accept/decline/cancel)
    // arrives later in the same buffer replay.
    // Only buffer when actively in a join cycle (sentinel published, waiting for echo).
    if (!this.isSettled && this.joinSentinelTs !== null) {
      this.unsettledChallengeMessages.push(msg);
      return;
    }

    // Settled path: filter and emit directly
    this.emitIfRelevant(msg);
  }

  /**
   * Emits a challenge message if the current user is the intended recipient.
   */
  private emitIfRelevant(msg: ChallengeMessage): void {
    if (msg.type === "offer") {
      if (msg.challengeeId === this.currentUser.userId) {
        this.emitChallenge(msg);
      }
    } else if (msg.type === "cancel") {
      if (msg.challengeeId === this.currentUser.userId) {
        this.emitChallenge(msg);
      }
    } else {
      // accept, decline
      if (msg.challengerId === this.currentUser.userId) {
        this.emitChallenge(msg);
      }
    }
  }

  private emitChallenge(msg: ChallengeMessage): void {
    this.pendingChallenges.push(msg);
    this.challengeListeners.forEach((cb) => cb(msg));
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
    return Array.from(this.users.values()).sort((a, b) =>
      a.userName.localeCompare(b.userName),
    );
  }

  private hasMeaningfulChange(oldMsg: PresenceMessage, nextMsg: PresenceMessage): boolean {
    return (
      oldMsg.userName !== nextMsg.userName ||
      oldMsg.tableId !== nextMsg.tableId ||
      oldMsg.ruleType !== nextMsg.ruleType ||
      oldMsg.opponentId !== nextMsg.opponentId ||
      JSON.stringify(oldMsg.seek) !== JSON.stringify(nextMsg.seek)
    );
  }

  /**
   * Fires all onSettled listeners and replays deduplicated messages.
   * Called immediately when the sentinel is detected.
   *
   * Delegates dedup to MessageDeduplicator, then replays the results:
   *   - Presence: applied via applyPresence (updates users map + notifies).
   *   - Challenges: emitted via emitIfRelevant if relevant to current user.
   */
  private fireSettled(): void {
    if (this.isSettled) return;
    this.isSettled = true;

    // Dedup and replay presence (per-userId last-message-wins)
    const presenceMessages = MessageDeduplicator.dedupePresence(this.unsettledPresenceMessages);
    for (const msg of presenceMessages) {
      this.applyPresence(msg);
    }
    this.unsettledPresenceMessages = [];

    // Dedup and replay challenges (offer+resolution → no-op)
    const challengeMessages = MessageDeduplicator.dedupeChallenges(this.unsettledChallengeMessages);
    for (const msg of challengeMessages) {
      this.emitIfRelevant(msg);
    }
    this.unsettledChallengeMessages = [];

    const listeners = [...this.settledListeners];
    this.settledListeners = [];
    for (const cb of listeners) {
      cb();
    }
  }

  /**
   * Resets all settle-related state. Called on leave().
   */
  private clearSettleState(): void {
    this.joinSentinelTs = null;
    this.isSettled = false;
    this.settledListeners = [];
    this.unsettledChallengeMessages = [];
    this.unsettledPresenceMessages = [];
  }
}
