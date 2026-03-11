import type { PresenceMessage, ChallengeMessage, TableMessage } from "./types";

export type Subscription = {
  stop: () => void;
  ready: Promise<void>;
};

export interface PublishOptions {
  signal?: AbortSignal;
}

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

  private async publish(path: string, message: unknown, options: PublishOptions = {}): Promise<Response> {
    const url = this.getHttpUrl(path);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(`Publish failed: ${response.status}`);
    }
    return response;
  }

  // Publishing

  async publishPresence(
    message: Omit<PresenceMessage, "messageType">,
    options?: PublishOptions
  ): Promise<Response> {
    return this.publish("/publish/presence/lobby", {
      ...message,
      messageType: "presence",
    }, options);
  }

  async publishChallenge(
    message: Omit<ChallengeMessage, "messageType">,
    options?: PublishOptions
  ): Promise<Response> {
    return this.publish("/publish/presence/lobby", {
      ...message,
      messageType: "challenge",
    }, options);
  }

  async publishTable<T>(
    tableId: string,
    message: Omit<TableMessage<T>, "senderId">,
    senderId: string,
    options?: PublishOptions
  ): Promise<Response> {
    return this.publish(`/publish/table/${tableId}`, {
      ...message,
      senderId,
    }, options);
  }

  // Subscribing

  subscribePresence(onMessage: (data: string) => void): Subscription {
    return this.subscribe("/subscribe/presence/lobby", onMessage);
  }

  subscribeTable(tableId: string, onMessage: (data: string) => void): Subscription {
    return this.subscribe(`/subscribe/table/${tableId}`, onMessage);
  }

  private subscribe(path: string, onMessage: (data: string) => void): Subscription {
    const url = this.getWsUrl(path);
    let ws: WebSocket | null = null;
    let stopped = false;
    let reconnectAttempts = 0;
    const maxReconnectDelay = 30000;
    let reconnectTimer: any = null;

    let resolveReady: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const connect = () => {
      if (stopped) return;

      try {
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
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch (e) {
        console.error(`WebSocket connection failed for ${url}:`, e);
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 1000);
        }
      }
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
          ws.onclose = null;
          ws.onerror = null;
          ws.onmessage = null;
          ws.onopen = null;
          ws.close();
        }
      },
    };
  }
}
