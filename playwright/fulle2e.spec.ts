import { test, expect } from '@playwright/test';

const LOBBY_URL = process.env.LOBBY_URL || 'http://localhost:80/lobby.html';
const VISIBILITY_TIMEOUT = 3000;

test.describe('Full E2E', () => {
  test.setTimeout(30000);

  const gameLaunch = async (browser: any) => {
    const setupUser = async (name: string, id: string) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      const url = `${LOBBY_URL}?userId=${id}&userName=${name}`;
      await page.goto(url);
      return { context, page };
    };

    const suffix = Math.random().toString(36).slice(2, 7);
    const alice = await setupUser('Alice', 'alice-' + suffix);
    const bob = await setupUser('Bob', 'bob-' + suffix);

    // Wait for Bob to appear in Alice's user list → Challenge button becomes visible
    const challengeBtn = alice.page.locator(`button[aria-label="Challenge Bob"]`);
    await expect(challengeBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    // Alice challenges Bob
    await challengeBtn.click();
    await alice.page.locator('challenge-modal button:has-text("Eight Ball")').click();

    // Bob sees the incoming challenge via Nchan
    const bobAcceptBtn = bob.page.locator('button[aria-label="Accept challenge"]');
    await expect(bobAcceptBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await bobAcceptBtn.click();

    // Both redirect to the game URL
    await expect(alice.page).toHaveURL(/tableId=/, { timeout: VISIBILITY_TIMEOUT });
    await expect(bob.page).toHaveURL(/tableId=/, { timeout: VISIBILITY_TIMEOUT });

    return { alice, bob };
  };

  test('full e2e: concede triggers rematch flow', async ({ browser }) => {
    const { alice, bob } = await gameLaunch(browser);

    // Both see the concede button on the game page
    await expect(alice.page.locator('button[aria-label="Concede"]')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(bob.page.locator('button[aria-label="Concede"]')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    // Bob concedes
    await bob.page.locator('button[aria-label="Concede"]').click();
    const concedeConfirm = bob.page.locator('button[data-notification-action="concede-confirm"]');
    if (await concedeConfirm.isVisible({ timeout: VISIBILITY_TIMEOUT }).catch(() => false)) {
      await concedeConfirm.click();
    }

    // Game page shows rematch notification — click rematch on both
    await expect(bob.page.locator('button[data-notification-action="rematch"]')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(alice.page.locator('button[data-notification-action="rematch"]')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    await Promise.all([
      alice.page.locator('button[data-notification-action="rematch"]').click(),
      bob.page.locator('button[data-notification-action="rematch"]').click(),
    ]);

    // Both redirect back to lobby
    await expect(alice.page).toHaveURL(/opponentId=/, { timeout: VISIBILITY_TIMEOUT });
    await expect(bob.page).toHaveURL(/opponentId=/, { timeout: VISIBILITY_TIMEOUT });

    // Auto-challenge fires via Nchan — one page gets an incoming challenge
    const aliceHasAccept = await alice.page.locator('button[aria-label="Accept challenge"]')
      .waitFor({ state: 'visible', timeout: VISIBILITY_TIMEOUT }).then(() => true).catch(() => false);
    if (!aliceHasAccept) {
      await expect(bob.page.locator('button[aria-label="Accept challenge"]'))
        .toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    }

    await alice.context.close();
    await bob.context.close();
  });
});
