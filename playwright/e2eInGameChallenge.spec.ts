import { test, expect } from '@playwright/test';
import { getFrame, TEST_URL, VISIBILITY_TIMEOUT } from './setupHelpers';
import { reduce, INITIAL_STATE } from '../src/client/utils.js';

test.describe('E2E rematch', () => {
  test.setTimeout(20000);

  const shortWait = 250;

  test('alice plays solo, bob challenges, alice accepts from game, both go to new game', async ({ page }) => {

    // starting with iframe of alice and bob in lobby
    await page.goto(TEST_URL);
    const aliceFrame = await getFrame(page, new RegExp(`lobby\\.html.*Alice`));
    const bobFrame = await getFrame(page, new RegExp(`lobby\\.html.*Bob`));

    // Alice sees Bob in online user list and Bob sees Alice
    await expect(aliceFrame.locator(`user-list li[aria-label="Bob"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(bobFrame.locator(`user-list li[aria-label="Alice"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    // alice clicks solo 8 ball game from solo-panel
    const soloBtn = aliceFrame.locator('button[aria-label="Play Eight Ball"]');
    await expect(soloBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await soloBtn.click();

    // alice is in game url.
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/ruletype=eightball/);

    await page.waitForTimeout(shortWait);

    // bob challenges alice to a game of 8-ball
    const challengeBtn = bobFrame.locator('button[aria-label="Challenge Alice"]');
    await expect(challengeBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await challengeBtn.click();
    const eightBallBtn = bobFrame.locator('challenge-modal button:has-text("Eight Ball")');
    await expect(eightBallBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await eightBallBtn.click();

    // in game alice sees challenge pill with accept button, clicks accept
    await expect(aliceFrame.locator('#challengePill')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await aliceFrame.locator('#challengeAccept').click();

    // expect alice to return to lobby and auto intitate accept (maybe no assert required?)
    // eventually both players should be in new game with same tableid
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);

    const aliceTableId = new URL(aliceFrame.url()).searchParams.get('tableId');
    const bobTableId = new URL(bobFrame.url()).searchParams.get('tableId');
    expect(aliceTableId).toBe(bobTableId);
  });

  test('bob plays solo, alice challenges, bob accepts from game, both go to new game', async ({ page }) => {

    // starting with iframe of alice and bob in lobby
    await page.goto(TEST_URL);
    const aliceFrame = await getFrame(page, new RegExp(`lobby\\.html.*Alice`));
    const bobFrame = await getFrame(page, new RegExp(`lobby\\.html.*Bob`));

    // Alice sees Bob in online user list and Bob sees Alice
    await expect(aliceFrame.locator(`user-list li[aria-label="Bob"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(bobFrame.locator(`user-list li[aria-label="Alice"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    // bob clicks solo 8 ball game from solo-panel
    const soloBtn = bobFrame.locator('button[aria-label="Play Eight Ball"]');
    await expect(soloBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await soloBtn.click();

    // bob is in game url.
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/ruletype=eightball/);

    // alice challenges bob to a game of 8-ball
    const challengeBtn = aliceFrame.locator('button[aria-label="Challenge Bob"]');
    await expect(challengeBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await challengeBtn.click();
    const eightBallBtn = aliceFrame.locator('challenge-modal button:has-text("Eight Ball")');
    await expect(eightBallBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await eightBallBtn.click();

    // in game bob sees challenge pill with accept button, clicks accept
    await expect(bobFrame.locator('#challengePill')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await bobFrame.locator('#challengeAccept').click();

    // eventually both players should be in new game with same tableid
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);

    const aliceTableId = new URL(aliceFrame.url()).searchParams.get('tableId');
    const bobTableId = new URL(bobFrame.url()).searchParams.get('tableId');
    expect(aliceTableId).toBe(bobTableId);
  });

  // ── Race condition reproduction: dual concurrent offer+accept ──────────────────
  //
  // When the returning player (Alice) reconnects to the lobby after "Accept" from
  // the in-game challenge pill:
  //
  //   1. Nchan replays buffered messages: first Bob's challenge offer, then Alice's
  //      own join (sentinel).
  //   2. ChallengeDeduplicator's 250ms timer fires → handleAutoChallengeOnMessage →
  //      acceptChallenge() starts (async, awaits HTTP POST of accept).
  //   3. Lobby's 300ms settle timer fires → checkAutoChallenge(). #autoChallenge is
  //      still set (acceptChallenge hasn't cleared it yet, it's awaiting).
  //      → sends a NEW challenge to Bob (HTTP POST).
  //   4. Two HTTP POSTs race to Nchan: the accept (started first) vs the new offer
  //      (started 50ms later).
  //
  // If the new offer reaches Nchan/Bob BEFORE the accept:
  //   - Bob receives Alice's new offer → simultaneous challenge tie-breaker
  //   - If Bob has lower ID: Bob yields, replaces pending with Alice's new tableId
  //   - Then Alice's accept arrives → tableId mismatch (pending.tableId=new, accept
  //     has original) → reduce ignores the accept
  //   - Bob's currentMatch stays null → Bob stuck waiting
  //
  // The same can happen on Alice's side: if CHALLENGE_SENT dispatches before
  // CHALLENGE_MSG(accept), reduce ignores Alice's own accept because her pending
  // challenge now has the new tableId, not the original.
  //
  // The tests below use the reduce() state machine directly to reproduce the bug.

  test('BUG REPRO: alice sends concurrent accept+offer, new offer arrives at bob before accept (bob lower ID)', () => {
    // Bob (aaa) is lower ID than Alice (zzz): 'aaa' < 'zzz' alphabetically
    // This is the susceptible case: lower-ID player yields to simultaneous offer
    const bobId = 'aaa';
    const aliceId = 'zzz';

    // Bob sent challenge to Alice with orig-table
    let bobState = reduce(INITIAL_STATE, {
      type: 'CHALLENGE_SENT',
      myId: bobId,
      payload: {
        challengerId: bobId, challengeeId: aliceId,
        tableId: 'orig-table', ruleType: 'eightball',
        recipientName: 'Alice',
      }
    });

    expect(bobState.challenges[aliceId].tableId).toBe('orig-table');
    expect(bobState.currentMatch).toBeNull();

    // Alice's NEW offer arrives at Bob FIRST (race winner: new offer)
    bobState = reduce(bobState, {
      type: 'CHALLENGE_MSG',
      myId: bobId,
      payload: {
        type: 'offer',
        challengerId: aliceId, challengeeId: bobId,
        tableId: 'new-table', ruleType: 'eightball',
      }
    });

    // Bob (lower ID, 'aaa' < 'zzz') yielded: pending replaced with Alice's new offer
    expect(bobState.challenges[aliceId].tableId).toBe('new-table');
    expect(bobState.currentMatch).toBeNull();

    // THEN Alice's accept arrives (for orig-table) — too late, tableId mismatch
    bobState = reduce(bobState, {
      type: 'CHALLENGE_MSG',
      myId: bobId,
      payload: {
        type: 'accept',
        challengerId: bobId, challengeeId: aliceId,
        tableId: 'orig-table', ruleType: 'eightball',
      }
    });

    // BUG: Accept ignored — Bob stuck with no currentMatch
    expect(bobState.currentMatch).toBeNull();
    expect(bobState.challenges[aliceId]).toBeDefined();
    expect(bobState.challenges[aliceId].tableId).toBe('new-table');
  });

  test('BUG REPRO: alice sends concurrent accept+offer, new offer reaches bob before accept (alice lower ID)', () => {
    // Alice is lower ID: alice < bob alphabetically
    let bobState = reduce(INITIAL_STATE, {
      type: 'CHALLENGE_SENT',
      myId: 'bob',
      payload: {
        challengerId: 'bob', challengeeId: 'alice',
        tableId: 'orig-table', ruleType: 'eightball',
        recipientName: 'Alice',
      }
    });

    expect(bobState.challenges['alice'].tableId).toBe('orig-table');

    // Alice's NEW offer arrives at Bob FIRST
    bobState = reduce(bobState, {
      type: 'CHALLENGE_MSG',
      myId: 'bob',
      payload: {
        type: 'offer',
        challengerId: 'alice', challengeeId: 'bob',
        tableId: 'new-table', ruleType: 'eightball',
      }
    });

    // Bob has higher ID: he keeps his own challenge, ignores Alice's new offer
    expect(bobState.challenges['alice'].tableId).toBe('orig-table');

    // THEN Alice's accept arrives (for orig-table) — matches, works fine
    bobState = reduce(bobState, {
      type: 'CHALLENGE_MSG',
      myId: 'bob',
      payload: {
        type: 'accept',
        challengerId: 'bob', challengeeId: 'alice',
        tableId: 'orig-table', ruleType: 'eightball',
      }
    });

    // Higher-ID Bob is fine: accept matches, currentMatch set
    expect(bobState.currentMatch).not.toBeNull();
    expect(bobState.currentMatch.tableId).toBe('orig-table');
  });

  test('BUG REPRO: alice local state corrupted when new-offer dispatch beats accept dispatch', () => {
    // Simulates Alice's local state when checkAutoChallenge's challenge() await
    // completes before acceptChallenge()'s await — the CHALLENGE_SENT dispatch
    // fires before the CHALLENGE_MSG(accept) dispatch.

    // Alice receives Bob's challenge offer (Nchan-buffered, through dedup)
    let aliceState = reduce(INITIAL_STATE, {
      type: 'CHALLENGE_MSG',
      myId: 'alice',
      payload: {
        type: 'offer',
        challengerId: 'bob', challengeeId: 'alice',
        tableId: 'orig-table', ruleType: 'eightball',
      }
    });

    expect(aliceState.challenges['bob'].tableId).toBe('orig-table');

    // Accept starts (HTTP POST) — but new-offer await completes first
    // CHALLENGE_SENT from checkAutoChallenge dispatches BEFORE accept returns
    aliceState = reduce(aliceState, {
      type: 'CHALLENGE_SENT',
      myId: 'alice',
      payload: {
        challengerId: 'alice', challengeeId: 'bob',
        tableId: 'new-table', ruleType: 'eightball',
        recipientName: 'Bob',
      }
    });

    // Alice's pending is now her own new challenge (replaced Bob's)
    expect(aliceState.challenges['bob'].tableId).toBe('new-table');
    expect(aliceState.challenges['bob'].challengerId).toBe('alice');

    // Now acceptChallenge() await completes → dispatches CHALLENGE_MSG(accept)
    aliceState = reduce(aliceState, {
      type: 'CHALLENGE_MSG',
      myId: 'alice',
      payload: {
        type: 'accept',
        challengerId: 'bob', challengeeId: 'alice',
        tableId: 'orig-table', ruleType: 'eightball',
      }
    });

    // BUG: Alice's own accept ignored — tableId mismatch
    // pending[bob].tableId = 'new-table', accept.tableId = 'orig-table'
    expect(aliceState.currentMatch).toBeNull();
    // Alice is stuck waiting for Bob to accept her new challenge
    expect(aliceState.challenges['bob'].tableId).toBe('new-table');
    expect(aliceState.challenges['bob'].challengerId).toBe('alice');
    expect(aliceState.challenges['bob'].status).toBe('pending');
  });
});
