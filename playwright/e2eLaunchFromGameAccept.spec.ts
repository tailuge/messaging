import { test, expect, BrowserContext, Page } from '@playwright/test';
import { existsSync } from 'fs';

const LOBBY_URL = process.env.LOBBY_URL || 'http://localhost/lobby.html';
const GAME_BASE = process.env.GAME_URL || 'http://localhost:8080/';
const STALE_BUNDLE = process.env.STALE_LOBBY_JS || '/tmp/precodec-lobby.js';

// The stale-client variants need a pre-codec lobby bundle, i.e. the bundle a
// tab that was open before the wire codec was deployed is still running. Build
// it with:
//   git worktree add /tmp/precodec $(git log --diff-filter=A -1 --format=%H -- src/wire.ts)^
//   ln -s "$PWD/node_modules" /tmp/precodec/node_modules
//   npx esbuild /tmp/precodec/src/client/lobby.js --bundle --minify --outfile=/tmp/precodec-lobby.js
// Without it those two tests skip, so the suite still runs on a clean checkout.
const hasStaleBundle = existsSync(STALE_BUNDLE);

const WAIT = 10000;

const gameUrl = (userId: string, userName: string) =>
  `${GAME_BASE}?ruletype=eightball&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}` +
  `&lod=4&lobbyUrl=ws://localhost:80&test=1`;

/** Serves the pre-codec (1.42-era) lobby bundle, i.e. a cached / long-open tab. */
async function serveStaleLobby(ctx: BrowserContext) {
  await ctx.route('**/lobby.js', (route) =>
    route.fulfill({ path: STALE_BUNDLE, contentType: 'application/javascript' }),
  );
}

async function challenge( a: Page, bobName: string) {
  await a.locator(`user-list li[aria-label="${bobName}"]:not(.is-offline) button[aria-label="Challenge ${bobName}"]`).first().click();
  await a.locator('challenge-modal button[aria-label="eightball"]').click();
  await a.locator('challenge-modal .section-body.expanded button.rule').first().click();
}

/**
 * The game page only redirects the accepting player to the lobby; it never sends
 * the accept itself. That lobby re-issues the challenge to the original
 * challenger, who confirms it from the challenge banner. A pre-codec client
 * instead auto-accepts the replayed offer, so allow either outcome.
 */
async function acceptHandoffIfAsked(challenger: Page) {
  const accept = challenger.locator('button[aria-label="Accept challenge"]');
  const launched = () => /tableId=/.test(challenger.url());
  await expect
    .poll(async () => launched() || (await accept.isVisible().catch(() => false)), { timeout: WAIT })
    .toBe(true);
  if (!launched()) await accept.click();
}

/**
 * Challenges from the lobby and waits for the game page's challenge pill. An
 * offer that arrives while the game page is still settling its own lobby is
 * dropped before its challenge handler is registered, so a missed offer is
 * cancelled and retried rather than leaving the test stuck.
 */
async function challengeFromLobby(a: Page, b: Page, bobName: string) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await challenge(a, bobName);
    if (await b.locator('#challengePill').isVisible({ timeout: 2500 }).catch(() => false)) return;
    const cancel = a.locator('challenge-banner button.btn-leave');
    if (await cancel.isVisible().catch(() => false)) await cancel.click();
  }
  await expect(b.locator('#challengePill')).toBeVisible({ timeout: WAIT });
}

async function challengeAndAcceptFromGame(
  a: Page,
  b: Page,
  aliceId: string,
  bobId: string,
  bobName: string,
  staleSide: 'none' | 'challenger' | 'acceptor',
) {
  if (staleSide === 'challenger') await serveStaleLobby(a.context());
  if (staleSide === 'acceptor') await serveStaleLobby(b.context());

  await a.goto(`${LOBBY_URL}?userId=${aliceId}&userName=Alice`);
  await b.goto(`${LOBBY_URL}?userId=${bobId}&userName=${bobName}`);
  await expect(a.locator(`user-list li[aria-label="${bobName}"]:not(.is-offline)`).first()).toBeVisible({ timeout: WAIT });

  // Bob is in a game when the challenge arrives.
  await b.goto(gameUrl(bobId, bobName));

  // Alice challenges Bob from the lobby.
  await challengeFromLobby(a, b, bobName);

  // Bob accepts from inside his game; the game redirects to lobby.html?action=join...
  await b.locator('#challengeAccept').click();

  // ...where Bob's lobby re-challenges Alice, who confirms it.
  await acceptHandoffIfAsked(a);
}

function ids(label: string) {
  const suffix = Math.random().toString(36).slice(2, 7);
  return { aliceId: `alice-${label}-${suffix}`, bobId: `bob-${label}-${suffix}`, bobName: 'Bob' };
}

test.describe('launch from game accept', () => {
  test.setTimeout(90000);

  test('two in-game accept handoffs in a row (same pair, within nchan retention)', async ({ browser }) => {
    const { aliceId, bobId, bobName } = ids('x');
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    a.on('console', (m) => console.log(`[A:${m.type()}] ${m.text()}`));
    b.on('console', (m) => console.log(`[B:${m.type()}] ${m.text()}`));

    await challengeAndAcceptFromGame(a, b, aliceId, bobId, bobName, 'none');
    await expect.poll(() => a.url(), { timeout: WAIT }).toMatch(/tableId=/);
    const first = new URL(a.url()).searchParams.get('tableId');
    expect(new URL(b.url()).searchParams.get('tableId')).toBe(first);
    console.log(`round 1 table: ${first}`);

    // Both come back out of the first game: Alice returns to the lobby, Bob to
    // a solo game (a game page whose presence has no tableId, so he stays
    // challengeable) - exactly the state the reported handoff starts from.
    await a.goto(`${LOBBY_URL}?userId=${aliceId}&userName=Alice`);
    await b.goto(gameUrl(bobId, bobName));
    await expect(a.locator(`user-list li[aria-label="${bobName}"]:not(.is-offline)`).first()).toBeVisible({ timeout: WAIT });

    await challengeFromLobby(a, b, bobName);
    await b.locator('#challengeAccept').click();
    console.log(`round 2 B url after accept: ${b.url()}`);
    await acceptHandoffIfAsked(a);

    await expect.poll(() => a.url(), { timeout: WAIT }).toMatch(/tableId=/);
    await expect.poll(() => b.url(), { timeout: WAIT }).toMatch(/tableId=/);
    const second = new URL(a.url()).searchParams.get('tableId');
    expect(new URL(b.url()).searchParams.get('tableId')).toBe(second);
    expect(second).not.toBe(first);
  });

  // Both players tap "Rematch" in the game. The game builds the same handoff URL
  // (opponent.userId/userName + ruletype + nextTurnId), so both lobby pages load
  // with the accept intent at the same time.
  test('rematch: both players launch the lobby from the game with accept intent', async ({ browser }) => {
    const { aliceId, bobId, bobName } = ids('r');
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    a.on('console', (m) => console.log(`[A:${m.type()}] ${m.text()}`));
    b.on('console', (m) => console.log(`[B:${m.type()}] ${m.text()}`));

    await challengeAndAcceptFromGame(a, b, aliceId, bobId, bobName, 'none');
    await expect.poll(() => a.url(), { timeout: WAIT }).toMatch(/tableId=/);
    const first = new URL(a.url()).searchParams.get('tableId');
    expect(new URL(b.url()).searchParams.get('tableId')).toBe(first);
    console.log(`round 1 table: ${first}`);

    // The game's Rematch button: getLobbyUrl() + opponent params + nextTurnId.
    const handoff = (me: string, myName: string, opponentId: string, opponentName: string, nextTurnId: string) =>
      `${LOBBY_URL}?opponent.userId=${opponentId}&opponent.userName=${opponentName}` +
      `&ruletype=eightball&nextTurnId=${nextTurnId}&userId=${me}&userName=${myName}`;

    await Promise.all([
      a.goto(handoff(aliceId, 'Alice', bobId, bobName, bobId)),
      b.goto(handoff(bobId, bobName, aliceId, 'Alice', bobId)),
    ]);

    await expect.poll(() => a.url(), { timeout: WAIT }).toMatch(/tableId=/);
    await expect.poll(() => b.url(), { timeout: WAIT }).toMatch(/tableId=/);
    const second = new URL(a.url()).searchParams.get('tableId');
    expect(new URL(b.url()).searchParams.get('tableId')).toBe(second);
    expect(second).not.toBe(first);
  });

  for (const staleSide of ['none', 'challenger', 'acceptor'] as const) {
    test(`in-game accept handoff (stale=${staleSide}) lands both players on the same table`, async ({ browser }) => {
      test.skip(staleSide !== 'none' && !hasStaleBundle, `pre-codec bundle not found at ${STALE_BUNDLE}`);
      const { aliceId, bobId, bobName } = ids(staleSide);
      const a = await (await browser.newContext()).newPage();
      const b = await (await browser.newContext()).newPage();
      a.on('console', (m) => console.log(`[A:${m.type()}] ${m.text()}`));
      b.on('console', (m) => console.log(`[B:${m.type()}] ${m.text()}`));
      a.on('pageerror', (e) => console.log(`[A:error] ${e.message}`));
      b.on('pageerror', (e) => console.log(`[B:error] ${e.message}`));

      await challengeAndAcceptFromGame(a, b, aliceId, bobId, bobName, staleSide);

      console.log(`B url after accept: ${b.url()}`);
      await expect.poll(() => a.url(), { timeout: WAIT }).toMatch(/tableId=/);
      await expect.poll(() => b.url(), { timeout: WAIT }).toMatch(/tableId=/);
      expect(new URL(a.url()).searchParams.get('tableId')).toBe(new URL(b.url()).searchParams.get('tableId'));
    });
  }
});
