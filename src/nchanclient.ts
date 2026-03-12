import type { PresenceMessage, ChallengeMessage, TableMessage } from "./types";

const PATHS = {
  PRESENCE_PUBLISH: "/publish/presence/lobby",
  PRESENCE_SUBSCRIBE: "/subscribe/presence/lobby",
  TABLE_PUBLISH: (tableId: string) => `/publish/table/${tableId}`,
  TABLE_SUBSCRIBE: (tableId: string) => `/subscribe/table/${tableId}`,
} as const;

export type Subscription = { stop: () => void; ready: Promise<void> };

export class NchanClient {
  private server: string;

  constructor(server: string) {
    // Ensure server string doesn't end with a slash and starts with protocol if missing
    this.server = server.replace(/\/$/, "");
    if (!this.server.startsWith("http")) {
      this.server = `http://${this.server}`;
    }
  }

  private getWsUrl(path: string): string {
    return this.server.replace(/^http/, "ws") + path;
  }

  private getHttpUrl(path: string): string {
    return this.server + path;
  }

  private async publish(
    path: string,
    message: unknown,
    options: { keepalive?: boolean } = {},
  ): Promise<Response> {
    const url = this.getHttpUrl(path);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      keepalive: options.keepalive,
    });
    if (!response.ok) {
      throw new Error(`Publish failed: ${response.status}`);
    }
    return response;
  }

  // Publishing

  async publishPresence(
    message: Omit<PresenceMessage, "messageType">,
    options?: { keepalive?: boolean },
  ): Promise<Response> {
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
  ): Promise<Response> {
    return this.publish(
      PATHS.PRESENCE_PUBLISH,
      {
        ...message,
        messageType: "challenge",
      },
      options,
    );
  }

  async publishTable<T>(
    tableId: string,
    message: Omit<TableMessage<T>, "senderId">,
    senderId: string,
    options?: { keepalive?: boolean },
  ): Promise<Response> {
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

    let resolveReady: () => void;
    const ready = new Promise<void>((r) => {
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
        reconnectAttempts = 0;
        resolveReady();
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
      },
    };
  }
}
