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

  private getWsUrl(path: string): string {
    // Replace http with ws, and https with wss
    return this.server.replace(/^http/, "ws") + path;
  }

  private getHttpUrl(path: string): string {
    return this.server + path;
  }

  private async publish(
    path: string,
    message: unknown,
    options: { keepalive?: boolean } = {},
  ): Promise<void> {
    const url = this.getHttpUrl(path);
    const body = JSON.stringify(message);

    // Use sendBeacon in browser environments for reliability during unloads
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) {
        return; // Successfully queued by the browser
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: options.keepalive,
    });
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

  subscribePresence(onMessage: (data: string) => void): Subscription {
    return this.subscribe(PATHS.PRESENCE_SUBSCRIBE, onMessage);
  }

  subscribeTable(tableId: string, onMessage: (data: string) => void): Subscription {
    return this.subscribe(PATHS.TABLE_SUBSCRIBE(tableId), onMessage);
  }

  private subscribe(path: string, onMessage: (data: string) => void): Subscription {
    const url = this.getWsUrl(path);
    let ws: WebSocket | null = null;
    let stopped = false;
    let reconnectAttempts = 0;
    const maxReconnectDelay = 30000;
    let reconnectTimer: any = null;
    let firstConnection = true;

    const subscription: Subscription = {
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

      ws = new globalThis.WebSocket(url);

      ws.onmessage = (event) => {
        onMessage(event.data as string);
      };

      ws.onopen = () => {
        const isReconnect = !firstConnection;
        firstConnection = false;
        reconnectAttempts = 0;
        // Clear any pending reconnect timer from previous disconnect
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
          const delay = Math.min(Math.pow(2, reconnectAttempts) * 1000, maxReconnectDelay);
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
}
