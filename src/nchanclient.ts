import type { PresenceMessage, ChallengeMessage, TableMessage, ChatMessage } from "./types";

const PATHS = {
  PRESENCE_PUBLISH: "/publish/presence/lobby",
  PRESENCE_SUBSCRIBE: "/subscribe/presence/lobby",
  TABLE_PUBLISH: (tableId: string) => `/publish/table/${tableId}`,
  TABLE_SUBSCRIBE: (tableId: string) => `/subscribe/table/${tableId}`,
} as const;

export type Subscription = {
  stop: () => void;
  ready: Promise<void>;
  onReconnect?: () => void;
};

export class NchanClient {
  private server: string;
  private version?: string;

  constructor(server: string) {
    // Ensure server string doesn't end with a slash
    this.server = server.replace(/\/$/, "");

    // If no protocol is provided, determine it based on the environment
    if (!this.server.includes("://")) {
      if (typeof window !== "undefined") {
        // Use current page protocol if available
        const protocol = window.location.protocol; // "http:" or "https:"
        this.server = `${protocol}//${this.server}`;
      } else {
        // Fallback for non-browser environments
        this.server = `http://${this.server}`;
      }
    }
  }

  /**
   * Sets the global version string to be included in all published messages.
   */
  setVersion(version: string): void {
    this.version = version;
  }

  private getWsUrl(path: string): string {
    // Replace http with ws, and https with wss
    return this.server.replace(/^http/, "ws") + path;
  }

  private getHttpUrl(path: string): string {
    return this.server + path;
  }

  private async publish(
    path: string,
    message: any,
    options: { keepalive?: boolean } = {},
  ): Promise<void> {
    const url = this.getHttpUrl(path);

    // Inject version into meta if set
    if (this.version) {
      message.meta = { ...message.meta, version: this.version };
    }

    const body = JSON.stringify(message);

    // Use sendBeacon only for unload/keepalive scenarios
    if (options.keepalive && typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) {
        return; // Successfully queued by the browser
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: options.keepalive,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(`Publish failed: ${response.status}`);
    }
  }

  // Publishing

  async publishPresence(
    message: Omit<PresenceMessage, "messageType">,
    options?: { keepalive?: boolean },
  ): Promise<void> {
    return this.publish(
      PATHS.PRESENCE_PUBLISH,
      {
        ...message,
        messageType: "presence",
      },
      options,
    );
  }

  async publishChallenge(
    message: Omit<ChallengeMessage, "messageType">,
    options?: { keepalive?: boolean },
  ): Promise<void> {
    return this.publish(
      PATHS.PRESENCE_PUBLISH,
      {
        ...message,
        messageType: "challenge",
      },
      options,
    );
  }

  async publishChat(
    message: Omit<ChatMessage, "messageType" | "meta">,
    options?: { keepalive?: boolean },
  ): Promise<void> {
    return this.publish(
      PATHS.PRESENCE_PUBLISH,
      {
        ...message,
        messageType: "chat",
      },
      options,
    );
  }

  async publishTable<T>(
    tableId: string,
    message: Omit<TableMessage<T>, "senderId">,
    senderId: string,
    options?: { keepalive?: boolean },
  ): Promise<void> {
    return this.publish(
      PATHS.TABLE_PUBLISH(tableId),
      {
        ...message,
        senderId,
      },
      options,
    );
  }

  // Subscribing

  subscribePresence(
    onMessage: (data: string) => void,
    userId?: string,
    userName?: string,
  ): Subscription {
    const args = new URLSearchParams();
    if (userId) args.append("userId", userId);
    if (userName) args.append("userName", userName);
    const queryString = args.toString();
    const path = queryString ? `${PATHS.PRESENCE_SUBSCRIBE}?${queryString}` : PATHS.PRESENCE_SUBSCRIBE;
    return this.subscribe(path, onMessage);
  }

  subscribeTable(tableId: string, onMessage: (data: string) => void): Subscription {
    return this.subscribe(PATHS.TABLE_SUBSCRIBE(tableId), onMessage);
  }

  private subscribe(path: string, onMessage: (data: string) => void): Subscription {
    const url = this.getWsUrl(path);
    const ts = () => new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    let ws: WebSocket | null = null;
    let stopped = false;
    let reconnectAttempts = 0;
    const initialReconnectDelay = 8000;
    const maxReconnectDelay = 60000;
    let reconnectTimer: any = null;
    let firstConnection = true;
    const CONNECTION_TIMEOUT_MS = 20000;
    let connectionTimeoutTimer: any = null;

    const subscription: Subscription = {
      stop: () => {
        stopped = true;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (connectionTimeoutTimer) {
          clearTimeout(connectionTimeoutTimer);
          connectionTimeoutTimer = null;
        }
        if (ws) {
          ws.close();
          ws = null;
        }
      },
      ready: null as any,
    };

    let resolveReady: () => void;
    subscription.ready = new Promise<void>((r) => {
      resolveReady = r;
    });

    const connect = () => {
      if (stopped) return;
      if (ws && ws.readyState <= WebSocket.OPEN) {
        resolveReady();
        return;
      }

      console.log(`[NchanClient ${ts()}] Connecting to ${url} (attempt ${reconnectAttempts + 1})`);
      ws = new globalThis.WebSocket(url);

      if (connectionTimeoutTimer) {
        clearTimeout(connectionTimeoutTimer);
      }
      connectionTimeoutTimer = setTimeout(() => {
        console.warn(`[NchanClient ${ts()}] Connection to ${url} timed out after ${CONNECTION_TIMEOUT_MS}ms, forcing reconnect`);
        ws?.close();
      }, CONNECTION_TIMEOUT_MS);
      connectionTimeoutTimer.unref?.();

      ws.onmessage = (event) => {
        onMessage(event.data as string);
      };

      ws.onopen = () => {
        const isReconnect = !firstConnection;
        firstConnection = false;
        reconnectAttempts = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (connectionTimeoutTimer) {
          clearTimeout(connectionTimeoutTimer);
          connectionTimeoutTimer = null;
        }
        console.log(`[NchanClient ${ts()}] Connected to ${url}`);
        resolveReady();
        if (isReconnect && subscription.onReconnect) {
          subscription.onReconnect();
        }
      };

      ws.onclose = (event) => {
        console.log(`[NchanClient ${ts()}] Connection closed: ${url} (code=${event.code}, reason="${event.reason}", wasClean=${event.wasClean})`);
        if (connectionTimeoutTimer) {
          clearTimeout(connectionTimeoutTimer);
          connectionTimeoutTimer = null;
        }
        if (!stopped) {
          if (reconnectAttempts >= 10) {
            console.error(`[NchanClient ${ts()}] Max reconnect attempts reached for ${url}, giving up`);
            return;
          }
          const delay = Math.min(Math.pow(2, reconnectAttempts) * initialReconnectDelay, maxReconnectDelay);
          reconnectAttempts++;
          console.log(`[NchanClient ${ts()}] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
          reconnectTimer = setTimeout(connect, delay);
          reconnectTimer.unref?.();
        }
      };

      ws.onerror = (event) => {
        console.error(`[NchanClient ${ts()}] WebSocket error on ${url}:`, event);
        ws?.close();
      };
    };

    connect();

    return subscription;
  }
}
