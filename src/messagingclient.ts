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
  private isStarted = false;

  constructor(options: { baseUrl: string }) {
    this.nchan = new NchanClient(options.baseUrl);
  }

  /**
   * Initializes the client and ensures connection readiness.
   * In browser environments, attaches lifecycle event listeners.
   */
  async start(): Promise<void> {
    if (this.isStarted) return;

    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.handlePageHide);
      window.addEventListener("pageshow", this.handlePageShow);
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
    this.isStarted = true;
  }

  /**
   * Stops all active connections and cleans up.
   */
  async stop(): Promise<void> {
    if (!this.isStarted) return;

    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.handlePageHide);
      window.removeEventListener("pageshow", this.handlePageShow);
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }

    const lobbies = [...this.activeLobbies];
    this.activeLobbies = [];
    await Promise.all(lobbies.map((lobby) => lobby.leave()));

    const tables = [...this.activeTables];
    this.activeTables = [];
    for (const table of tables) {
      await table.leave();
    }

    this.isStarted = false;
  }

  /**
   * Enters the global lobby for presence broadcasting and tracking.
   */
  async joinLobby(user: PresenceMessage, options?: LobbyOptions): Promise<Lobby> {
    if (!this.isStarted) {
      await this.start();
    }

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
    if (!this.isStarted) {
      await this.start();
    }

    let table = this.activeTables.find((t) => t.tableId === tableId) as Table<T>;

    if (!table) {
      const lobby = this.activeLobbies.find((l) => l.currentUser.userId === userId);
      table = new Table<T>(this.nchan, tableId, userId, lobby);
      this.activeTables.push(table);

      if (lobby) {
        await lobby.updatePresence({ tableId });
      }
    }

    await table.join();
    return table;
  }

  private handlePageHide = (): void => {
    // Stop all connections on page hide (prevent ghosting)
    this.stop();
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
