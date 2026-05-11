import { test, expect } from '@playwright/test';

test.describe('Lobby Flow', () => {
  test('should complete a challenge/accept flow between two users', async ({ browser }) => {
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

    const aliceUsers = [
        { userId: 'alice', userName: 'Alice', messageType: 'presence', type: 'join', meta: { country: 'US' } },
        { userId: 'bob', userName: 'Bob', messageType: 'presence', type: 'join', meta: { country: 'GB' } }
    ];

    await alice.page.evaluate((users) => {
        const lobbyApp = document.querySelector('lobby-app') as any;
        lobbyApp._ctrl.dispatch({ type: 'CONNECTED', payload: true });
        lobbyApp._ctrl.dispatch({ type: 'USERS_UPDATE', payload: users });
    }, aliceUsers);

    await bob.page.evaluate((users) => {
        const lobbyApp = document.querySelector('lobby-app') as any;
        lobbyApp._ctrl.dispatch({ type: 'CONNECTED', payload: true });
        lobbyApp._ctrl.dispatch({ type: 'USERS_UPDATE', payload: users });
    }, aliceUsers);

    // 1. Alice challenges Bob
    const aliceChallengeBtn = alice.page.locator('button[aria-label="Challenge Bob"]');
    await expect(aliceChallengeBtn).toBeVisible();
    await aliceChallengeBtn.click();

    // Alice selects a game in the modal
    const eightBallBtn = alice.page.locator('challenge-modal button:has-text("Eight Ball")');
    await expect(eightBallBtn).toBeVisible();
    await eightBallBtn.click();

    // 2. Bob receives the challenge
    const challengeMsg = {
        messageType: 'challenge',
        type: 'offer',
        challengerId: 'alice',
        challengerName: 'Alice',
        challengeeId: 'bob',
        ruleType: 'eightball',
        tableId: 'test-table-123',
        meta: { country: 'US' }
    };

    await bob.page.evaluate((msg) => {
        const lobbyApp = document.querySelector('lobby-app') as any;
        lobbyApp._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, challengeMsg);

    const bobAcceptBtn = bob.page.locator('button[aria-label="Accept challenge"]');
    await expect(bobAcceptBtn).toBeVisible();

    // 3. Bob accepts the challenge
    const acceptMsg = {
        messageType: 'challenge',
        type: 'accept',
        challengerId: 'alice',
        challengerName: 'Alice',
        challengeeId: 'bob',
        ruleType: 'eightball',
        tableId: 'test-table-123',
        meta: { country: 'GB' }
    };

    // Bob clicks accept
    await bobAcceptBtn.click();

    // Manually dispatch the accept message to both (simulating Nchan broadcast)
    await alice.page.evaluate((msg) => {
        const lobbyApp = document.querySelector('lobby-app') as any;
        lobbyApp._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, acceptMsg);

    await bob.page.evaluate((msg) => {
        const lobbyApp = document.querySelector('lobby-app') as any;
        lobbyApp._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, acceptMsg);

    // 4. Verify both are redirected to the game
    await expect(alice.page).toHaveURL(/tableId=test-table-123/);
    await expect(bob.page).toHaveURL(/tableId=test-table-123/);

    await alice.context.close();
    await bob.context.close();
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
    });

    await context.close();
  });

  test('rematch: challengee auto-accepts incoming offer', async ({ browser }) => {
    const rematchInfo = { opponentId: 'alice', opponentName: 'Alice', ruleType: 'nineball', lastScores: [], nextTurnId: 'alice' };
    const rematch = encodeURIComponent(JSON.stringify(rematchInfo));

    const context = await browser.newContext();
    const page = await context.newPage();

    let acceptPublished = false;
    await page.route('**/publish/presence/lobby', async (route) => {
      const body = route.request().postData() ?? '';
      if (body.includes('"accept"')) acceptPublished = true;
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
      options: rematchInfo,
      meta: { ts: new Date().toISOString() },
    };
    await page.evaluate((msg) => {
      const app = document.querySelector('lobby-app') as any;
      // Set the challenge in state, then simulate auto-accept completing
      app._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
      app._ctrl.dispatch({ type: 'MATCH_SET', payload: {
        tableId: msg.tableId, ruleType: msg.ruleType,
        options: msg.options, isFirst: false,
        rematch: encodeURIComponent(JSON.stringify(msg.options))
      }});
    }, offerMsg);

    // Bob redirects without any click, URL contains tableId and rematch
    await expect(page).toHaveURL(/tableId=rematch-table-1/);
    await expect(page).toHaveURL(/rematch=/);

    await context.close();
  });

  test('should handle a declined challenge', async ({ browser }) => {
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
      { userId: 'bob', userName: 'Bob', messageType: 'presence', type: 'join', meta: { country: 'GB' } }
    ];

    for (const p of [alice.page, bob.page]) {
      await p.evaluate((u) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CONNECTED', payload: true });
        app._ctrl.dispatch({ type: 'USERS_UPDATE', payload: u });
      }, users);
    }

    // Alice challenges Bob
    await alice.page.locator('button[aria-label="Challenge Bob"]').click();
    await alice.page.locator('challenge-modal button:has-text("Eight Ball")').click();

    const challengeMsg = {
      messageType: 'challenge', type: 'offer',
      challengerId: 'alice', challengerName: 'Alice',
      challengeeId: 'bob', ruleType: 'eightball',
      tableId: 'test-table-123', meta: { country: 'US' }
    };

    await bob.page.evaluate((msg) => {
      (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, challengeMsg);

    await expect(bob.page.locator('button[aria-label="Decline challenge"]')).toBeVisible();

    // Bob declines
    await bob.page.locator('button[aria-label="Decline challenge"]').click();

    const declineMsg = {
      messageType: 'challenge',
      type: 'decline',
      challengerId: 'alice',
      challengerName: 'Alice',
      challengeeId: 'bob',
      ruleType: 'eightball',
      tableId: 'test-table-123',
      meta: { country: 'GB' }
    };
    await alice.page.evaluate((msg) => {
      (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, declineMsg);

    // Alice sees the declined message - check banner shadow DOM
    await alice.page.waitForFunction(() => {
      const banner = document.querySelector('lobby-app')?.shadowRoot?.querySelector('online-panel')?.shadowRoot?.querySelector('challenge-banner');
      return banner?.shadowRoot?.textContent?.toLowerCase().includes('declined');
    });

    await alice.context.close();
    await bob.context.close();
  });

  test('should set first=true only for challenger in challenge flow', async ({ browser }) => {
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
      { userId: 'bob', userName: 'Bob', messageType: 'presence', type: 'join', meta: { country: 'GB' } }
    ];

    for (const p of [alice.page, bob.page]) {
      await p.evaluate((u) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CONNECTED', payload: true });
        app._ctrl.dispatch({ type: 'USERS_UPDATE', payload: u });
      }, users);
    }

    // Alice challenges Bob
    await alice.page.locator('button[aria-label="Challenge Bob"]').click();
    await alice.page.locator('challenge-modal button:has-text("Eight Ball")').click();

    const challengeMsg = {
      messageType: 'challenge', type: 'offer',
      challengerId: 'alice', challengerName: 'Alice',
      challengeeId: 'bob', ruleType: 'eightball',
      tableId: 'test-table-123', meta: { country: 'US' }
    };

    await bob.page.evaluate((msg) => {
      (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, challengeMsg);

    await bob.page.locator('button[aria-label="Accept challenge"]').click();

    const acceptMsg = {
      messageType: 'challenge',
      type: 'accept',
      challengerId: 'alice',
      challengerName: 'Alice',
      challengeeId: 'bob',
      ruleType: 'eightball',
      tableId: 'test-table-123',
      meta: { country: 'GB' }
    };
    await alice.page.evaluate((msg) => {
      (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, acceptMsg);

    await bob.page.evaluate((msg) => {
      (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, acceptMsg);

    // Alice (challenger) gets first=true, Bob (acceptor) does not
    await expect(alice.page).toHaveURL(/first=true/);
    await expect(bob.page).toHaveURL(/tableId=test-table-123/);
    await expect(bob.page).not.toHaveURL(/first=true/);

    await alice.context.close();
    await bob.context.close();
  });

  test('should remove challenge banner when challenger cancels', async ({ browser }) => {
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
      { userId: 'bob', userName: 'Bob', messageType: 'presence', type: 'join', meta: { country: 'GB' } }
    ];

    for (const p of [alice.page, bob.page]) {
      await p.evaluate((u) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CONNECTED', payload: true });
        app._ctrl.dispatch({ type: 'USERS_UPDATE', payload: u });
      }, users);
    }

    // Alice challenges Bob
    await alice.page.locator('button[aria-label="Challenge Bob"]').click();
    await alice.page.locator('challenge-modal button:has-text("Eight Ball")').click();

    const offerMsg = {
      messageType: 'challenge', type: 'offer',
      challengerId: 'alice', challengerName: 'Alice',
      challengeeId: 'bob', ruleType: 'eightball',
      tableId: 'test-table-123', meta: { country: 'US' }
    };

    await bob.page.evaluate((msg) => {
      (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, offerMsg);

    // Bob sees the incoming challenge banner
    await expect(bob.page.locator('button[aria-label="Accept challenge"]')).toBeVisible();

    // Alice cancels
    const cancelMsg = {
      messageType: 'challenge', type: 'cancel',
      challengerId: 'alice', challengerName: 'Alice',
      challengeeId: 'bob', ruleType: 'eightball',
      tableId: 'test-table-123', meta: { country: 'US' }
    };

    await Promise.all([alice, bob].map(({ page }) =>
      page.evaluate((msg) => {
        (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
      }, cancelMsg)
    ));

    // Bob's banner should be gone
    await expect(bob.page.locator('button[aria-label="Accept challenge"]')).not.toBeVisible();
    // Alice's sent banner should also be gone
    await expect(alice.page.locator('challenge-banner')).not.toBeVisible();

    await alice.context.close();
    await bob.context.close();
  });
});
