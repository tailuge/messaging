import { ChallengeMessage } from "./types";

export class ChallengeDeduplicator {
  private onEmit: (challenge: ChallengeMessage) => void;

  constructor(onEmit: (challenge: ChallengeMessage) => void) {
    this.onEmit = onEmit;
  }

  public handleOffer(msg: ChallengeMessage): void {
    // Phase 2: Move the simple 250ms timer here
    setTimeout(() => {
      this.onEmit(msg);
    }, 250);
  }

  public clear(): void {
    // Phase 2 placeholder for clearing timeouts if needed upon leave/teardown
  }
}
