import { NchanClient, Subscription } from "./nchanclient";
import { TableMessage, TableLeaveData, isSpectatorTableLeave, parseMessage, PresenceMessage } from "./types";
import { Lobby } from "./lobby";

/**
 * Represents a specific communication channel for a 2-player/spectator scenario at a table.
 * Uses `any` as default for internal storage flexibility; consumers should use `unknown` or specific types.
 */
export class Table<T = any> {
  private subscription: Subscription | null = null;
  private isJoined = false;
  private messageListeners: ((event: TableMessage<T>) => void)[] = [];
  private spectatorListeners: ((spectators: PresenceMessage[]) => void)[] = [];
  private opponentLeftListeners: (() => void)[] = [];
  public opponentLeft = false;

  constructor(
    private nchan: NchanClient,
    public readonly tableId: string,
    private userId: string,
    private lobby?: Lobby,
    private isSpectator = false,
  ) {}

  /**
   * Initializes the table by subscribing to its specific channel.
   */
  async join(): Promise<void> {
    this.subscription = this.nchan.subscribeTable(
      this.tableId,
      this.userId,
      (data) => {
        this.handleIncomingMessage(data);
      },
      { isSpectator: this.isSpectator },
    );
    await this.subscription.ready;
    this.isJoined = true;
  }

  /**
   * Broadcast an event to all participants at the table.
   */
  async publish(type: string, data: T): Promise<void> {
    await this.nchan.publishTable(this.tableId, { type, data }, this.userId);
  }

  /**
   * Subscribe to events published by other participants.
   */
  onMessage(callback: (event: TableMessage<T>) => void): void {
    this.messageListeners.push(callback);
  }

  /**
   * Subscribe to opponent departure (explicit leave or timeout).
   */
  onOpponentLeft(callback: () => void): void {
    this.opponentLeftListeners.push(callback);
    if (this.opponentLeft) {
      callback();
    }
  }

  /**
   * Subscribe to changes in the spectator list.
   * Note: In a real implementation, this would track presence messages on the table channel.
   */
  onSpectatorChange(callback: (spectators: PresenceMessage[]) => void): void {
    this.spectatorListeners.push(callback);
  }

  /**
   * Leave the table and stop all subscriptions.
   */
  async leave(options: { isTeardown?: boolean } = {}): Promise<void> {
    // Only send leave message on explicit user action, not on page hide/teardown
    if (!options.isTeardown) {
      try {
        await this.nchan.publishTable(
          this.tableId,
          {
            type: "table:leave",
            data: (this.isSpectator ? { isSpectator: true } : {}) as T & TableLeaveData,
          },
          this.userId,
        );
        // Small delay to ensure message is dispatched before closing the socket
        await new Promise((r) => setTimeout(r, 100));
      } catch (e) {
        console.error("Error leaving table:", e);
      }
    }

    // Clear lobby presence if we have one
    if (this.lobby) {
      await this.lobby.updatePresence({ tableId: undefined });
    }

    this.subscription?.stop();
    this.messageListeners = [];
    this.spectatorListeners = [];
    this.opponentLeftListeners = [];
    this.isJoined = false;
  }

  private handleIncomingMessage(data: string): void {
    const msg = parseMessage<TableMessage<T>>(data);
    if (!msg || !msg.type) return;

    // Handle system messages internally
    if (msg.type === "table:leave" && msg.senderId !== this.userId && !isSpectatorTableLeave(msg)) {
      this.notifyOpponentLeft();
    }

    // Notify message listeners
    this.messageListeners.forEach((cb) => cb(msg));
  }

  private notifyOpponentLeft(): void {
    if (this.opponentLeft) return; // Only notify once
    this.opponentLeft = true;
    this.opponentLeftListeners.forEach((cb) => cb());
  }
}
