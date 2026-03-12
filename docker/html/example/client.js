"use strict";
(() => {
  // src/nchanclient.ts
  var PATHS = {
    PRESENCE_PUBLISH: "/publish/presence/lobby",
    PRESENCE_SUBSCRIBE: "/subscribe/presence/lobby",
    TABLE_PUBLISH: (tableId) => `/publish/table/${tableId}`,
    TABLE_SUBSCRIBE: (tableId) => `/subscribe/table/${tableId}`
  };
  var NchanClient = class {
    server;
    constructor(server) {
      this.server = server.replace(/\/$/, "");
      if (!this.server.startsWith("http")) {
        this.server = `http://${this.server}`;
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
      let resolveReady;
      const ready = new Promise((r) => {
        resolveReady = r;
      });
      const connect2 = () => {
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
          reconnectAttempts = 0;
          resolveReady();
        };
        ws.onclose = () => {
          if (!stopped) {
            const delay = Math.min(Math.pow(2, reconnectAttempts) * 1e3, maxReconnectDelay);
            reconnectAttempts++;
            reconnectTimer = setTimeout(connect2, delay);
            reconnectTimer.unref?.();
          }
        };
        ws.onerror = () => {
          ws?.close();
        };
      };
      connect2();
      return {
        ready,
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
        }
      };
    }
  };

  // src/types.ts
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
    constructor(nchan, tableId, userId2, lobby2) {
      this.nchan = nchan;
      this.tableId = tableId;
      this.userId = userId2;
      this.lobby = lobby2;
      if (this.lobby) {
        const handler = (users) => this.handleLobbyUsersChange(users);
        this.lobby.onUsersChange(handler);
        this.lobbyUnsubscribe = () => {
          this.lobby?.offUsersChange(handler);
        };
      }
    }
    subscription = null;
    isJoined = false;
    messageListeners = [];
    spectatorListeners = [];
    opponentLeftListeners = [];
    lobbyUnsubscribe;
    opponentLeft = false;
    opponentSeen = false;
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
      try {
        await this.nchan.publishTable(
          this.tableId,
          { type: "SYSTEM_DISCONNECT", data: {} },
          this.userId,
          { keepalive: options.isTeardown }
        );
        if (!options.isTeardown) {
          await new Promise((r) => setTimeout(r, 100));
        }
      } catch (e) {
        console.error("Error leaving table:", e);
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
      if (msg.type === "SYSTEM_DISCONNECT" && msg.senderId !== this.userId) {
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

  // src/lobby.ts
  var Lobby = class {
    constructor(nchan, currentUser, options = {}) {
      this.nchan = nchan;
      this.currentUser = currentUser;
      this.heartbeatInterval = options.heartbeatInterval || 3e4;
      this.pruneInterval = options.pruneInterval || 1e4;
      this.staleTtl = options.staleTtl || 9e4;
    }
    users = /* @__PURE__ */ new Map();
    listeners = [];
    challengeListeners = [];
    subscription = null;
    isJoined = false;
    heartbeatTimer;
    pruneTimer;
    heartbeatInterval;
    pruneInterval;
    staleTtl;
    /**
     * Initializes the lobby by subscribing to presence events and broadcasting "join".
     */
    async join() {
      if (this.isJoined) return;
      this.subscription = this.nchan.subscribePresence((data) => {
        this.handleIncomingMessage(data);
      });
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
          await this.nchan.publishPresence({
            ...this.currentUser,
            type: "heartbeat"
          });
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
        for (const [userId2, user] of this.users.entries()) {
          if (userId2 === this.currentUser.userId) continue;
          const lastSeen = user.lastSeen || now;
          if (now - lastSeen > this.staleTtl) {
            this.users.delete(userId2);
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
      await this.nchan.publishPresence(this.currentUser);
    }
    /**
     * Challenge another user to a game.
     * Returns the ID of the table created for the challenge.
     */
    async challenge(userId2, ruleType) {
      const tableId = getUID();
      await this.nchan.publishChallenge({
        type: "offer",
        challengerId: this.currentUser.userId,
        challengerName: this.currentUser.userName,
        recipientId: userId2,
        ruleType,
        tableId
      });
      return tableId;
    }
    /**
     * Accept an incoming challenge.
     * Returns the Table instance for the accepted game.
     */
    async acceptChallenge(userId2, ruleType, tableId) {
      await this.nchan.publishChallenge({
        type: "accept",
        challengerId: this.currentUser.userId,
        challengerName: this.currentUser.userName,
        recipientId: userId2,
        ruleType,
        tableId
      });
      await this.updatePresence({ tableId });
      const table = new Table(this.nchan, tableId, this.currentUser.userId, this);
      await table.join();
      return table;
    }
    /**
     * Decline an incoming challenge.
     */
    async declineChallenge(userId2, ruleType) {
      await this.nchan.publishChallenge({
        type: "decline",
        challengerId: this.currentUser.userId,
        challengerName: this.currentUser.userName,
        recipientId: userId2,
        ruleType
      });
    }
    /**
     * Cancel an outgoing challenge.
     */
    async cancelChallenge(userId2, ruleType) {
      await this.nchan.publishChallenge({
        type: "cancel",
        challengerId: this.currentUser.userId,
        challengerName: this.currentUser.userName,
        recipientId: userId2,
        ruleType
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
      this.notifyListeners();
      this.isJoined = false;
    }
    handleIncomingMessage(data) {
      const rawMsg = parseMessage(data);
      if (!rawMsg) return;
      if (rawMsg.messageType === "presence") {
        this.handlePresenceUpdate(rawMsg);
      } else if (rawMsg.messageType === "challenge") {
        this.handleChallenge(rawMsg);
      }
    }
    handlePresenceUpdate(msg) {
      if (msg.type === "leave") {
        this.users.delete(msg.userId);
      } else {
        msg.lastSeen = Date.now();
        this.users.set(msg.userId, msg);
      }
      this.notifyListeners();
    }
    handleChallenge(msg) {
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
  };

  // src/messagingclient.ts
  var MessagingClient = class {
    nchan;
    activeLobbies = [];
    activeTables = [];
    lastLobbyConfig;
    isStopping = false;
    constructor(options) {
      this.nchan = new NchanClient(options.baseUrl);
    }
    /**
     * Initializes the client and ensures connection readiness.
     * In browser environments, attaches lifecycle event listeners.
     */
    start() {
      if (typeof window !== "undefined") {
        window.addEventListener("pagehide", this.handlePageHide);
        window.addEventListener("pageshow", this.handlePageShow);
        document.addEventListener("visibilitychange", this.handleVisibilityChange);
      }
    }
    /**
     * Stops all active connections and cleans up.
     */
    async stop(options = {}) {
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
        await Promise.all(lobbies.map((lobby2) => lobby2.leave(options)));
        const tables = [...this.activeTables];
        this.activeTables = [];
        await Promise.all(tables.map((table) => table.leave(options)));
      } finally {
        this.isStopping = false;
      }
    }
    /**
     * Enters the global lobby for presence broadcasting and tracking.
     */
    async joinLobby(user, options) {
      const existing = this.activeLobbies.find((l) => l.currentUser.userId === user.userId);
      if (existing) return existing;
      this.lastLobbyConfig = { user, options };
      const lobby2 = new Lobby(this.nchan, user, options);
      await lobby2.join();
      this.activeLobbies.push(lobby2);
      return lobby2;
    }
    /**
     * Joins a specific table for communication.
     */
    async joinTable(tableId, userId2) {
      const existingTable = this.activeTables.find((t) => t.tableId === tableId);
      if (existingTable) {
        await existingTable.join();
        return existingTable;
      }
      const lobby2 = this.activeLobbies.find((l) => l.currentUser.userId === userId2);
      if (!lobby2) {
        throw new Error(`Cannot join table: No active lobby found for user ${userId2}`);
      }
      const table = new Table(this.nchan, tableId, userId2, lobby2);
      await table.join();
      this.activeTables.push(table);
      await lobby2.updatePresence({ tableId });
      return table;
    }
    handlePageHide = () => {
      this.stop({ isTeardown: true });
    };
    handlePageShow = async (event) => {
      if (event.persisted && this.lastLobbyConfig) {
        try {
          await this.joinLobby(this.lastLobbyConfig.user, this.lastLobbyConfig.options);
        } catch (e) {
          console.error("Failed to restore lobby on pageshow:", e);
        }
      }
    };
    handleVisibilityChange = () => {
      if (document.hidden) {
        this.activeLobbies.forEach((l) => l.pauseHeartbeat());
      } else {
        this.activeLobbies.forEach((l) => l.resumeHeartbeat());
      }
    };
  };

  // example/src/ui.ts
  function updateConnectionUI(online) {
    const statusEl = document.getElementById("conn-status");
    const btnConnect = document.getElementById("btn-connect");
    const btnDisconnect = document.getElementById("btn-disconnect");
    const btnFindGame = document.getElementById("btn-find-game");
    if (statusEl) {
      statusEl.innerText = online ? "ONLINE" : "OFFLINE";
      statusEl.className = `connection-status ${online ? "online" : "offline"}`;
    }
    if (btnConnect) btnConnect.style.display = online ? "none" : "block";
    if (btnDisconnect) btnDisconnect.style.display = online ? "block" : "none";
    if (btnFindGame) btnFindGame.disabled = !online;
  }
  function showChallenge(challenge) {
    const container = document.getElementById("challenge-container");
    const text = document.getElementById("challenge-text");
    if (container && text) {
      text.innerText = `${challenge.challengerName} has challenged you to a game!`;
      container.style.display = "block";
    }
  }
  function hideChallenge() {
    const container = document.getElementById("challenge-container");
    if (container) container.style.display = "none";
  }
  function renderUserList(users, currentUserId) {
    const list = document.getElementById("user-list");
    const countEl = document.getElementById("count");
    if (countEl) countEl.innerText = `Online Users: ${users.length}`;
    if (list) {
      list.innerHTML = users.map((u) => {
        const isMe = u.userId === currentUserId;
        const inGame = !!u.tableId;
        const isSeeking = !!u.seek;
        let actionBtn = "";
        if (!isMe && !inGame) {
          if (isSeeking) {
            actionBtn = `<button class="btn-join" onclick="joinSeek('${u.userId}', '${u.seek?.tableId}')">Join Game</button>`;
          } else {
            actionBtn = `<button class="btn-challenge" onclick="challengeUser('${u.userId}')">Challenge</button>`;
          }
        }
        return `
                <li class="user-item ${isMe ? "me" : ""}">
                    <div>
                        <span>${u.userName}</span>
                        <div class="status">
                            ${u.userId} 
                            ${inGame ? "(In Game: " + u.tableId + ")" : ""}
                            ${isSeeking ? "(Seeking Game...)" : ""}
                        </div>
                    </div>
                    ${actionBtn}
                </li>
            `;
      }).join("");
    }
  }
  function showGameInfo(tableId, opponentName) {
    const container = document.getElementById("game-container");
    const text = document.getElementById("game-text");
    if (container && text) {
      text.innerText = `Playing on table: ${tableId} against ${opponentName}`;
      container.style.display = "block";
    }
  }
  function hideGameInfo() {
    const container = document.getElementById("game-container");
    if (container) container.style.display = "none";
  }
  function showSeekStatus() {
    document.getElementById("seek-container").style.display = "block";
  }
  function hideSeekStatus() {
    document.getElementById("seek-container").style.display = "none";
  }
  function updateMyName(name, userId2) {
    const myNameEl = document.getElementById("my-name");
    if (myNameEl) myNameEl.innerText = `Hello, ${name} (${userId2})`;
  }
  function clearUserList() {
    const list = document.getElementById("user-list");
    if (list) list.innerHTML = "";
  }
  function showDisconnected() {
    const myNameEl = document.getElementById("my-name");
    if (myNameEl) myNameEl.innerText = "Disconnected";
  }

  // example/src/client.ts
  var params = new URLSearchParams(window.location.search);
  var userId = params.get("id") || "user-" + Math.random().toString(36).substr(2, 5);
  var userName = params.get("name") || "User";
  var client = new MessagingClient({
    baseUrl: window.location.hostname
  });
  var lobby = null;
  var currentTable = null;
  var activeChallenge = null;
  var mySeekTableId = null;
  function setupLobbyEvents(lobbyInstance) {
    lobbyInstance.onUsersChange((users) => {
      renderUserList(users, userId);
      if (mySeekTableId) {
        const otherUser = users.find((u) => u.userId !== userId && u.tableId === mySeekTableId);
        if (otherUser) {
          console.log("Someone joined my seek, auto-joining game");
          mySeekTableId = null;
          hideSeekStatus();
          joinGame(otherUser.tableId, otherUser.userId);
        }
      }
    });
    lobbyInstance.onChallenge((challenge) => {
      if (challenge.type === "offer") {
        activeChallenge = challenge;
        showChallenge(challenge);
      } else if (challenge.type === "accept") {
        joinGame(challenge.tableId, challenge.challengerId);
      } else if (challenge.type === "decline" || challenge.type === "cancel") {
        if (activeChallenge?.challengerId === challenge.challengerId) {
          hideChallenge();
          activeChallenge = null;
        }
        console.log(`Challenge ${challenge.type}ed by ${challenge.challengerName}`);
      }
    });
  }
  async function joinGame(tableId, opponentId) {
    if (currentTable) {
      await currentTable.leave();
    }
    currentTable = await client.joinTable(tableId, userId);
    if (lobby) {
      await lobby.updatePresence({ tableId, seek: void 0 });
    }
    showGameInfo(tableId, opponentId);
    currentTable.onMessage((msg) => {
      console.log("Game Message:", msg);
    });
  }
  async function leaveCurrentGame() {
    if (currentTable) {
      await currentTable.leave();
      currentTable = null;
      if (lobby) {
        await lobby.updatePresence({ tableId: void 0 });
      }
      hideGameInfo();
    }
  }
  async function acceptCurrentChallenge() {
    if (!activeChallenge || !lobby) return;
    const table = await lobby.acceptChallenge(
      activeChallenge.challengerId,
      activeChallenge.ruleType,
      activeChallenge.tableId
    );
    currentTable = table;
    hideChallenge();
    showGameInfo(activeChallenge.tableId, activeChallenge.challengerName);
  }
  async function declineCurrentChallenge() {
    if (!activeChallenge || !lobby) return;
    await lobby.declineChallenge(activeChallenge.challengerId, activeChallenge.ruleType);
    hideChallenge();
    activeChallenge = null;
  }
  async function connect() {
    try {
      await client.start();
      lobby = await client.joinLobby({
        messageType: "presence",
        type: "join",
        userId,
        userName
      });
      setupLobbyEvents(lobby);
      updateMyName(userName, userId);
      updateConnectionUI(true);
    } catch (e) {
      console.error("Connection failed", e);
    }
  }
  async function disconnect() {
    await client.stop();
    lobby = null;
    currentTable = null;
    activeChallenge = null;
    mySeekTableId = null;
    updateConnectionUI(false);
    clearUserList();
    showDisconnected();
  }
  window.connect = connect;
  window.disconnect = disconnect;
  window.findGame = async () => {
    if (!lobby) return;
    const tableId = getUID();
    mySeekTableId = tableId;
    await lobby.updatePresence({ seek: { tableId, ruleType: "standard" } });
    showSeekStatus();
  };
  window.cancelSeek = async () => {
    if (!lobby) return;
    mySeekTableId = null;
    await lobby.updatePresence({ seek: void 0 });
    hideSeekStatus();
  };
  window.joinSeek = async (targetUserId, tableId) => {
    console.log("Joining seek from:", targetUserId, "at table:", tableId);
    await joinGame(tableId, targetUserId);
  };
  window.challengeUser = async (targetUserId) => {
    if (!lobby) return;
    console.log("Challenging user:", targetUserId);
    await lobby.challenge(targetUserId, "standard");
  };
  window.leaveGame = leaveCurrentGame;
  window.updateName = async () => {
    const input = document.getElementById("name-input");
    const newName = input?.value;
    if (newName && lobby) {
      await lobby.updatePresence({ userName: newName });
      updateMyName(newName, userId);
    }
  };
  document.getElementById("btn-accept")?.addEventListener("click", async () => {
    await acceptCurrentChallenge();
  });
  document.getElementById("btn-decline")?.addEventListener("click", async () => {
    await declineCurrentChallenge();
  });
  updateConnectionUI(false);
  window.connect();
})();
