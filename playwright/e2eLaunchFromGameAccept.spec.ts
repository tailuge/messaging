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
  await challenge(a, bobName);

  // Bob accepts from inside his game; the game redirects to lobby.html?action=join...
  await expect(b.locator('#challengePill')).toBeVisible({ timeout: WAIT });
  await b.locator('#challengeAccept').click();
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

    await challenge(a, bobName);
    await expect(b.locator('#challengePill')).toBeVisible({ timeout: WAIT });
    await b.locator('#challengeAccept').click();
    console.log(`round 2 B url after accept: ${b.url()}`);

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
