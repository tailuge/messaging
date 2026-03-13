import { MessagingClient, PresenceMessage, Lobby, ChallengeMessage } from "../../src/index";
import { Table } from "../../src/table";

export interface AppConfig {
    userId: string;
    userName: string;
    baseUrl: string;
}

export function getConfig(): AppConfig {
    const params = new URLSearchParams(window.location.search);
    return {
        userId: params.get('id') || 'user-' + Math.random().toString(36).substr(2, 5),
        userName: params.get('name') || 'User',
        baseUrl: window.location.hostname
    };
}

export function createClient(baseUrl: string): MessagingClient {
    return new MessagingClient({ baseUrl });
}
