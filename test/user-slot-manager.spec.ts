// @ts-nocheck — strict mode disabled for test file with typed but simple objects
import { UserSlotManager } from "../src/client/user-slot-manager.js";

/** Minimal presence-like objects for testing */
function mkUser(userId, userName, ruleType) {
  return {
    userId,
    userName,
    ruleType: ruleType || "nineball",
    messageType: "presence",
    type: "join",
  };
}
const alice = mkUser("alice", "Alice");
const bob = mkUser("bob", "Bob", "eightball");
const charlie = mkUser("charlie", "Charlie", "snooker");
const dave = mkUser("dave", "Dave", "threecushion");

/** Helper: create a manager with a fake clock */
function createManager(graceMs) {
  let fakeNow = 0;
  const clock = function () {
    return fakeNow;
  };
  const manager = new UserSlotManager(graceMs || 30000, clock);
  return {
    manager: manager,
    advance: function (ms) {
      fakeNow += ms;
    },
    set: function (t) {
      fakeNow = t;
    },
  };
}

describe("UserSlotManager", function () {
  describe("basic join / leave", function () {
    it("1. Basic join — single user creates one online slot", function () {
      var _a = createManager(),
        manager = _a.manager;
      var slots = manager.update([alice]);
      expect(slots).toHaveLength(1);
      expect(slots[0].userId).toBe("alice");
      expect(slots[0].status).toBe("online");
      expect(slots[0].user).toBe(alice);
    });

    it("2. Basic leave — user departs, slot goes offline with snapshot", function () {
      var _a = createManager(),
        manager = _a.manager;
      manager.update([alice]);
      var slots = manager.update([]);
      expect(slots).toHaveLength(1);
      expect(slots[0].userId).toBe("alice");
      expect(slots[0].status).toBe("offline");
      expect(slots[0].user).toBe(alice); // snapshot retained
      expect(slots[0].offlineSince).toBe(0);
    });

    it("3. Reclaim within grace period — same user returns, slot reactivates", function () {
      var _a = createManager(),
        manager = _a.manager,
        advance = _a.advance;
      manager.update([alice]);
      manager.update([]); // alice leaves at t=0
      advance(10000); // 10 seconds later — within 30s grace
      var slots = manager.update([alice]);
      expect(slots).toHaveLength(1);
      expect(slots[0].status).toBe("online");
      expect(slots[0].offlineSince).toBeNull();
      expect(slots[0].user).toBe(alice);
    });

    it("4. Reclaim after grace period — reservation check still works", function () {
      var _a = createManager(),
        manager = _a.manager,
        advance = _a.advance;
      manager.update([alice]);
      manager.update([]); // alice leaves at t=0
      advance(60000); // 60 seconds — well past 30s grace
      var slots = manager.update([alice]);
      // Reservation check doesn't check expiry — user always reclaims
      expect(slots).toHaveLength(1);
      expect(slots[0].userId).toBe("alice");
      expect(slots[0].status).toBe("online");
    });

    it("5. Online updates refresh the snapshot without moving the slot", function () {
      var _a = createManager(),
        manager = _a.manager;
      var playingAlice = { ...alice, tableId: "table-1", type: "heartbeat" };
      var availableAlice = { ...alice, tableId: undefined, type: "join" };

      manager.update([playingAlice, bob]);
      var initialSlots = manager.getSlots();
      manager.update([availableAlice, bob]);
      var updatedSlots = manager.getSlots();

      expect(updatedSlots).toHaveLength(2);
      expect(updatedSlots[0]).toBe(initialSlots[0]);
      expect(updatedSlots[0].user).toBe(availableAlice);
      expect(updatedSlots[0].user.tableId).toBeUndefined();
      expect(updatedSlots[1].user).toBe(bob);
    });
  });

  describe("eviction logic", function () {
    it("6. Evict oldest expired — new user takes the oldest expired slot", function () {
      var _a = createManager(),
        manager = _a.manager,
        advance = _a.advance;
      manager.update([alice, bob]);
      manager.update([]); // both leave at t=0
      advance(31000); // past grace period
      var slots = manager.update([charlie]);
      // Both left at same time — alice is first in array, so she gets evicted
      expect(slots).toHaveLength(2);
      expect(slots[0].userId).toBe("charlie");
      expect(slots[0].status).toBe("online");
      expect(slots[0].user).toBe(charlie);
      // Bob's slot still offline at index 1
      expect(slots[1].userId).toBe("bob");
      expect(slots[1].status).toBe("offline");
    });

    it("7. Evict: picks the one with largest elapsed, not first in array", function () {
      var _a = createManager(),
        manager = _a.manager,
        advance = _a.advance;
      manager.update([alice]); // alice joins at t=0
      advance(10000); // t=10000
      manager.update([alice, bob]); // bob joins at t=10000
      // Alice leaves at t=20000
      advance(10000); // t=20000
      manager.update([bob]); // alice gone, bob stays → alice offlineSince=20000
      // Bob leaves at t=40000
      advance(20000); // t=40000
      manager.update([]); // bob offlineSince=40000
      // Advance to t=60000
      // alice elapsed = 60000-20000 = 40000 > 30000 ✓
      // bob elapsed   = 60000-40000 = 20000 < 30000 ✗ (still within grace)
      advance(20000); // t=60000
      var slots = manager.update([charlie]);
      // Alice has larger elapsed (40000ms) and is evicted, NOT bob (20000ms)
      expect(slots).toHaveLength(2);
      expect(slots[0].userId).toBe("charlie"); // alice evicted
      expect(slots[0].status).toBe("online");
      expect(slots[1].userId).toBe("bob"); // bob still offline, within grace
      expect(slots[1].status).toBe("offline");
    });

    it("8. Push when no expired slots — new user gets brand new slot", function () {
      var _a = createManager(),
        manager = _a.manager,
        advance = _a.advance;
      manager.update([alice]);
      manager.update([]); // alice leaves at t=0
      advance(10000); // only 10s — within grace period, not evictable
      var slots = manager.update([bob]);
      // Bob can't evict alice (within grace), so he pushes
      expect(slots).toHaveLength(2);
      expect(slots[0].userId).toBe("alice");
      expect(slots[0].status).toBe("offline");
      expect(slots[1].userId).toBe("bob");
      expect(slots[1].status).toBe("online");
    });
  });

  describe("multiple users", function () {
    it("9. Multiple joins — all get stable slots", function () {
      var _a = createManager(),
        manager = _a.manager;
      var slots = manager.update([alice, bob, charlie]);
      expect(slots).toHaveLength(3);
      expect(slots.map(function (s) { return s.userId; })).toEqual(["alice", "bob", "charlie"]);
      expect(slots.every(function (s) { return s.status === "online"; })).toBe(true);
    });

    it("10. Partial departures — some leave, some stay", function () {
      var _a = createManager(),
        manager = _a.manager;
      manager.update([alice, bob, charlie]);
      var slots = manager.update([charlie]); // alice and bob leave
      expect(slots).toHaveLength(3);
      expect(slots[0].userId).toBe("alice");
      expect(slots[0].status).toBe("offline");
      expect(slots[1].userId).toBe("bob");
      expect(slots[1].status).toBe("offline");
      expect(slots[2].userId).toBe("charlie");
      expect(slots[2].status).toBe("online");
    });

    it("11. Bots always in user list — never greyed out", function () {
      var _a = createManager(),
        manager = _a.manager;
      var bots = [mkUser("bot-clawbreak", "ClawBreak"), mkUser("bot-thefarjaw", "TheFarJaw")];
      // Feed bots alongside humans
      manager.update([alice].concat(bots));
      expect(manager.getSlots()).toHaveLength(3);
      // All still present — bots never leave because they're always in the list
      var slots = manager.update([alice].concat(bots));
      expect(slots.every(function (s) { return s.status === "online"; })).toBe(true);
      expect(slots).toHaveLength(3);
    });
  });

  describe("reset", function () {
    it("12. Reset clears all slots", function () {
      var _a = createManager(),
        manager = _a.manager;
      manager.update([alice, bob]);
      expect(manager.getSlots()).toHaveLength(2);
      manager.reset();
      expect(manager.getSlots()).toHaveLength(0);
    });

    it("13. Reset then update — fresh start", function () {
      var _a = createManager(),
        manager = _a.manager;
      manager.update([alice, bob]);
      manager.reset();
      var slots = manager.update([charlie]);
      expect(slots).toHaveLength(1);
      expect(slots[0].userId).toBe("charlie");
      expect(slots[0].status).toBe("online");
    });
  });

  describe("edge cases", function () {
    it("14. Empty updates — no users produces no slots", function () {
      var _a = createManager(),
        manager = _a.manager;
      expect(manager.update([])).toHaveLength(0);
    });

    it("15. Self-exclusion — manager never sees the user's own ID", function () {
      var _a = createManager(),
        manager = _a.manager;
      var slots = manager.update([alice, bob]);
      expect(slots.find(function (s) { return s.userId === "me"; })).toBeUndefined();
    });

    it("16. Stable indices — positions preserved across departures and new joins", function () {
      var _a = createManager(),
        manager = _a.manager,
        advance = _a.advance;
      manager.update([alice, bob]);
      // Bob leaves
      manager.update([alice]);
      // Advance past grace so bob's slot is evictable
      advance(31000);
      // Charlie joins — should take bob's slot (index 1), NOT shift alice
      var slots = manager.update([alice, charlie]);
      expect(slots).toHaveLength(2);
      expect(slots[0].userId).toBe("alice");
      expect(slots[0].status).toBe("online");
      expect(slots[1].userId).toBe("charlie");
      expect(slots[1].status).toBe("online");
    });

    it("17. Grace period boundary — exactly at the edge", function () {
      var _a = createManager(),
        manager = _a.manager,
        advance = _a.advance;
      manager.update([alice]);
      manager.update([]); // t=0
      advance(29999); // just inside grace
      var slots1 = manager.update([bob]);
      // Alice is not evictable yet (< 30000), so bob pushes
      expect(slots1).toHaveLength(2);
      expect(slots1[0].userId).toBe("alice");
      expect(slots1[0].status).toBe("offline");
      // Now advance past grace
      advance(2); // t=30001
      var slots2 = manager.update([bob, dave]);
      // Now alice's slot IS evictable (30001ms elapsed > 30000ms grace)
      // Dave should take alice's slot
      expect(slots2).toHaveLength(2);
      expect(slots2[0].userId).toBe("dave");
      expect(slots2[0].status).toBe("online");
      expect(slots2[1].userId).toBe("bob");
      expect(slots2[1].status).toBe("online");
    });
  });
});
