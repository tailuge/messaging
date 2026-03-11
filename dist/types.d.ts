/**
 * Server-enriched metadata added to all messages by Nchan.
 * This is the absolute source of truth for timing and origin.
 */
export interface _Meta {
    ts: string;
    locale: string;
    ua: string;
    ip: string;
    origin: string;
    host: string;
    path: string;
    method: string;
}
/**
 * Seek object for table seeking in the lobby
 */
export interface Seek {
    tableId: string;
    ruleType?: string;
}
/**
 * Presence-related messages (user join/leave/heartbeat)
 */
export interface PresenceMessage {
    messageType: "presence";
    type: "join" | "heartbeat" | "leave";
    userId: string;
    userName: string;
    ruleType?: string;
    opponentId?: string | null;
    seek?: Seek;
    lastSeen?: number;
    _meta?: _Meta;
    tableId?: string;
}
/**
 * Peer-to-peer challenge request
 */
export interface ChallengeMessage {
    messageType: "challenge";
    type: "offer" | "accept" | "decline" | "cancel";
    challengerId: string;
    challengerName: string;
    recipientId: string;
    ruleType: string;
    tableId?: string;
    _meta?: _Meta;
}
/**
 * Generic structure for table/game events
 */
export interface TableMessage<T = any> {
    type: string;
    senderId: string;
    data: T;
    _meta?: _Meta;
}
/**
 * Lobby-level information about an active game table
 */
export interface TableInfo {
    tableId: string;
    ruleType: string;
    players: {
        id: string;
        name: string;
    }[];
    spectatorCount: number;
    status: "waiting" | "playing" | "finished";
    createdAt: number;
}
/**
 * Union type for messages received via the lobby channel
 */
export type LobbyIncomingMessage = PresenceMessage | ChallengeMessage;
/**
 * Type guards
 */
export declare function isPresenceMessage(msg: any): msg is PresenceMessage;
export declare function isChallengeMessage(msg: any): msg is ChallengeMessage;
/**
 * Helper to parse incoming Nchan JSON strings
 */
export declare function parseMessage<T>(data: string): T | null;
