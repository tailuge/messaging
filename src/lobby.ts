import { NchanClient, Subscription } from "./nchanclient";
import {
  PresenceMessage,
  ChallengeMessage,
  parseMessage,
  ChatMessage,
} from "./types";
import { Table } from "./table";
import { getUID } from "./utils/uid";

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
  // Buffered challenge messages during unsettled period, deduped on settle
  private unsettledChallengeMessages: ChallengeMessage[] = [];

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

    // Sentinel detection: our own join message with matching clientTs
    // means the Nchan buffer replay is complete (FIFO guarantee).
    if (
      !this.isSettled &&
      this.joinSentinelTs !== null &&
      msg.userId === this.currentUser.userId &&
      msg.type === "join" &&
      msg.clientTs === this.joinSentinelTs
    ) {
      this.fireSettled();
    }
  }

  private handleChallenge(msg: ChallengeMessage): void {
    // During the unsettled period (Nchan buffer replay), buffer all challenge
    // messages so we can dedup them when settle fires. This prevents stale
    // offers from being emitted when a resolution (accept/decline/cancel)
    // arrives later in the same buffer replay.
    if (!this.isSettled) {
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
   * Fires all onSettled listeners and replays deduplicated challenge messages.
   * Called immediately when the sentinel is detected.
   *
   * Uses a two-pass approach over buffered challenge messages:
   * Pass 1: collect all resolved interaction keys (accept/decline/cancel).
   * Pass 2: emit offers only for unresolved interactions, plus all
   *         non-offer messages that are relevant to the current user.
   *
   * This handles the case where a resolution message (e.g. accept) arrives
   * after its corresponding offer during Nchan buffer replay (FIFO ordering).
   */
  private fireSettled(): void {
    if (this.isSettled) return;
    this.isSettled = true;

    // Pass 1: collect resolved interaction keys
    const resolvedInteractions = new Set<string>();
    for (const msg of this.unsettledChallengeMessages) {
      if (msg.type !== "offer") {
        const key = [msg.challengerId, msg.challengeeId].sort().join(':');
        resolvedInteractions.add(key);
      }
    }

    // Pass 2: emit unresolved offers + relevant non-offer messages
    for (const msg of this.unsettledChallengeMessages) {
      const key = [msg.challengerId, msg.challengeeId].sort().join(':');
      if (msg.type === "offer") {
        if (!resolvedInteractions.has(key)) {
          this.emitIfRelevant(msg);
        }
      } else {
        // accept, decline, cancel
        this.emitIfRelevant(msg);
      }
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
  }
}
