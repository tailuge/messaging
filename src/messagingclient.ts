import { NchanClient } from "./nchanclient";
import { Lobby, LobbyOptions } from "./lobby";
import { Table } from "./table";
import { PresenceMessage, TableMessage } from "./types";

/**
 * The main messaging client library entry point.
 * Encapsulates transport logic and provides access to lobby and table functionality.
 */
export class MessagingClient {
  private nchan: NchanClient;
  private activeLobbies: Lobby[] = [];
  private lobbyInstances: Map<string, Lobby> = new Map();
  private activeTables: Table[] = [];
  /** In-flight joinTable() operations keyed by session identity (tableId|userId|role). */
  private joiningTables: Map<
    string,
    { tableId: string; userId: string; isSpectator: boolean; promise: Promise<Table<any>> }
  > = new Map();
  private lobbyConfigs: Map<string, { user: PresenceMessage; options?: LobbyOptions }> = new Map();
  private isStopping = false;
  private isStarted = false;
  private listenersAttached = false;

  private resumePromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private joiningLobbies: Map<string, Promise<Lobby>> = new Map();

  constructor(options: { baseUrl: string; nchan?: NchanClient }) {
    this.nchan = options.nchan ?? new NchanClient(options.baseUrl);
  }

  /**
   * Sets a global software version string that will be attached to all outgoing messages.
   */
  setVersion(version: string): void {
    this.nchan.setVersion(version);
  }

  /**
   * Returns raw messages recorded by the underlying NchanClient for debugging.
   */
  get recordedMessages(): string[] {
    return this.nchan.recordedMessages;
  }

  /**
   * Initializes the client and ensures connection readiness.
   * In browser environments, attaches lifecycle event listeners.
   */
  start(): void {
    if (typeof window !== "undefined" && !this.listenersAttached) {
      window.addEventListener("pagehide", this.handlePageHide);
      window.addEventListener("pageshow", this.handlePageShow);
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.listenersAttached = true;
    }
    if (this.isStarted) return;
    this.isStarted = true;
  }

  /**
   * Stops all active connections and cleans up.
   */
  async stop(options: { isTeardown?: boolean } = {}): Promise<void> {
    if (this.stopPromise) return this.stopPromise;

    this.stopPromise = (async () => {
      this.isStopping = true;

      try {
        this.isStarted = false;

        const lobbies = [...this.activeLobbies];
        this.activeLobbies = [];
        await Promise.all(lobbies.map((lobby) => lobby.leave(options)));

        const tables = [...this.activeTables];
        this.activeTables = [];
        // Tables can be left in parallel since each operates independently
        await Promise.all(tables.map((table) => table.leave(options)));
      } finally {
        this.isStopping = false;
        this.stopPromise = null;
      }
    })();

    return this.stopPromise;
  }

  /**
   * Enters the global lobby for presence broadcasting and tracking.
   * Note: Nchan guarantees ordered message delivery, so the Lobby class does not need
   * to implement message ordering or deduplication based on meta.ts timestamps.
   */
  async joinLobby(user: PresenceMessage, options?: LobbyOptions): Promise<Lobby> {
    this.start();

    // Prevent duplicate concurrent joins for the same user
    if (this.joiningLobbies.has(user.userId)) {
      return this.joiningLobbies.get(user.userId)!;
    }

    const joinPromise = (async () => {
      try {
        // Prevent duplicate joins if already in a lobby for this user
        const existing = this.lobbyInstances.get(user.userId);

        let lobbyRef: Lobby | undefined;
        const lobbyOptions: LobbyOptions = {
          ...options,
          onReconnect: () => {
            this.resumeSession().catch((e) =>
              console.error("Session resume failed after lobby reconnect:", e),
            );
            options?.onReconnect?.();
          },
          onLeave: () => {
            const target = lobbyRef ?? existing;
            if (target) {
              const idx = this.activeLobbies.indexOf(target);
              if (idx !== -1) this.activeLobbies.splice(idx, 1);
            }
          },
        };

        this.lobbyConfigs.set(user.userId, { user, options });

        if (existing) {
          existing.currentUser = user;
          await existing.join();
          existing.resumeHeartbeat();
          if (!this.activeLobbies.includes(existing)) {
            this.activeLobbies.push(existing);
          }
          return existing;
        }

        const lobby = new Lobby(this.nchan, user, lobbyOptions);
        lobbyRef = lobby;
        await lobby.join();
        this.lobbyInstances.set(user.userId, lobby);
        this.activeLobbies.push(lobby);
        return lobby;
      } finally {
        this.joiningLobbies.delete(user.userId);
      }
    })();

    this.joiningLobbies.set(user.userId, joinPromise);
    return joinPromise;
  }

  /**
   * Gracefully leaves a lobby.
   */
  async leaveLobby(userId: string): Promise<void> {
    const index = this.activeLobbies.findIndex((l) => l.currentUser.userId === userId);
    if (index !== -1) {
      const lobby = this.activeLobbies[index];
      await lobby.leave();
      this.activeLobbies.splice(index, 1);
    }
    this.lobbyInstances.delete(userId);
    this.lobbyConfigs.delete(userId);
  }

  /**
   * Joins a specific table for communication.
   *
   * Resolves as soon as the session exists; the handshake (subscription ready,
   * `joined` publish, presence update) continues in the background. Concurrent
   * calls for the same session share one operation and one table instance.
   * Same-tableId calls with a different user or role reject before a second
   * session is created.
   */
  async joinTable<T = any>(
    tableId: string,
    userId: string,
    options?: {
      isSpectator?: boolean;
      onMessage?: (event: TableMessage<T>) => void;
      onBothJoined?: () => void;
    },
  ): Promise<Table<T>> {
    const isSpectator = options?.isSpectator ?? false;
    const key = this.tableKey(tableId, userId, isSpectator);

    // Concurrent calls for the same session share one operation.
    const inFlight = this.joiningTables.get(key);
    if (inFlight) return inFlight.promise as Promise<Table<T>>;

    // Same-tableId calls with a different user or role reject before creating a session.
    this.assertNoTableConflict(tableId, userId, isSpectator);

    // Reuse an already-joined session for this identity. Options supplied on
    // this later call do not add listeners (constructor registration only).
    const existing = this.activeTables.find((t) => t.tableId === tableId);
    if (existing) {
      return Promise.resolve(existing as Table<T>);
    }

    const lobby = isSpectator
      ? undefined
      : this.activeLobbies.find((l) => l.currentUser.userId === userId);

    const table = new Table<T>(
      this.nchan,
      tableId,
      userId,
      lobby,
      isSpectator,
      options?.onMessage,
      options?.onBothJoined,
      () => this.removeActiveTable(table),
    );
    this.activeTables.push(table);

    // The session exists — resolve now. The handshake continues in the
    // background so consumers never need a separate initial-connection
    // publish queue.
    const handshake = table.join().catch((e) => {
      console.error(`Table ${tableId} join handshake failed:`, e);
    });
    if (lobby) {
      void handshake.then(async () => {
        if (table.closed) return;
        try {
          await lobby.updatePresence({ tableId });
        } catch (e) {
          console.error("Failed to update presence after table join:", e);
        }
      });
    }

    // Register the in-flight entry *before* the delete (scheduled as a
    // microtask via .finally) so the same-key entry is never stale.
    const joinPromise = Promise.resolve(table).finally(() => {
      this.joiningTables.delete(key);
    });
    this.joiningTables.set(key, { tableId, userId, isSpectator, promise: joinPromise });
    return joinPromise;
  }

  /** Logical session identity for the in-flight join map. */
  private tableKey(tableId: string, userId: string, isSpectator: boolean): string {
    return `${tableId}|${userId}|${isSpectator ? "s" : "p"}`;
  }

  /**
   * Rejects same-tableId joins with a different user or role before a second
   * session can be created within this client instance.
   */
  private assertNoTableConflict(tableId: string, userId: string, isSpectator: boolean): void {
    for (const entry of this.joiningTables.values()) {
      if (entry.tableId === tableId && (entry.userId !== userId || entry.isSpectator !== isSpectator)) {
        throw new Error(
          `Table ${tableId} is already being joined as ` +
            `${entry.isSpectator ? "spectator" : "player"} ${entry.userId}; ` +
            `cannot also join as ${isSpectator ? "spectator" : "player"} ${userId}`,
        );
      }
    }
    for (const t of this.activeTables) {
      if (t.tableId === tableId && (t.userId !== userId || t.isSpectator !== isSpectator)) {
        throw new Error(
          `Table ${tableId} is already joined as ${t.isSpectator ? "spectator" : "player"} ${t.userId}; ` +
            `cannot also join as ${isSpectator ? "spectator" : "player"} ${userId}`,
        );
      }
    }
  }

  /** Lifecycle cleanup: drop a closed table so later joins create a fresh session. */
  private removeActiveTable(table: Table): void {
    const idx = this.activeTables.indexOf(table);
    if (idx !== -1) this.activeTables.splice(idx, 1);
  }

  /**
   * Subscribes to a table as a read-only spectator.
   * Spectator departures do not trigger onOpponentLeft on player clients.
   */
  async spectateTable<T = any>(
    tableId: string,
    userId: string,
    options?: {
      onMessage?: (event: TableMessage<T>) => void;
      onBothJoined?: () => void;
    },
  ): Promise<Table<T>> {
    return this.joinTable(tableId, userId, { ...options, isSpectator: true });
  }

  private handlePageHide = (): void => {
    // Stop all connections on page hide (prevent ghosting)
    // Non-blocking call because pagehide might terminate the process
    this.stop({ isTeardown: true });
  };

  private handlePageShow = async (event: PageTransitionEvent): Promise<void> => {
    // If returning via bfcache, restore connections
    if (event.persisted) {
      await this.resumeSession();
    }
  };

  private handleVisibilityChange = async (): Promise<void> => {
    if (document.visibilityState === "hidden") {
      this.activeLobbies.forEach((l) => l.pauseHeartbeat());
    } else if (document.visibilityState === "visible") {
      await this.resumeSession();
    }
  };

  /**
   * Central orchestrator for session restoration.
   * Ensures connection, lobby joins, and presence sync after a lifecycle event or reconnect.
   */
  async resumeSession(): Promise<void> {
    if (this.resumePromise) return this.resumePromise;

    this.resumePromise = (async () => {
      try {
        if (this.stopPromise) {
          await this.stopPromise;
        }

        if (!this.isStarted && this.lobbyConfigs.size > 0) {
          this.isStarted = true;
          const configs = Array.from(this.lobbyConfigs.values());
          await Promise.all(configs.map((c) => this.joinLobby(c.user, c.options)));
          return;
        }

        await Promise.all(
          this.activeLobbies.map(async (l) => {
            l.resumeHeartbeat();
            // Proactively re-publish presence to ensure we're seen as online
            try {
              await l.syncPresence();
            } catch (e) {
              console.error("Failed to refresh presence during session resume:", e);
            }
          }),
        );
      } finally {
        this.resumePromise = null;
      }
    })();

    return this.resumePromise;
  }
}
