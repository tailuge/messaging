import { test, expect } from '@playwright/test';

const LOBBY_URL = process.env.LIVE === 'true' 
  ? 'https://billiards.tailuge.workers.dev/lobby.html' 
  : 'http://localhost:80/lobby.html';

const IS_LIVE = process.env.LIVE === 'true';

test.describe('Lobby Rematch', () => {
  test.setTimeout(60000); // Increased timeout for live environment

  const gameLaunch = async (browser: any) => {
    const setupUser = async (name: string, id: string) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      
      if (!IS_LIVE) {
        await page.route('**/publish/presence/lobby', async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) });
        });
      }

      const url = `${LOBBY_URL}?userId=${id}&userName=${name}`;
      
      await page.goto(url);
      return { context, page };
    };

    // Use unique IDs to avoid collisions in live environment
    const suffix = Math.random().toString(36).slice(2, 7);
    const alice = await setupUser('Alice', 'alice-' + suffix);
    const bob = await setupUser('Bob', 'bob-' + suffix);

    const aliceId = alice.page.url().match(/userId=([^&]+)/)?.[1] || 'alice-' + suffix;
    const bobId = bob.page.url().match(/userId=([^&]+)/)?.[1] || 'bob-' + suffix;

    if (!IS_LIVE) {
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
    } else {
      // Wait for both to be connected to the real server
      for (const { page } of [alice, bob]) {
        await page.waitForFunction(() => {
          const app = document.querySelector('lobby-app') as any;
          return app?._ctrl?.state?.connected;
        }, { timeout: 20000 });
      }
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

    if (!IS_LIVE) {
      const challengeMsg = {
        messageType: 'challenge', type: 'offer',
        challengerId: aliceId, challengerName: 'Alice',
        challengeeId: bobId, ruleType: 'eightball',
        tableId, meta: { country: 'US' },
      };
      await bob.page.evaluate((msg) => {
        (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
      }, challengeMsg);
    }

    await bob.page.locator('button[aria-label="Accept challenge"]').click();

    if (!IS_LIVE) {
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
    }

    // Both redirect to the game URL
    await expect(alice.page).toHaveURL(new RegExp('tableId=' + tableId), { timeout: 15000 });
    await expect(bob.page).toHaveURL(new RegExp('tableId=' + tableId), { timeout: 15000 });

    return { alice, bob, tableId, aliceId, bobId };
  };

  test('full e2e: dropped connection in game', async ({ browser }) => {
    const { alice, bob, tableId } = await gameLaunch(browser);
    
    await expect(bob.page.locator('button[aria-label="Concede"]')).toBeVisible({ timeout: 10000 });

    await alice.page.goto(`https://google.com`);
    await new Promise(r => setTimeout(r, 1000));
    await bob.page.screenshot({ path: 'test-results/bob-after-alice-dropped.png' });

    await bob.page.goBack();
    await expect(bob.page).toHaveURL(/lobby/, { timeout: 10000 });
    await bob.page.screenshot({ path: 'test-results/bob-back-in-lobby-after-drop.png' });

    await new Promise(r => setTimeout(r, 2000));
    
    const currentUrl = bob.page.url();
    expect(currentUrl).not.toContain('tableId=' + tableId);
    expect(currentUrl).toContain('lobby');

    await alice.context.close();
    await bob.context.close();
  });

  test('full e2e: exit game with back button', async ({ browser }) => {
    const { alice, bob, tableId } = await gameLaunch(browser);

    await expect(bob.page.locator('button[aria-label="Concede"]')).toBeVisible({ timeout: 10000 });

    await bob.page.goBack();
    await expect(bob.page).toHaveURL(/lobby/, { timeout: 10000 });
    await bob.page.screenshot({ path: 'test-results/bob-back-button-from-in-game.png' });

    if (!IS_LIVE) {
      const staleAccept = {
        messageType: 'challenge', type: 'accept',
        challengerId: 'alice', challengerName: 'Alice',
        challengeeId: 'bob', ruleType: 'eightball',
        tableId: tableId, meta: { ts: Date.now() },
      };
      await bob.page.evaluate((msg) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
      }, staleAccept);
    }

    try {
      await expect(bob.page).toHaveURL(new RegExp('tableId=' + tableId), { timeout: 3000 });
      await bob.page.screenshot({ path: 'test-results/bob-buggy-redirect-REPRODUCED.png' });
    } catch (e) {}

    const currentUrl = bob.page.url();
    expect(currentUrl, 'Should NOT have been redirected back to game').not.toContain('tableId=' + tableId);
    expect(currentUrl).toContain('lobby');

    await alice.context.close();
    await bob.context.close();
  });

  test('rematch: challenger auto-challenges on connect', async ({ browser }) => {
    const rematchInfo = { opponentId: 'bob', opponentName: 'Bob', ruleType: 'nineball', lastScores: [], nextTurnId: 'bob' };
    const rematch = encodeURIComponent(JSON.stringify(rematchInfo));

    const context = await browser.newContext();
    const page = await context.newPage();
    
    if (!IS_LIVE) {
      await page.route('**/publish/presence/lobby', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) })
      );
    }

    const url = `${LOBBY_URL}?userId=alice&userName=Alice&rematch=${rematch}`;

    await page.goto(url);

    if (!IS_LIVE) {
      const users = [
        { userId: 'alice', userName: 'Alice', messageType: 'presence', type: 'join', meta: { country: 'US' } },
        { userId: 'bob',   userName: 'Bob',   messageType: 'presence', type: 'join', meta: { country: 'GB' } },
      ];
      await page.evaluate((u) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CONNECTED', payload: true });
        app._ctrl.dispatch({ type: 'USERS_UPDATE', payload: u });
      }, users);
    }

    await page.waitForFunction(() => {
      const app = document.querySelector('lobby-app') as any;
      const challenges = app._ctrl.state?.challenges ?? {};
      return Object.values(challenges).some((c: any) => c.status === 'pending');
    }, { timeout: IS_LIVE ? 20000 : 10000 });

    if (!IS_LIVE) {
      // Simulate Bob accepting
      const tableIdHandle = await page.evaluateHandle(() => {
        const app = document.querySelector('lobby-app') as any;
        const pending = Object.values(app._ctrl.state.challenges).find((c: any) => c.status === 'pending');
        return (pending as any).tableId;
      });
      const tableId = await tableIdHandle.jsonValue();

      const acceptMsg = {
        messageType: 'challenge', type: 'accept',
        challengerId: 'alice', challengerName: 'Alice',
        challengeeId: 'bob', ruleType: 'nineball',
        tableId, meta: { ts: new Date().toISOString() },
      };
      await page.evaluate((msg) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
      }, acceptMsg);

      // Alice is challenger, but Bob is nextTurnId, so Alice should NOT be first
      await expect(page).toHaveURL(/tableId=/, { timeout: 10000 });
      expect(page.url()).not.toContain('first=true');
    }

    await context.close();
  });

  test('rematch: challengee auto-accepts incoming offer', async ({ browser }) => {
    const rematchInfo = { opponentId: 'alice', opponentName: 'Alice', ruleType: 'nineball', lastScores: [], nextTurnId: 'alice' };
    const rematch = encodeURIComponent(JSON.stringify(rematchInfo));

    const context = await browser.newContext();
    const page = await context.newPage();

    if (!IS_LIVE) {
      await page.route('**/publish/presence/lobby', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) });
      });
    }

    const url = `${LOBBY_URL}?userId=bob&userName=Bob&rematch=${rematch}`;

    await page.goto(url);

    if (!IS_LIVE) {
      const users = [
        { userId: 'alice', userName: 'Alice', messageType: 'presence', type: 'join', meta: { country: 'US' } },
        { userId: 'bob',   userName: 'Bob',   messageType: 'presence', type: 'join', meta: { country: 'GB' } },
      ];
      await page.evaluate((u) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CONNECTED', payload: true });
        app._ctrl.dispatch({ type: 'USERS_UPDATE', payload: u });
      }, users);

      const offerMsg = {
        messageType: 'challenge', type: 'offer',
        challengerId: 'alice', challengerName: 'Alice',
        challengeeId: 'bob', ruleType: 'nineball',
        tableId: 'rematch-table-1',
        rematch: rematchInfo,
        options: (rematchInfo as any).options,
        meta: { ts: new Date().toISOString() },
      };
      await page.evaluate((msg) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
      }, offerMsg);
    }

    await expect(page).toHaveURL(/tableId=/, { timeout: 15000 });
    await expect(page).toHaveURL(/rematch=/, { timeout: 15000 });
    expect(page.url()).not.toContain('first=true');

    await context.close();
  });

  test('rematch: challengee auto-accepts and goes first if nextTurnId matches', async ({ browser }) => {
    const rematchInfo = { opponentId: 'alice', opponentName: 'Alice', ruleType: 'nineball', lastScores: [], nextTurnId: 'bob' };
    const rematch = encodeURIComponent(JSON.stringify(rematchInfo));

    const context = await browser.newContext();
    const page = await context.newPage();

    if (!IS_LIVE) {
      await page.route('**/publish/presence/lobby', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) });
      });
    }

    const url = `${LOBBY_URL}?userId=bob&userName=Bob&rematch=${rematch}`;
    await page.goto(url);

    if (!IS_LIVE) {
      const users = [
        { userId: 'alice', userName: 'Alice', messageType: 'presence', type: 'join', meta: { country: 'US' } },
        { userId: 'bob',   userName: 'Bob',   messageType: 'presence', type: 'join', meta: { country: 'GB' } },
      ];
      await page.evaluate((u) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CONNECTED', payload: true });
        app._ctrl.dispatch({ type: 'USERS_UPDATE', payload: u });
      }, users);

      const offerMsg = {
        messageType: 'challenge', type: 'offer',
        challengerId: 'alice', challengerName: 'Alice',
        challengeeId: 'bob', ruleType: 'nineball',
        tableId: 'rematch-table-2',
        rematch: rematchInfo,
        meta: { ts: new Date().toISOString() },
      };
      await page.evaluate((msg) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
      }, offerMsg);
    }

    await expect(page).toHaveURL(/first=true/, { timeout: 15000 });
    await context.close();
  });

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
      alice.page.waitForURL(url => url.toString().includes('rematch='), { timeout: 10000 }).catch(() => {}),
      bob.page.waitForURL(url => url.toString().includes('rematch='), { timeout: 10000 }).catch(() => {}),
    ]);

    await Promise.all([
      alice.page.locator('button[data-notification-action="rematch"]').click(),
      bob.page.locator('button[data-notification-action="rematch"]').click(),
    ]);

    if (!IS_LIVE) {
      const request = await aliceChallengePromise;
      if (request) {
        const msg = request.postDataJSON();
        await bob.page.evaluate((m) => {
          const app = document.querySelector('lobby-app') as any;
          app._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: m });
        }, msg);
      }
    }

    const checkPending = (p: any) => p.waitForFunction(() => {
      const app = document.querySelector('lobby-app') as any;
      const challenges = app?._ctrl?.state?.challenges ?? {};
      return Object.values(challenges).some((c: any) => c.status === 'pending');
    }, { timeout: IS_LIVE ? 20000 : 10000 });

    await Promise.all([checkPending(alice.page), checkPending(bob.page)]);

    await alice.context.close();
    await bob.context.close();
  });
});
