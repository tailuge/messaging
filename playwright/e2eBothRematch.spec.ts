import { test, expect } from '@playwright/test';
import { setupPlayersInGame, VISIBILITY_TIMEOUT } from './setupHelpers';

test.describe('E2E rematch', () => {
  test.setTimeout(20000);

  test('concede and both rematch automatically starts new game', async ({ page }) => {

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

    // Capture the first tableId to ensure the rematch uses a new one
    const firstTableId = new URL(aliceFrame.url()).searchParams.get('tableId');

    await Promise.all([
      aliceFrame.locator('button[data-notification-action="rematch"]').click(),
      bobFrame.locator('button[data-notification-action="rematch"]').click(),
    ]);

    // Both redirect back to lobby
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/lobby\.html/);
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/lobby\.html/);

    // Auto-challenge should fire and take them to a NEW game
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);

    const secondTableId = new URL(aliceFrame.url()).searchParams.get('tableId');
    expect(secondTableId).not.toBe(firstTableId);
  });
});
