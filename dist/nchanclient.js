export class NchanClient {
    server;
    constructor(server) {
        // Ensure server string doesn't end with a slash and starts with protocol if missing
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
    async publish(path, message) {
        const url = this.getHttpUrl(path);
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message),
        });
        if (!response.ok) {
            throw new Error(`Publish failed: ${response.status}`);
        }
        return response;
    }
    // Publishing
    async publishPresence(message) {
        return this.publish("/publish/presence/lobby", {
            ...message,
            messageType: "presence",
        });
    }
    async publishChallenge(message) {
        return this.publish("/publish/presence/lobby", {
            ...message,
            messageType: "challenge",
        });
    }
    async publishTable(tableId, message, senderId) {
        return this.publish(`/publish/table/${tableId}`, {
            ...message,
            senderId,
        });
    }
    // Subscribing
    subscribePresence(onMessage) {
        return this.subscribe("/subscribe/presence/lobby", onMessage);
    }
    subscribeTable(tableId, onMessage) {
        return this.subscribe(`/subscribe/table/${tableId}`, onMessage);
    }
    subscribe(path, onMessage) {
        const url = this.getWsUrl(path);
        let ws = null;
        let stopped = false;
        let reconnectAttempts = 0;
        const maxReconnectDelay = 30000;
        let reconnectTimer = null;
        const connect = () => {
            if (stopped)
                return;
            ws = new globalThis.WebSocket(url);
            ws.onmessage = (event) => {
                onMessage(event.data);
            };
            ws.onopen = () => {
                reconnectAttempts = 0;
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
        };
        connect();
        return {
            stop: () => {
                stopped = true;
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
                ws?.close();
            },
        };
    }
}
//# sourceMappingURL=nchanclient.js.map