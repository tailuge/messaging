/**
 * UserSlotManager — Stable slot allocation for the online users list.
 *
 * Pure logic class. Zero dependencies — no Lit, no DOM, no Nchan.
 * Receives full user lists from the lobby on each change and maintains
 * a stable array of slots. When users leave, their slot remains greyed
 * out for a grace period. Returning users reclaim their slot. New users
 * either evict the oldest expired slot or push a new one.
 *
 * No timers. Everything is event-driven via update().
 */

/** @typedef {import('../types').PresenceMessage} PresenceMessage */

/**
 * @typedef {Object} Slot
 * @property {string}      userId        - Always set (never null)
 * @property {'online'|'offline'} status - Current state
 * @property {number|null} offlineSince  - Clock value when departed (null if online)
 * @property {PresenceMessage|null} user - Full snapshot; always populated
 */

export class UserSlotManager {
  /** @type {Slot[]} */
  #slots = [];

  /** @type {number} */
  #gracePeriodMs;

  /** @type {() => number} */
  #clock;

  /**
   * @param {number}   gracePeriodMs - Grace period in ms (default 30000)
   * @param {() => number} [clock]   - () => number, defaults to () => Date.now()
   */
  constructor(gracePeriodMs = 30000, clock = () => Date.now()) {
    this.#gracePeriodMs = gracePeriodMs;
    this.#clock = clock;
  }

  /**
   * Feed the manager with the latest full user list.
   * This is the ONLY mutation point.
   * @param {PresenceMessage[]} users - all current online users (excluding self)
   * @returns {Slot[]} the updated slots array
   */
  update(users) {
    const incomingIds = new Set(users.map((u) => u.userId));

    // Phase 1 — Process departures (users who left)
    for (const slot of this.#slots) {
      if (slot.status === 'online' && !incomingIds.has(slot.userId)) {
        slot.status = 'offline';
        slot.offlineSince = this.#clock();
        // slot.user retained as snapshot for grey-out display
      }
    }

    // Phase 2 — Process arrivals and refresh online snapshots.
    // Keep an existing user's slot stable, but always replace its snapshot so
    // live presence fields such as tableId and ruleType do not become stale.
    for (const user of users) {
      const existingOnline = this.#slots.find(
        (slot) => slot.status === 'online' && slot.userId === user.userId,
      );
      if (existingOnline) {
        existingOnline.user = user;
      } else {
        this.#placeUser(user);
      }
    }

    return this.getSlots();
  }

  /**
   * Returns a shallow copy of current slots (for rendering).
   * @returns {Slot[]}
   */
  getSlots() {
    return [...this.#slots];
  }

  /**
   * Immediately clear all slots. Called on disconnect/reconnect.
   */
  reset() {
    this.#slots = [];
  }

  /**
   * Place a user into a slot.
   * @param {PresenceMessage} user
   * @private
   */
  #placeUser(user) {
    const now = this.#clock();

    // Step 1 — Reservation check: same userId reclaims their slot
    const existing = this.#slots.find((s) => s.userId === user.userId);
    if (existing) {
      existing.status = 'online';
      existing.offlineSince = null;
      existing.user = user;
      return;
    }

    // Step 2 — Evict oldest expired slot
    let oldestExpired = null;
    let oldestElapsed = 0;

    for (const slot of this.#slots) {
      if (slot.status === 'offline') {
        const elapsed = now - slot.offlineSince;
        if (elapsed > this.#gracePeriodMs && elapsed > oldestElapsed) {
          oldestExpired = slot;
          oldestElapsed = elapsed;
        }
      }
    }

    if (oldestExpired) {
      oldestExpired.userId = user.userId;
      oldestExpired.status = 'online';
      oldestExpired.offlineSince = null;
      oldestExpired.user = user;
      return;
    }

    // Step 3 — No slot available: push a new one
    this.#slots.push({
      userId: user.userId,
      status: 'online',
      offlineSince: null,
      user: user,
    });
  }
}
