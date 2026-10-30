import { PresenceMessage } from "../src/types";
import {
  startContainer,
  stopContainer,
  createTestClient,
  getServer,
  wait,
} from "./utils";

// Reproduction for lostchallenge.md, run against the real Nchan image (the same
// docker/nginx.conf and docker/nchan_meta.js the server deploys).
//
// Scenario "sent during the gap": the target's game page unloads, publishing a
// `leave` and closing its lobby subscription. The challenger's offer is published
// while the target's next lobby is still connecting, so it reaches no connection.
// Section 8's success outcome is that the target sees the challenge when they
// arrive in the lobby.
//
// Section 11 already makes the server hold the offer (visible on /api/challenges);
// nothing re-delivers it on join yet, which is section 10's step 1.

type HeldChallenge = { challenger: string; challengee: string; since: number };

async function fetchOpenChallenges(): Promise<HeldChallenge[]> {
  const response = await fetch(`http://${getServer()}/api/challenges`, {
    cache: "no-store",
  });
  expect(response.ok).toBe(true);
  const body = (await response.json()) as { challenges: HeldChallenge[] };
  return body.challenges;
}

// Polls an async check until it returns true, or throws with the last value.
async function pollUntil(
  check: () => Promise<boolean>,
  timeout = 3000,
  what = "condition",
): Promise<void> {
  const start = Date.now();
  while (true) {
    if (await check()) return;
    if (Date.now() - start > timeout) {
      throw new Error(`pollUntil timeout after ${timeout}ms waiting for ${what}`);
    }
    await wait(50);
  }
}

async function isHeld(challenger: string, challengee: string): Promise<boolean> {
  const held = await fetchOpenChallenges();
  return held.some((c) => c.challenger === challenger && c.challengee === challengee);
}

const alice: PresenceMessage = {
  messageType: "presence",
  type: "join",
  userId: "lost-alice",
  userName: "Alice",
};

const bob: PresenceMessage = {
  messageType: "presence",
  type: "join",
  userId: "lost-bob",
  userName: "Bob",
};

describe("lostchallenge - offers sent while the target is between game and lobby", () => {
  beforeAll(async () => {
    await startContainer();
  }, 30000);

  afterAll(async () => {
    await stopContainer();
  });

  it("delivers a held offer when the target arrives in the lobby", async () => {
    // Alice waits in the lobby.
    const clientA = createTestClient();
    const lobbyA = await clientA.joinLobby(alice);
    await new Promise<void>((r) => lobbyA.onSettled(r));

    // Bob is on a game page: in the lobby, but at a table.
    const clientB = createTestClient();
    const lobbyB = await clientB.joinLobby({ ...bob, tableId: "game-table" });
    await new Promise<void>((r) => lobbyB.onSettled(r));

    // Bob leaves the game for the lobby. The game page publishes `leave` and
    // closes its subscription before the lobby page has subscribed.
    await lobbyB.leave();

    // Alice challenges Bob during that gap: nobody is subscribed to receive it.
    const tableId = await lobbyA.challenge(bob.userId, "eightball");

    // The server holds the offer already (section 11), so it is recoverable.
    await pollUntil(() => isHeld(alice.userId, bob.userId), 3000, "the offer to be held");

    // Bob arrives in the lobby with a fresh connection.
    const clientB2 = createTestClient();
    const lobbyB2 = await clientB2.joinLobby(bob);
    const offers: any[] = [];
    lobbyB2.onChallenge((c) => offers.push(c));
    await new Promise<void>((r) => lobbyB2.onSettled(r));

    // Section 8: "A target challenged near their exit sees the challenge when
    // they arrive in the lobby." Give a re-delivery time to land, then assert.
    await wait(1500);

    expect(offers.map((o) => o.tableId)).toContain(tableId);
    const delivered = offers.find((o) => o.tableId === tableId);
    expect(delivered?.type).toBe("offer");
    expect(delivered?.challengerId).toBe(alice.userId);
    expect(delivered?.ruleType).toBe("eightball");
  }, 30000);

  it("clears a held offer when the challenger goes offline, but not when the target leaves", async () => {
    const clientA = createTestClient();
    const lobbyA = await clientA.joinLobby({ ...alice, userId: "clear-alice" });
    await new Promise<void>((r) => lobbyA.onSettled(r));

    const clientB = createTestClient();
    const lobbyB = await clientB.joinLobby({ ...bob, userId: "clear-bob" });
    await new Promise<void>((r) => lobbyB.onSettled(r));

    // The target leaves: the offer is held for precisely this case, so it survives.
    await lobbyB.leave();
    await lobbyA.challenge("clear-bob", "eightball");
    await pollUntil(
      () => isHeld("clear-alice", "clear-bob"),
      3000,
      "the offer to be held",
    );

    // The challenger leaves: the target must no longer be able to accept.
    await lobbyA.leave();
    await pollUntil(
      async () => !(await isHeld("clear-alice", "clear-bob")),
      3000,
      "the held offer to be cleared",
    );
  }, 30000);
});
