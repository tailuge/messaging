import { test, expect } from '@playwright/test';
import { setupPlayersInGame, VISIBILITY_TIMEOUT } from './setupHelpers';

test.describe('E2E rematch', () => {
  test.setTimeout(20000);

  test('alice sees bob, bob sees alice after game', async ({ page }) => {

    const { aliceFrame, bobFrame } = await setupPlayersInGame(page);

    // Both see the concede button on the game page
    await expect(aliceFrame.locator('button[aria-label="Concede"]')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(bobFrame.locator('button[aria-label="Concede"]')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    // Bob concedes
    await bobFrame.locator('button[aria-label="Concede"]').click();
    const concedeConfirm = bobFrame.locator('button[data-notification-action="concede-confirm"]');
    if (await concedeConfirm.isVisible({ timeout: VISIBILITY_TIMEOUT }).catch(() => false)) {
      await concedeConfirm.click();
    }

    // Game page shows rematch notification
    await expect(bobFrame.locator('button[data-notification-action="rematch"]')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(aliceFrame.locator('button[data-notification-action="rematch"]')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    // Alice returns to lobby then bob clicks rematch
    await aliceFrame.locator('button[data-notification-action="lobby"]').click();
    await page.waitForTimeout(1000);
    await bobFrame.locator('button[data-notification-action="lobby"]').click();

    // Both redirect back to lobby
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/lobby\.html/);
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/lobby\.html/);

    // Alice sees Bob in online user list and Bob sees Alice
    await expect(aliceFrame.locator(`user-list li[aria-label="Bob"]`)).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(bobFrame.locator(`user-list li[aria-label="Alice"]`)).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
  });
});
