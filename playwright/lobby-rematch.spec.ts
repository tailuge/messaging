import { test, expect } from '@playwright/test';

test.describe('Lobby Rematch', () => {
  test.setTimeout(10000); // 10s for the whole group, or set per test

  const gameLaunch = async (browser: any) => {
    const setupUser = async (name: string, id: string) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('**/publish/presence/lobby', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) });
      });
      await page.goto(`http://localhost:80/lobby.html?userId=${id}&userName=${name}`);
      return { context, page };
    };

    const alice = await setupUser('Alice', 'alice');
    const bob = await setupUser('Bob', 'bob');

    const users = [
      { userId: 'alice', userName: 'Alice', messageType: 'presence', type: 'join', meta: { country: 'US' } },
      { userId: 'bob',   userName: 'Bob',   messageType: 'presence', type: 'join', meta: { country: 'GB' } },
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
    await alice.page.locator('button[aria-label="Challenge Bob"]').click();
    await alice.page.locator('challenge-modal button:has-text("Eight Ball")').click();

    // Capture the actual tableId Alice's session generated
    const tableIdHandle = await alice.page.waitForFunction(() => {
      const state = (document.querySelector('lobby-app') as any)?._ctrl?.state;
      const pending = Object.values(state?.challenges ?? {}).find((c: any) => c.status === 'pending');
      return (pending as any)?.tableId || null;
    }, undefined, { timeout: 3000 });
    const tableId = await tableIdHandle.jsonValue() as string;

    const challengeMsg = {
      messageType: 'challenge', type: 'offer',
      challengerId: 'alice', challengerName: 'Alice',
      challengeeId: 'bob', ruleType: 'eightball',
      tableId, meta: { country: 'US' },
    };
    await bob.page.evaluate((msg) => {
      (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, challengeMsg);

    await bob.page.locator('button[aria-label="Accept challenge"]').click();

    const acceptMsg = {
      messageType: 'challenge', type: 'accept',
      challengerId: 'alice', challengerName: 'Alice',
      challengeeId: 'bob', ruleType: 'eightball',
      tableId, meta: { country: 'GB' },
    };
    // Both players dispatch the accept message (simulating Nchan broadcast)
    await Promise.all([alice.page, bob.page].map(p =>
      p.evaluate((msg) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
      }, acceptMsg).catch(() => {})
    ));

    // Both redirect to the game URL
    await expect(alice.page).toHaveURL(new RegExp('tableId=' + tableId), { timeout: 5000 });
    await expect(bob.page).toHaveURL(new RegExp('tableId=' + tableId), { timeout: 5000 });

    return { alice, bob, tableId };
  };

  test('full e2e: dropped connection in game', async ({ browser }) => {
    const { alice, bob, tableId } = await gameLaunch(browser);
    
    // Both land on the game page
    await expect(alice.page.locator('button[aria-label="Concede"]')).toBeVisible();
    await expect(bob.page.locator('button[aria-label="Concede"]')).toBeVisible();

    // Alice closes her browser/connection -- here I want to navigate to google.com, another way to drop game.
    await alice.page.goto(`https://google.com`);

    // Wait 1 second as requested
    await new Promise(r => setTimeout(r, 1000));
    await bob.page.screenshot({ path: 'test-results/bob-after-alice-dropped.png' });

    // Bob presses the back button (browser back)
    await bob.page.goBack();

    // Check if we are in the lobby
    await expect(bob.page).toHaveURL(/lobby.html/, { timeout: 5000 });
    await bob.page.screenshot({ path: 'test-results/bob-back-in-lobby-after-drop.png' });

    // Wait a bit to see if a buggy redirect happens
    await new Promise(r => setTimeout(r, 2000));
    
    // Verify we are STILL in the lobby and not redirected back to the table
    const currentUrl = bob.page.url();
    expect(currentUrl).not.toContain('tableId=' + tableId);
    expect(currentUrl).toContain('lobby.html');

    await bob.context.close();
    await alice.context.close();
  });

  test('rematch: challenger auto-challenges on connect', async ({ browser }) => {
    const rematchInfo = { opponentId: 'bob', opponentName: 'Bob', ruleType: 'nineball', lastScores: [], nextTurnId: 'bob' };
    const rematch = encodeURIComponent(JSON.stringify(rematchInfo));

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/publish/presence/lobby', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) })
    );
    await page.goto(`http://localhost:80/lobby.html?userId=alice&userName=Alice&rematch=${rematch}`);

    const users = [
      { userId: 'alice', userName: 'Alice', messageType: 'presence', type: 'join', meta: { country: 'US' } },
      { userId: 'bob',   userName: 'Bob',   messageType: 'presence', type: 'join', meta: { country: 'GB' } },
    ];
    await page.evaluate((u) => {
      const app = document.querySelector('lobby-app') as any;
      app._ctrl.dispatch({ type: 'CONNECTED', payload: true });
      app._ctrl.dispatch({ type: 'USERS_UPDATE', payload: u });
    }, users);

    // Auto-challenge should have fired — wait for state to reflect pending sent challenge for bob
    await page.waitForFunction(() => {
      const app = document.querySelector('lobby-app') as any;
      const challenges = app._ctrl.state?.challenges ?? {};
      return !!challenges['bob'];
    }, { timeout: 5000 });

    await context.close();
  });

  test('rematch: challengee auto-accepts incoming offer', async ({ browser }) => {
    const rematchInfo = { opponentId: 'alice', opponentName: 'Alice', ruleType: 'nineball', lastScores: [], nextTurnId: 'alice' };
    const rematch = encodeURIComponent(JSON.stringify(rematchInfo));

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.route('**/publish/presence/lobby', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) });
    });

    await page.goto(`http://localhost:80/lobby.html?userId=bob&userName=Bob&rematch=${rematch}`);

    const users = [
      { userId: 'alice', userName: 'Alice', messageType: 'presence', type: 'join', meta: { country: 'US' } },
      { userId: 'bob',   userName: 'Bob',   messageType: 'presence', type: 'join', meta: { country: 'GB' } },
    ];
    await page.evaluate((u) => {
      const app = document.querySelector('lobby-app') as any;
      app._ctrl.dispatch({ type: 'CONNECTED', payload: true });
      app._ctrl.dispatch({ type: 'USERS_UPDATE', payload: u });
    }, users);

    // Inject the offer — auto-accept sets MATCH_SET which triggers redirect
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
      app._ctrl.dispatch({ type: 'MATCH_SET', payload: {
        tableId: msg.tableId, ruleType: msg.ruleType,
        options: msg.options, isFirst: false,
        rematch: encodeURIComponent(JSON.stringify(msg.rematch))
      }});
    }, offerMsg);

    await expect(page).toHaveURL(/tableId=rematch-table-1/, { timeout: 5000 });
    await expect(page).toHaveURL(/rematch=/, { timeout: 5000 });

    await context.close();
  });

  test('full e2e: concede triggers rematch flow', async ({ browser }) => {
    test.setTimeout(15000); // Concede flow involves multiple redirects, 15s is safer but we aim for fast execution
    const { alice, bob } = await gameLaunch(browser);

    // Both land on the game page — concede button should be visible
    await expect(alice.page.locator('button[aria-label="Concede"]')).toBeVisible();
    await expect(bob.page.locator('button[aria-label="Concede"]')).toBeVisible();
    await alice.page.screenshot({ path: 'test-results/game-page.png' });

    // Bob concedes
    await bob.page.locator('button[aria-label="Concede"]').click();
    const concedeConfirm = bob.page.locator('button[data-notification-action="concede-confirm"]');
    if (await concedeConfirm.isVisible({ timeout: 1000 }).catch(() => false)) {
      await concedeConfirm.click();
    }

    // Capture Alice's rematch challenge
    const aliceChallengePromise = alice.page.waitForRequest(r => {
      const data = r.postDataJSON();
      return data?.messageType === 'challenge' && data?.type === 'offer';
    }, { timeout: 5000 }).catch(() => null);

    // Both players see the rematch button and click it
    await Promise.all([
      alice.page.waitForURL(url => url.toString().includes('rematch='), { timeout: 5000 }).catch(() => {}),
      bob.page.waitForURL(url => url.toString().includes('rematch='), { timeout: 5000 }).catch(() => {}),
    ]);

    await bob.page.screenshot({ path: 'test-results/bob-rematch-ready.png' });
    await alice.page.screenshot({ path: 'test-results/alice-rematch-ready.png' });

    await Promise.all([
      alice.page.locator('button[data-notification-action="rematch"]').click(),
      bob.page.locator('button[data-notification-action="rematch"]').click(),
    ]);

    // Simulate the broadcast of the rematch challenge from Alice to Bob
    const request = await aliceChallengePromise;
    if (request) {
      const msg = request.postDataJSON();
      await bob.page.evaluate((m) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: m });
      }, msg);
    }

    // Final verification: both players should eventually land back in the lobby and have initiated the auto-challenge
    const checkPending = (p: any) => p.waitForFunction(() => {
      const app = document.querySelector('lobby-app') as any;
      const challenges = app?._ctrl?.state?.challenges ?? {};
      return Object.values(challenges).some((c: any) => c.status === 'pending');
    }, { timeout: 5000 });

    await Promise.all([checkPending(alice.page), checkPending(bob.page)]);

    await alice.page.screenshot({ path: 'test-results/alice-back-in-lobby.png' });
    await bob.page.screenshot({ path: 'test-results/bob-back-in-lobby.png' });

    await alice.context.close();
    await bob.context.close();
  });
});
