import { test, expect } from '@playwright/test';

const LOBBY_URL = process.env.LOBBY_URL || 'http://localhost:80/lobby.html';

test.describe('Full E2E', () => {
  test.setTimeout(30000);

  const gameLaunch = async (browser: any) => {
    const setupUser = async (name: string, id: string) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.route('**/publish/presence/lobby', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) });
      });

      const url = `${LOBBY_URL}?userId=${id}&userName=${name}`;

      await page.goto(url);
      return { context, page };
    };

    // Use unique IDs to avoid collisions
    const suffix = Math.random().toString(36).slice(2, 7);
    const alice = await setupUser('Alice', 'alice-' + suffix);
    const bob = await setupUser('Bob', 'bob-' + suffix);

    // Pause to let the user position the two windows side by side
    await new Promise(r => setTimeout(r, 10000));

    const aliceId = alice.page.url().match(/userId=([^&]+)/)?.[1] || 'alice-' + suffix;
    const bobId = bob.page.url().match(/userId=([^&]+)/)?.[1] || 'bob-' + suffix;

    const users = [
      { userId: aliceId, userName: 'Alice', messageType: 'presence', type: 'join', meta: { country: 'US' } },
      { userId: bobId,   userName: 'Bob',   messageType: 'presence', type: 'join', meta: { country: 'GB' } },
    ];
    for (const { page } of [alice, bob]) {
      await page.waitForFunction(() => {
        const app = document.querySelector('lobby-app') as any;
        return app && app._ctrl;
      }, { timeout: 5000 });
      await page.evaluate((u) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CONNECTED', payload: true });
        app._ctrl.dispatch({ type: 'USERS_UPDATE', payload: u });
      }, users);
    }

    // Alice challenges Bob
    const challengeBtn = alice.page.locator(`button[aria-label="Challenge Bob"]`);
    await challengeBtn.waitFor({ state: 'visible', timeout: 10000 });
    await challengeBtn.click();
    await alice.page.locator('challenge-modal button:has-text("Eight Ball")').click();

    // Capture the actual tableId Alice's session generated
    const tableIdHandle = await alice.page.waitForFunction(() => {
      const state = (document.querySelector('lobby-app') as any)?._ctrl?.state;
      const pending = Object.values(state?.challenges ?? {}).find((c: any) => c.status === 'pending');
      return (pending as any)?.tableId || null;
    }, undefined, { timeout: 10000 });
    const tableId = await tableIdHandle.jsonValue() as string;

    const challengeMsg = {
      messageType: 'challenge', type: 'offer',
      challengerId: aliceId, challengerName: 'Alice',
      challengeeId: bobId, ruleType: 'eightball',
      tableId, meta: { country: 'US' },
    };
    await bob.page.evaluate((msg) => {
      (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, challengeMsg);

    await bob.page.locator('button[aria-label="Accept challenge"]').click();

    const acceptMsg = {
      messageType: 'challenge', type: 'accept',
      challengerId: aliceId, challengerName: 'Alice',
      challengeeId: bobId, ruleType: 'eightball',
      tableId, meta: { country: 'GB' },
    };
    await Promise.all([alice.page, bob.page].map(p =>
      p.evaluate((msg) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
      }, acceptMsg).catch(() => {})
    ));

    // Both redirect to the game URL
    await expect(alice.page).toHaveURL(new RegExp('tableId=' + tableId), { timeout: 15000 });
    await expect(bob.page).toHaveURL(new RegExp('tableId=' + tableId), { timeout: 15000 });

    return { alice, bob, tableId, aliceId, bobId };
  };

  test('full e2e: concede triggers rematch flow', async ({ browser }) => {
    const { alice, bob } = await gameLaunch(browser);

    await expect(alice.page.locator('button[aria-label="Concede"]')).toBeVisible({ timeout: 10000 });
    await expect(bob.page.locator('button[aria-label="Concede"]')).toBeVisible({ timeout: 10000 });

    await bob.page.locator('button[aria-label="Concede"]').click();
    const concedeConfirm = bob.page.locator('button[data-notification-action="concede-confirm"]');
    if (await concedeConfirm.isVisible({ timeout: 1000 }).catch(() => false)) {
      await concedeConfirm.click();
    }

    const aliceChallengePromise = alice.page.waitForRequest(r => {
      const data = r.postDataJSON();
      return data?.messageType === 'challenge' && data?.type === 'offer';
    }, { timeout: 10000 }).catch(() => null);

    await Promise.all([
      alice.page.waitForURL(url => url.toString().includes('opponentId='), { timeout: 10000 }).catch(() => {}),
      bob.page.waitForURL(url => url.toString().includes('opponentId='), { timeout: 10000 }).catch(() => {}),
    ]);

    await alice.page.screenshot({ path: 'test-results/alice-before-rematch-click.png' });
    await bob.page.screenshot({ path: 'test-results/bob-before-rematch-click.png' });

    await Promise.all([
      alice.page.locator('button[data-notification-action="rematch"]').click().catch(async (e) => {
        await alice.page.screenshot({ path: 'test-results/alice-rematch-click-failed.png' });
        throw e;
      }),
      bob.page.locator('button[data-notification-action="rematch"]').click().catch(async (e) => {
        await bob.page.screenshot({ path: 'test-results/bob-rematch-click-failed.png' });
        throw e;
      }),
    ]);

    const request = await aliceChallengePromise;
    if (request) {
      const msg = request.postDataJSON();
      await bob.page.evaluate((m) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: m });
      }, msg);
    }

    const checkPending = (p: any) => p.waitForFunction(() => {
      const app = document.querySelector('lobby-app') as any;
      const challenges = app?._ctrl?.state?.challenges ?? {};
      return Object.values(challenges).some((c: any) => c.status === 'pending');
    }, { timeout: 10000 });

    await Promise.all([checkPending(alice.page), checkPending(bob.page)]);

    await alice.context.close();
    await bob.context.close();
  });
});
