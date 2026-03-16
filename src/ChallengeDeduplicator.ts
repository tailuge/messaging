import { ChallengeMessage } from "./types";

export class ChallengeDeduplicator {
  private onEmit: (challenge: ChallengeMessage) => void;
  private pendingOffers = new Map<string, NodeJS.Timeout>();

  constructor(onEmit: (challenge: ChallengeMessage) => void) {
    this.onEmit = onEmit;
  }

  public processMessage(msg: ChallengeMessage, currentUserId: string): void {
    // We use a combination of challenger and recipient to uniquely identify the interaction.
    const interactionKey = [msg.challengerId, msg.recipientId].sort().join(':');

    if (msg.type === "offer") {
      // Only process offers directed at us
      if (msg.recipientId === currentUserId) {
        // Clear any prior timer for this specific interaction just in case
        this.clearInteraction(interactionKey);

        const timeoutId = setTimeout(() => {
          this.onEmit(msg);
          this.pendingOffers.delete(interactionKey);
        }, 250);
        timeoutId.unref?.();

        this.pendingOffers.set(interactionKey, timeoutId);
      }
    } else {
      // Message types: accept, decline, cancel
      // When any resolution happens, cancel any pending timer for this interaction
      this.clearInteraction(interactionKey);

      // We must notify the application if the resolution is directed at us!
      if (msg.recipientId === currentUserId) {
        this.onEmit(msg);
      }
    }
  }

  private clearInteraction(key: string): void {
    const timeoutId = this.pendingOffers.get(key);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.pendingOffers.delete(key);
    }
  }

  public clear(): void {
    for (const timeoutId of this.pendingOffers.values()) {
      clearTimeout(timeoutId);
    }
    this.pendingOffers.clear();
  }
}
