import { test, expect } from '@playwright/test';

test.describe('Lobby Flow', () => {
  test('should complete a challenge/accept flow between two users', async ({ browser }) => {
    const setupUser = async (name: string, id: string) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.route('**/publish/presence/lobby', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) });
      });

      await page.goto(`http://localhost:80/lobby.html?id=${id}&name=${name}`);
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
        recipientId: 'bob',
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
        ...challengeMsg,
        type: 'accept'
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

  test('should handle a declined challenge', async ({ browser }) => {
    const setupUser = async (name: string, id: string) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('**/publish/presence/lobby', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) });
      });
      await page.goto(`http://localhost:80/lobby.html?id=${id}&name=${name}`);
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
      recipientId: 'bob', ruleType: 'eightball',
      tableId: 'test-table-123', meta: { country: 'US' }
    };

    await bob.page.evaluate((msg) => {
      (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, challengeMsg);

    await expect(bob.page.locator('button[aria-label="Decline challenge"]')).toBeVisible();

    // Bob declines
    await bob.page.locator('button[aria-label="Decline challenge"]').click();

    const declineMsg = { ...challengeMsg, type: 'decline' };
    await alice.page.evaluate((msg) => {
      (document.querySelector('lobby-app') as any)._ctrl.dispatch({ type: 'CHALLENGE_MSG', payload: msg });
    }, declineMsg);

    // Alice sees the declined message
    await expect(alice.page.locator('.declined')).toContainText('Bob declined your challenge');

    await alice.context.close();
    await bob.context.close();
  });
});
