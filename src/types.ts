/**
 * Server-enriched metadata added to all messages by Nchan.
 * This is the absolute source of truth for timing.
 */
export interface Meta {
  ts: number; // Epoch milliseconds (Source of Truth for time)
  ua: string; // User-Agent header
  ip: string; // Client remote address
  origin: string; // Origin header value
  method: string; // HTTP method (always POST for publish)
  country: string; // Country code from IP (e.g., "US", "GB", "XX")
  since?: number; // Epoch ms when this IP was first seen (from ip_cache)
  version?: string; // Optional client-side software version
}

/**
 * Seek object for table seeking in the lobby
 */
export interface Seek {
  tableId: string;
  ruleType?: string;
  // Note: Timing is handled by the wrapping message's meta.ts
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
  meta?: Meta; // Server-enriched metadata (received messages only)
  tableId?: string; // Current game/spectating table
  isSpectator?: boolean; // True when user is spectating (not playing) at tableId
  isLeaving?: boolean; // True when user has sent 'leave' but grace period has not expired
}

/**
 * Peer-to-peer challenge request
 */
export interface ChallengeMessage {
  messageType: "challenge";
  type: "offer" | "accept" | "decline" | "cancel";
  challengerId: string;
  challengerName: string;
  challengeeId: string;
  ruleType: string;
  tableId?: string; // Optional: table created by challenger
  readonly options?: Record<string, string>; // Optional: game-specific configuration
  meta?: Meta; // Server-enriched metadata (received messages only)
}

/**
 * 1-to-1 public-broadcast chat message
 */
export interface ChatMessage {
  messageType: "chat";
  senderId: string;
  recipientId: string;
  text: string;
  meta?: Meta; // Server-enriched metadata (received messages only)
}

/**
 * Generic structure for table/game events
 */
export interface TableMessage<T = unknown> {
  type: string;
  senderId: string;
  data: T; // Application-specific payload
  meta?: Meta; // Server-enriched metadata (received messages only)
}

/**
 * Lobby-level information about an active game table
 */
export interface TableInfo {
  tableId: string;
  ruleType: string;
  players: { id: string; name: string }[];
  spectatorCount: number;
  status: "waiting" | "playing" | "finished";
  createdAt: number; // Derived from initial join meta.ts
}

/**
 * Derived active game from presence list
 */
export interface ActiveGame {
  tableId: string;
  players: { id: string; name: string }[];
  ruleType?: string;
}

/**
 * Union type for messages received via the lobby channel
 */
export type LobbyIncomingMessage = PresenceMessage | ChallengeMessage | ChatMessage;

/**
 * Type guards
 */
export function isPresenceMessage(msg: any): msg is PresenceMessage {
  return msg?.messageType === "presence";
}

export function isChallengeMessage(msg: any): msg is ChallengeMessage {
  return msg?.messageType === "challenge";
}

export function isChatMessage(msg: any): msg is ChatMessage {
  return msg?.messageType === "chat";
}

/**
 * Predicate: can the current user challenge this target?
 * Returns true if target is not self, not in a game, and not seeking
 */
export function canChallenge(target: PresenceMessage, currentUserId: string): boolean {
  return target.userId !== currentUserId && !target.tableId && !target.seek;
}

/**
 * Predicate: can the current user spectate this target's game?
 * Returns true if target is a player (not spectator) at a different table
 */
export function canSpectate(target: PresenceMessage, currentTableId?: string): boolean {
  return !!target.tableId && !target.isSpectator && target.tableId !== currentTableId;
}

/**
 * Derived status of a user based on their presence state
 */
export type UserStatus = "available" | "playing" | "spectating";

export function userStatus(user: PresenceMessage): UserStatus {
  if (!user.tableId) return "available";
  if (user.isSpectator) return "spectating";
  return "playing";
}

/**
 * Predicate: is the user in the lobby (not in a game or spectating)?
 */
export function isInLobby(user: PresenceMessage): boolean {
  return !user.tableId;
}

/**
 * Filter: derive active games from presence list
 * Returns unique games (one entry per tableId) with their players
 */
export function activeGames(users: PresenceMessage[]): ActiveGame[] {
  const gameMap = new Map<string, ActiveGame>();

  for (const user of users) {
    if (user.tableId) {
      if (!gameMap.has(user.tableId)) {
        gameMap.set(user.tableId, {
          tableId: user.tableId,
          players: [],
          ruleType: user.ruleType,
        });
      }
      gameMap.get(user.tableId)!.players.push({
        id: user.userId,
        name: user.userName,
      });
    }
  }

  return Array.from(gameMap.values());
}

/**
 * Helper to parse incoming Nchan JSON strings
 */
export function parseMessage<T>(data: string): T | null {
  if (!data || data.trim() === "") return null;
  try {
    return JSON.parse(data) as T;
  } catch (e) {
    console.error("Failed to parse Nchan message:", e);
    return null;
  }
}
