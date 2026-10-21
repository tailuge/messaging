import { NchanClient, Subscription } from "./nchanclient";
import {
  PresenceMessage,
  ChallengeMessage,
  parseMessage,
  ChatMessage,
} from "./types";
import { getUID } from "./utils/uid";
import { MessageDeduplicator, AUTO_LEAVE_REJOIN_GRACE_MS } from "./MessageDeduplicator";

export interface LobbyOptions {
  heartbeatInterval?: number;
  onReconnect?: () => void;
  onLeave?: () => void;
  /**
   * Invoked after an outgoing challenge offer is published. Fires for every
   * human-originated offer (lobby and arena); bot challenges never reach the
   * library. Not awaited, so it cannot block or fail the challenge.
   */
  onChallengeSent?: (challenge: {
    challengeeId: string;
    ruleType: string;
    tableId: string;
  }) => void | Promise<void>;
  /**
   * Invoked after an outgoing challenge accept is published, before the presence
   * update. Fires for every human-originated accept (lobby and arena). Not
   * awaited, so it cannot block or fail the accept.
   */
  onChallengeAccepted?: (challenge: {
    challengerId: string;
    ruleType: string;
    tableId: string;
  }) => void | Promise<void>;
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

  // Join window: frames are buffered until the snapshot is applied, then settle
  private isJoining = false;
  private settledListeners: (() => void)[] = [];
  private isSettled = false;
  private joinBufferedPresence: PresenceMessage[] = [];
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
    this.isJoining = true;

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
        this.nchan
          .publishPresence({ ...this.currentUser, clientTs: Date.now() })
          .then(() => this.refreshSnapshot())
          .catch((_e) => {
            console.error("Failed to re-broadcast presence on reconnect:", _e);
          });
      }
    };

    await this.subscription.ready;

    // Broadcast our own presence with retry on failure (e.g. slow cold start)
    for (let attempt = 1; ; attempt++) {
      try {
        await this.nchan.publishPresence({ ...this.currentUser, clientTs: Date.now() });
        break;
      } catch (e) {
        const delay = Math.min(Math.pow(2, attempt) * 4000, 30000);
        console.warn(`[Lobby] Initial presence publish failed (attempt ${attempt}), retrying in ${delay}ms:`, e);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Snapshot is the initial state. If it fails, keep whatever is buffered and settle anyway.
    const snapshot = await this.fetchSnapshot();
    if (snapshot) this.setUsers(snapshot.users);

    // Drain buffered frames. With a snapshot, drop frames it already reflects (server clock only),
    // so a replayed join for someone who has since left cannot resurrect them.
    const buffered = this.joinBufferedPresence;
    this.joinBufferedPresence = [];
    for (const msg of buffered) {
      if (snapshot && (msg.meta?.ts ?? 0) <= snapshot.ts) continue;
      this.applyPresence(msg);
    }

    this.isJoining = false;
    this.fireSettled();
    this.startHeartbeat();
    this.isJoined = true;
  }

  /**
   * Replaces the users map with the server's current snapshot. A failed fetch keeps the
   * current map; live presence frames repair it.
   */
  async refreshSnapshot(): Promise<void> {
    const snapshot = await this.fetchSnapshot();
    if (snapshot) this.setUsers(snapshot.users);
  }

  private async fetchSnapshot(): Promise<{ ts: number; users: PresenceMessage[] } | null> {
    try {
      return await this.nchan.fetchPresenceSnapshot();
    } catch (e) {
      console.warn("[Lobby] Presence snapshot failed:", e);
      return null;
    }
  }

  private setUsers(list: PresenceMessage[]): void {
    this.users = new Map(list.map((u) => [u.userId, u]));
    this.notifyListeners();
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
   * Whether join() has applied the snapshot and drained buffered frames.
   */
  public get settled(): boolean {
    return this.isSettled;
  }

  /**
   * Registers a callback that fires once join() has applied the snapshot and drained
   * buffered frames. Fires exactly once per join(). If already settled, fires immediately.
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
   * Returns the current list of online users.
   * For testing purposes and convenience.
   */
  public getUsers(): PresenceMessage[] {
    return this.getUsersList();
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
    // Cap a presence session at ~1 hour of heartbeats (60 x 60s) so a tab that
    // is left open without activity stops publishing rather than holding a
    // slot in the lobby indefinitely.
    if (this.presenceMessageCount >= 60) {
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
   * Invokes an optional hook without letting a throwing or rejecting callback
   * affect the challenge flow. These callbacks are for analytics, so a failure
   * is logged once and swallowed rather than surfaced to the caller.
   */
  private safeEmit(name: string, emit: () => void | Promise<void>): void {
    try {
      const result = emit();
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((e) =>
          console.error(`[Lobby] ${name} hook failed:`, e),
        );
      }
    } catch (e) {
      console.error(`[Lobby] ${name} hook failed:`, e);
    }
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
    custom?: Record<string, unknown>,
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
      custom,
    });

    // Centralised usage hook: fires for lobby and arena offers alike. A failing
    // callback is logged, never surfaced, so analytics cannot break the challenge.
    this.safeEmit("onChallengeSent", () =>
      this.options.onChallengeSent?.({ challengeeId: userId, ruleType, tableId }),
    );
    return tableId;
  }

  /**
   * Accept an incoming challenge.
   * Publishes the accept message and updates presence to show we've joined the table.
   * The table itself is joined separately via MessagingClient.joinTable() with the
   * same tableId (which is just a client-generated channel id, not a server entity).
   */
  async acceptChallenge(
    userId: string,
    ruleType: string,
    tableId: string,
    options?: Record<string, string>,
    challengerName?: string,
    nextTurnId?: string,
    custom?: Record<string, unknown>,
  ): Promise<void> {
    await this.nchan.publishChallenge({
      type: "accept",
      challengerId: userId,
      challengerName: challengerName ?? userId,
      challengeeId: this.currentUser.userId,
      ruleType,
      tableId,
      options,
      nextTurnId,
      custom,
    });

    // Centralised usage hook: fired before the presence update so an analytics
    // callback (e.g. a usage PUT) overlaps that round-trip and gets a head start
    // before the caller redirects to the game.
    this.safeEmit("onChallengeAccepted", () =>
      this.options.onChallengeAccepted?.({ challengerId: userId, ruleType, tableId }),
    );

    // Automatically update our presence to show we've joined the table
    await this.updatePresence({ tableId, ruleType, options });
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
   * fields are "meaningful" (e.g. userName, tableId, arenaId) vs "noise" (e.g. meta.ts heartbeats).
   */
  private handlePresenceUpdate(msg: PresenceMessage): void {
    if (this.isJoining) {
      this.joinBufferedPresence.push(msg);
      return;
    }
    this.applyPresence(msg);
  }

  /**
   * Applies a single presence message to the users map and notifies listeners.
   * Extracted so fireSettled can replay deduplicated presence messages.
   */
  private applyPresence(msg: PresenceMessage): void {
    const existing = this.users.get(msg.userId);

    if (msg.type === "leave") {
      if (this.shouldIgnoreAutoLeave(msg, existing)) return;
      if (existing) {
        this.users.delete(msg.userId);
        this.notifyListeners();
      }
    } else if (msg.type === "join") {
      // Ensure joins are never removed by deduplication
      if (!this.users.has(msg.userId) || this.users.get(msg.userId)?.type === "leave") {
        this.users.set(msg.userId, msg);
        this.notifyListeners();
      }
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
    // During join, buffer challenges so dedupe can drop offers that were already
    // resolved (accept/decline/cancel) in the same replayed window.
    if (this.isJoining) {
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

  /**
   * Returns true when an internal Nchan auto-leave should be ignored because
   * it arrived too soon after a fresh user join, making it likely stale
   * cleanup for the previous connection rather than a real departure.
   */
  private shouldIgnoreAutoLeave(msg: PresenceMessage, existing?: PresenceMessage): boolean {
    if (!existing) return false;
    if (msg.type !== "leave") return false;
    if (msg.meta?.origin !== "internal") return false;
    if (existing.type === "leave") return false;

    const leaveTs = msg.meta?.ts;
    const existingTs = existing.meta?.ts ?? existing.clientTs;
    if (leaveTs === undefined || existingTs === undefined) return false;

    return leaveTs >= existingTs && leaveTs - existingTs <= AUTO_LEAVE_REJOIN_GRACE_MS;
  }

  private hasMeaningfulChange(oldMsg: PresenceMessage, nextMsg: PresenceMessage): boolean {
    return (
      oldMsg.userName !== nextMsg.userName ||
      oldMsg.tableId !== nextMsg.tableId ||
      oldMsg.arenaId !== nextMsg.arenaId ||
      oldMsg.ruleType !== nextMsg.ruleType ||
      oldMsg.opponentId !== nextMsg.opponentId ||
      JSON.stringify(oldMsg.seek) !== JSON.stringify(nextMsg.seek) ||
      JSON.stringify(oldMsg.options) !== JSON.stringify(nextMsg.options)
    );
  }

  /**
   * Fires all onSettled listeners and emits the deduplicated buffered challenges.
   */
  private fireSettled(): void {
    if (this.isSettled) return;
    this.isSettled = true;

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
    this.isJoining = false;
    this.isSettled = false;
    this.settledListeners = [];
    this.unsettledChallengeMessages = [];
    this.joinBufferedPresence = [];
  }
}
