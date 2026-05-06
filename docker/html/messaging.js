// src/nchanclient.ts
var PATHS = {
  PRESENCE_PUBLISH: "/publish/presence/lobby",
  PRESENCE_SUBSCRIBE: "/subscribe/presence/lobby",
  TABLE_PUBLISH: (tableId) => `/publish/table/${tableId}`,
  TABLE_SUBSCRIBE: (tableId) => `/subscribe/table/${tableId}`
};
var NchanClient = class {
  constructor(server) {
    this.server = server.replace(/\/$/, "");
    if (!this.server.includes("://")) {
      if (typeof window !== "undefined") {
        const protocol = window.location.protocol;
        this.server = `${protocol}//${this.server}`;
      } else {
        this.server = `http://${this.server}`;
      }
    }
  }
  getWsUrl(path) {
    return this.server.replace(/^http/, "ws") + path;
  }
  getHttpUrl(path) {
    return this.server + path;
  }
  async publish(path, message, options = {}) {
    const url = this.getHttpUrl(path);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      keepalive: options.keepalive
    });
    if (!response.ok) {
      throw new Error(`Publish failed: ${response.status}`);
    }
    return response;
  }
  // Publishing
  async publishPresence(message, options) {
    return this.publish(
      PATHS.PRESENCE_PUBLISH,
      {
        ...message,
        messageType: "presence"
      },
      options
    );
  }
  async publishChallenge(message, options) {
    return this.publish(
      PATHS.PRESENCE_PUBLISH,
      {
        ...message,
        messageType: "challenge"
      },
      options
    );
  }
  async publishChat(message, options) {
    return this.publish(
      PATHS.PRESENCE_PUBLISH,
      {
        ...message,
        messageType: "chat"
      },
      options
    );
  }
  async publishTable(tableId, message, senderId, options) {
    return this.publish(
      PATHS.TABLE_PUBLISH(tableId),
      {
        ...message,
        senderId
      },
      options
    );
  }
  // Subscribing
  subscribePresence(onMessage) {
    return this.subscribe(PATHS.PRESENCE_SUBSCRIBE, onMessage);
  }
  subscribeTable(tableId, onMessage) {
    return this.subscribe(PATHS.TABLE_SUBSCRIBE(tableId), onMessage);
  }
  subscribe(path, onMessage) {
    const url = this.getWsUrl(path);
    let ws = null;
    let stopped = false;
    let reconnectAttempts = 0;
    const maxReconnectDelay = 3e4;
    let reconnectTimer = null;
    let firstConnection = true;
    const subscription = {
      stop: () => {
        stopped = true;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (ws) {
          ws.close();
          ws = null;
        }
      },
      ready: null
    };
    let resolveReady;
    subscription.ready = new Promise((r) => {
      resolveReady = r;
    });
    const connect = () => {
      if (stopped) return;
      if (ws && ws.readyState <= WebSocket.OPEN) {
        resolveReady();
        return;
      }
      ws = new globalThis.WebSocket(url);
      ws.onmessage = (event) => {
        onMessage(event.data);
      };
      ws.onopen = () => {
        const isReconnect = !firstConnection;
        firstConnection = false;
        reconnectAttempts = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        resolveReady();
        if (isReconnect && subscription.onReconnect) {
          subscription.onReconnect();
        }
      };
      ws.onclose = () => {
        if (!stopped) {
          const delay = Math.min(Math.pow(2, reconnectAttempts) * 1e3, maxReconnectDelay);
          reconnectAttempts++;
          reconnectTimer = setTimeout(connect, delay);
          reconnectTimer.unref?.();
        }
      };
      ws.onerror = () => {
        ws?.close();
      };
    };
    connect();
    return subscription;
  }
};

// src/types.ts
function isPresenceMessage(msg) {
  return msg?.messageType === "presence";
}
function isChallengeMessage(msg) {
  return msg?.messageType === "challenge";
}
function isChatMessage(msg) {
  return msg?.messageType === "chat";
}
function canChallenge(target, currentUserId) {
  return target.userId !== currentUserId && !target.tableId && !target.seek;
}
function canSpectate(target, currentTableId) {
  return !!target.tableId && target.tableId !== currentTableId;
}
function activeGames(users) {
  const gameMap = /* @__PURE__ */ new Map();
  for (const user of users) {
    if (user.tableId) {
      if (!gameMap.has(user.tableId)) {
        gameMap.set(user.tableId, {
          tableId: user.tableId,
          players: [],
          ruleType: user.ruleType
        });
      }
      gameMap.get(user.tableId).players.push({
        id: user.userId,
        name: user.userName
      });
    }
  }
  return Array.from(gameMap.values());
}
function parseMessage(data) {
  if (!data || data.trim() === "") return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to parse Nchan message:", e);
    return null;
  }
}

// src/table.ts
var Table = class {
  constructor(nchan, tableId, userId, lobby) {
    this.nchan = nchan;
    this.tableId = tableId;
    this.userId = userId;
    this.lobby = lobby;
    this.subscription = null;
    this.isJoined = false;
    this.messageListeners = [];
    this.spectatorListeners = [];
    this.opponentLeftListeners = [];
    this.opponentLeft = false;
    this.opponentSeen = false;
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
    if (this.isJoined) return;
    this.subscription = this.nchan.subscribeTable(this.tableId, (data) => {
      this.handleIncomingMessage(data);
    });
    await this.subscription.ready;
    this.isJoined = true;
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
  async leave(options = {}) {
    if (!options.isTeardown) {
      try {
        await this.nchan.publishTable(
          this.tableId,
          { type: "table:leave", data: {} },
          this.userId
        );
        await new Promise((r) => setTimeout(r, 100));
      } catch (e) {
        console.error("Error leaving table:", e);
      }
    }
    if (this.lobby) {
      await this.lobby.updatePresence({ tableId: void 0 });
    }
    this.subscription?.stop();
    this.messageListeners = [];
    this.spectatorListeners = [];
    this.opponentLeftListeners = [];
    this.lobbyUnsubscribe?.();
    this.isJoined = false;
  }
  handleIncomingMessage(data) {
    const msg = parseMessage(data);
    if (!msg || !msg.type) return;
    if (msg.type === "table:leave" && msg.senderId !== this.userId) {
      this.notifyOpponentLeft();
    }
    this.messageListeners.forEach((cb) => cb(msg));
  }
  handleLobbyUsersChange(users) {
    const playersAtThisTable = users.filter((u) => u.tableId === this.tableId);
    const opponent = playersAtThisTable.find((u) => u.userId !== this.userId);
    if (opponent) {
      this.opponentSeen = true;
    }
    if (this.opponentSeen && !opponent) {
      this.notifyOpponentLeft();
    }
  }
  notifyOpponentLeft() {
    if (this.opponentLeft) return;
    this.opponentLeft = true;
    this.opponentLeftListeners.forEach((cb) => cb());
  }
};

// src/utils/uid.ts
function getUID() {
  return "xxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

// src/ChallengeDeduplicator.ts
var ChallengeDeduplicator = class {
  constructor(onEmit) {
    this.pendingOffers = /* @__PURE__ */ new Map();
    this.onEmit = onEmit;
  }
  processMessage(msg, currentUserId) {
    const interactionKey = [msg.challengerId, msg.challengeeId].sort().join(":");
    if (msg.type === "offer") {
      if (msg.challengeeId === currentUserId) {
        this.clearInteraction(interactionKey);
        const timeoutId = setTimeout(() => {
          this.onEmit(msg);
          this.pendingOffers.delete(interactionKey);
        }, 250);
        if (timeoutId && typeof timeoutId === "object" && "unref" in timeoutId) {
          timeoutId.unref();
        }
        this.pendingOffers.set(interactionKey, timeoutId);
      }
    } else {
      this.clearInteraction(interactionKey);
      const isRelevant = msg.type === "cancel" ? msg.challengeeId === currentUserId : msg.challengerId === currentUserId;
      if (isRelevant) {
        this.onEmit(msg);
      }
    }
  }
  clearInteraction(key) {
    const timeoutId = this.pendingOffers.get(key);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.pendingOffers.delete(key);
    }
  }
  clear() {
    for (const timeoutId of this.pendingOffers.values()) {
      clearTimeout(timeoutId);
    }
    this.pendingOffers.clear();
  }
};

// src/lobby.ts
var Lobby = class {
  constructor(nchan, currentUser, options = {}) {
    this.nchan = nchan;
    this.currentUser = currentUser;
    this.options = options;
    this.users = /* @__PURE__ */ new Map();
    this.listeners = [];
    this.challengeListeners = [];
    this.chatListeners = [];
    this.pendingChallenges = [];
    this.subscription = null;
    this.isJoined = false;
    this.presenceMessageCount = 0;
    this.heartbeatInterval = options.heartbeatInterval || 6e4;
    this.pruneInterval = options.pruneInterval || 3e4;
    this.staleTtl = options.staleTtl || 9e4;
    this.deduplicator = new ChallengeDeduplicator((msg) => {
      this.pendingChallenges.push(msg);
      this.challengeListeners.forEach((cb) => cb(msg));
    });
  }
  /**
   * Subscribe to incoming chat messages directed at the current user.
   */
  onChat(callback) {
    this.chatListeners.push(callback);
  }
  /**
   * Send a chat message to another user.
   */
  async sendChat(recipientId, text) {
    await this.nchan.publishChat({
      senderId: this.currentUser.userId,
      recipientId,
      text
    });
  }
  /**
   * Initializes the lobby by subscribing to presence events and broadcasting "join".
   */
  async join() {
    if (this.isJoined) return;
    this.subscription = this.nchan.subscribePresence((data) => {
      this.handleIncomingMessage(data);
    });
    this.subscription.onReconnect = () => {
      this.resumeHeartbeat();
      if (this.options.onReconnect) {
        this.options.onReconnect();
      } else {
        this.nchan.publishPresence(this.currentUser).catch((_e) => {
          console.error("Failed to re-broadcast presence on reconnect:", _e);
        });
      }
    };
    await this.subscription.ready;
    await this.nchan.publishPresence(this.currentUser);
    this.startHeartbeat();
    this.startPruning();
    this.isJoined = true;
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
        await this.syncPresence({ type: "heartbeat" });
      } catch (_e) {
        console.error("Failed to send heartbeat:", _e);
      }
    }, this.heartbeatInterval);
    this.heartbeatTimer.unref?.();
  }
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = void 0;
    }
  }
  startPruning() {
    this.stopPruning();
    this.pruneTimer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [userId, user] of this.users.entries()) {
        if (userId === this.currentUser.userId) continue;
        const lastSeen = user.meta.ts;
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
  stopPruning() {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = void 0;
    }
  }
  /**
   * Emits the current list of online users whenever it changes.
   */
  onUsersChange(callback) {
    this.listeners.push(callback);
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
    await this.syncPresence();
  }
  /**
   * Proactively re-publishes the current presence state to the lobby.
   * Useful for session restoration or ensuring state synchronization.
   */
  async syncPresence(update = {}) {
    this.presenceMessageCount++;
    if (this.presenceMessageCount >= 120) {
      await this.leave();
      return;
    }
    await this.nchan.publishPresence({
      ...this.currentUser,
      ...update
    });
  }
  /**
   * Challenge another user to a game.
   * Returns the ID of the table created for the challenge.
   */
  async challenge(userId, ruleType, rematch, options) {
    const tableId = getUID();
    await this.nchan.publishChallenge({
      type: "offer",
      challengerId: this.currentUser.userId,
      challengerName: this.currentUser.userName,
      challengeeId: userId,
      ruleType,
      tableId,
      rematch,
      options
    });
    return tableId;
  }
  /**
   * Accept an incoming challenge.
   * Returns the Table instance for the accepted game.
   */
  async acceptChallenge(userId, ruleType, tableId, options, challengerName) {
    await this.nchan.publishChallenge({
      type: "accept",
      challengerId: userId,
      challengerName: challengerName ?? userId,
      challengeeId: this.currentUser.userId,
      ruleType,
      tableId,
      options
    });
    await this.updatePresence({ tableId });
    const table = new Table(this.nchan, tableId, this.currentUser.userId, this);
    await table.join();
    return table;
  }
  /**
   * Decline an incoming challenge.
   */
  async declineChallenge(userId, ruleType, challengerName) {
    await this.nchan.publishChallenge({
      type: "decline",
      challengerId: userId,
      challengerName: challengerName ?? userId,
      challengeeId: this.currentUser.userId,
      ruleType
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
      challengeeId: userId,
      ruleType
    });
  }
  /**
   * Subscribe to incoming challenges directed at the current user.
   * Delivers any pending challenges that were received while disconnected.
   */
  onChallenge(callback) {
    this.challengeListeners.push(callback);
    this.pendingChallenges.forEach((challenge) => callback(challenge));
  }
  /**
   * Gracefully leaves the lobby.
   */
  async leave(options = {}) {
    this.stopHeartbeat();
    this.stopPruning();
    this.subscription?.stop();
    try {
      await this.nchan.publishPresence(
        {
          ...this.currentUser,
          type: "leave"
        },
        { keepalive: options.isTeardown }
      );
    } catch (e) {
      console.error("Error leaving lobby:", e);
    }
    this.users.clear();
    this.pendingChallenges = [];
    this.deduplicator.clear();
    this.presenceMessageCount = 0;
    this.notifyListeners();
    this.isJoined = false;
    this.options.onLeave?.();
  }
  handleIncomingMessage(data) {
    const rawMsg = parseMessage(data);
    if (!rawMsg) return;
    if (rawMsg.messageType === "presence") {
      this.handlePresenceUpdate(rawMsg);
    } else if (rawMsg.messageType === "challenge") {
      this.handleChallenge(rawMsg);
    } else if (rawMsg.messageType === "chat") {
      this.handleChat(rawMsg);
    }
  }
  /**
   * Handles incoming presence updates.
   * Note: Nchan guarantees ordered delivery, so we don't need to check meta.ts for ordering.
   * The last message received for each userId will be the current state.
   */
  handlePresenceUpdate(msg) {
    if (msg.type === "leave") {
      this.users.delete(msg.userId);
    } else {
      this.users.set(msg.userId, msg);
    }
    this.notifyListeners();
  }
  handleChallenge(msg) {
    this.deduplicator.processMessage(msg, this.currentUser.userId);
  }
  handleChat(msg) {
    if (msg.recipientId === this.currentUser.userId) {
      this.chatListeners.forEach((cb) => cb(msg));
    }
  }
  notifyListeners() {
    const list = this.getUsersList();
    this.listeners.forEach((cb) => cb(list));
  }
  getUsersList() {
    return Array.from(this.users.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }
};

// src/messagingclient.ts
var MessagingClient = class {
  constructor(options) {
    this.activeLobbies = [];
    this.lobbyInstances = /* @__PURE__ */ new Map();
    this.activeTables = [];
    this.lobbyConfigs = /* @__PURE__ */ new Map();
    this.isStopping = false;
    this.isStarted = false;
    this.listenersAttached = false;
    this.resumePromise = null;
    this.stopPromise = null;
    this.joiningLobbies = /* @__PURE__ */ new Map();
    this.handlePageHide = () => {
      this.stop({ isTeardown: true });
    };
    this.handlePageShow = async (event) => {
      if (event.persisted) {
        await this.resumeSession();
      }
    };
    this.handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden") {
        this.activeLobbies.forEach((l) => l.pauseHeartbeat());
      } else if (document.visibilityState === "visible") {
        await this.resumeSession();
      }
    };
    this.nchan = new NchanClient(options.baseUrl);
  }
  /**
   * Initializes the client and ensures connection readiness.
   * In browser environments, attaches lifecycle event listeners.
   */
  start() {
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
  async stop(options = {}) {
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
  async joinLobby(user, options) {
    this.start();
    if (this.joiningLobbies.has(user.userId)) {
      return this.joiningLobbies.get(user.userId);
    }
    const joinPromise = (async () => {
      try {
        const existing = this.lobbyInstances.get(user.userId);
        let lobbyRef;
        const lobbyOptions = {
          ...options,
          onReconnect: () => {
            this.resumeSession().catch(
              (e) => console.error("Session resume failed after lobby reconnect:", e)
            );
            options?.onReconnect?.();
          },
          onLeave: () => {
            const target = lobbyRef ?? existing;
            if (target) {
              const idx = this.activeLobbies.indexOf(target);
              if (idx !== -1) this.activeLobbies.splice(idx, 1);
            }
          }
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
  async leaveLobby(userId) {
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
   */
  async joinTable(tableId, userId) {
    const existingTable = this.activeTables.find((t) => t.tableId === tableId);
    if (existingTable) {
      await existingTable.join();
      return existingTable;
    }
    const lobby = this.activeLobbies.find((l) => l.currentUser.userId === userId);
    if (!lobby) {
      throw new Error(`Cannot join table: No active lobby found for user ${userId}`);
    }
    const table = new Table(this.nchan, tableId, userId, lobby);
    await table.join();
    this.activeTables.push(table);
    await lobby.updatePresence({ tableId });
    return table;
  }
  /**
   * Central orchestrator for session restoration.
   * Ensures connection, lobby joins, and presence sync after a lifecycle event or reconnect.
   */
  async resumeSession() {
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
            try {
              await l.syncPresence();
            } catch (e) {
              console.error("Failed to refresh presence during session resume:", e);
            }
          })
        );
      } finally {
        this.resumePromise = null;
      }
    })();
    return this.resumePromise;
  }
};
export {
  Lobby,
  MessagingClient,
  NchanClient,
  Table,
  activeGames,
  canChallenge,
  canSpectate,
  isChallengeMessage,
  isChatMessage,
  isPresenceMessage,
  parseMessage
};
