import { NchanClient } from "./nchanclient";
import { Lobby, LobbyOptions } from "./lobby";
import { Table } from "./table";
import { PresenceMessage } from "./types";

/**
 * The main messaging client library entry point.
 * Encapsulates transport logic and provides access to lobby and table functionality.
 */
export class MessagingClient {
  private nchan: NchanClient;
  private activeLobbies: Lobby[] = [];
  private activeTables: Table[] = [];
  private lastLobbyConfig?: { user: PresenceMessage; options?: LobbyOptions };
  private isStopping = false;

  constructor(options: { baseUrl: string }) {
    this.nchan = new NchanClient(options.baseUrl);
  }

  /**
   * Initializes the client and ensures connection readiness.
   * In browser environments, attaches lifecycle event listeners.
   */
  async start(): Promise<void> {
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.handlePageHide);
      window.addEventListener("pageshow", this.handlePageShow);
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  /**
   * Stops all active connections and cleans up.
   */
  async stop(options: { isTeardown?: boolean } = {}): Promise<void> {
    if (this.isStopping) return;
    this.isStopping = true;

    try {
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", this.handlePageHide);
        window.removeEventListener("pageshow", this.handlePageShow);
        document.removeEventListener("visibilitychange", this.handleVisibilityChange);
      }

      const lobbies = [...this.activeLobbies];
      this.activeLobbies = [];
      await Promise.all(lobbies.map((lobby) => lobby.leave(options)));

      const tables = [...this.activeTables];
      this.activeTables = [];
      // Use for loop to await each table leave
      for (const table of tables) {
        await table.leave(options);
      }
    } finally {
      this.isStopping = false;
    }
  }

  /**
   * Enters the global lobby for presence broadcasting and tracking.
   */
  async joinLobby(user: PresenceMessage, options?: LobbyOptions): Promise<Lobby> {
    // Prevent duplicate joins if already in a lobby for this user
    const existing = this.activeLobbies.find((l) => l.currentUser.userId === user.userId);
    if (existing) return existing;

    this.lastLobbyConfig = { user, options };
    const lobby = new Lobby(this.nchan, user, options);
    await lobby.join();
    this.activeLobbies.push(lobby);
    return lobby;
  }

  /**
   * Joins a specific table for communication.
   */
  async joinTable<T = any>(tableId: string, userId: string): Promise<Table<T>> {
    let table = this.activeTables.find((t) => t.tableId === tableId) as Table<T>;

    if (!table) {
      const lobby = this.activeLobbies.find((l) => l.currentUser.userId === userId);
      if (!lobby) {
        throw new Error(`Cannot join table: No active lobby found for user ${userId}`);
      }

      table = new Table<T>(this.nchan, tableId, userId, lobby);
      await table.join();
      this.activeTables.push(table);

      await lobby.updatePresence({ tableId });
    } else {
      await table.join();
    }

    return table;
  }

  private handlePageHide = (): void => {
    // Stop all connections on page hide (prevent ghosting)
    // Non-blocking call because pagehide might terminate the process
    this.stop({ isTeardown: true });
  };

  private handlePageShow = (event: PageTransitionEvent): void => {
    // If returning via bfcache, restore connections
    if (event.persisted && this.lastLobbyConfig) {
      this.joinLobby(this.lastLobbyConfig.user, this.lastLobbyConfig.options);
    }
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.activeLobbies.forEach((l) => l.pauseHeartbeat());
    } else {
      this.activeLobbies.forEach((l) => l.resumeHeartbeat());
    }
  };
}
