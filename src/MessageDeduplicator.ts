import { ChallengeMessage, PresenceMessage } from "./types";

/**
 * Grace window (ms) during which an internal Nchan auto-leave arriving after
 * a user join/heartbeat is treated as stale cleanup for the previous connection
 * rather than proof that the new presence is gone.
 */
export const AUTO_LEAVE_REJOIN_GRACE_MS = 250;

/**
 * Pure logic for deduplicating buffered Nchan replay messages.
 *
 * All methods are static and have no side effects — they take arrays of
 * messages and return deduplicated arrays. The Lobby owns the buffer and
 * calls these at settle time.
 */
export class MessageDeduplicator {
  /**
   * Challenge dedup: offer + resolution (accept/decline/cancel) for the same
   * interaction pair → the offer is filtered out. Unresolved offers pass through.
   *
   * Uses a two-pass approach:
   *   Pass 1: collect resolved interaction keys from non-offer messages.
   *   Pass 2: filter out offers whose interaction key was resolved.
   */
  static dedupeChallenges(messages: ChallengeMessage[]): ChallengeMessage[] {
    // Pass 1: collect resolved interaction keys
    const resolved = new Set<string>();
    for (const msg of messages) {
      if (msg.type !== "offer") {
        resolved.add(MessageDeduplicator.interactionKey(msg));
      }
    }

    // Pass 2: filter out resolved offers, keep everything else
    return messages.filter((msg) => {
      if (msg.type !== "offer") return true;
      return !resolved.has(MessageDeduplicator.interactionKey(msg));
    });
  }

  /**
   * Presence dedup: per-userId, last message wins (FIFO buffered replay).
   *
   * Effect:
   *   join + leave → leave
   *   leave + join → join
   *   join + heartbeat → heartbeat (last)
   *   heartbeat + join → join (last)
   *
   * Preserves the original ordering of the first occurrence of each userId.
   */
  static dedupePresence(messages: PresenceMessage[]): PresenceMessage[] {
    // Forward pass: overwrite in a Map so the last message per userId wins.
    // Map preserves insertion order, keeping the first occurrence position.
    // Exception: internal Nchan auto-leaves that arrive within the grace window
    // of a prior join/heartbeat are suppressed — they are stale cleanup for a
    // previous connection, not proof that the new presence is gone.
    const last = new Map<string, PresenceMessage>();
    for (const msg of messages) {
      const prev = last.get(msg.userId);
      if (
        prev &&
        prev.type !== "leave" &&
        msg.type === "leave" &&
        msg.meta?.origin === "internal"
      ) {
        const leaveTs = msg.meta?.ts;
        const prevTs = prev.meta?.ts ?? prev.clientTs;
        if (
          leaveTs !== undefined &&
          prevTs !== undefined &&
          leaveTs >= prevTs &&
          leaveTs - prevTs <= AUTO_LEAVE_REJOIN_GRACE_MS
        ) {
          // Suppress the stale auto-leave — keep the prior join/heartbeat
          continue;
        }
      }
      last.set(msg.userId, msg);
    }
    return [...last.values()];
  }

  /**
   * Returns a stable interaction key for a challenge message.
   * "alice:bob" and "bob:alice" produce the same key.
   */
  private static interactionKey(msg: ChallengeMessage): string {
    return [msg.challengerId, msg.challengeeId].sort().join(":");
  }
}
