import { test, expect } from '@playwright/test';
import {
  setupPlayersInGame,
  expectConcedeAvailable,
  concedeFromMenu,
  VISIBILITY_TIMEOUT,
} from './setupHelpers';

test.describe('E2E rematch', () => {
  test.setTimeout(20000);

  test('concede and both rematch automatically starts new game', async ({ page }) => {

    const { aliceFrame, bobFrame } = await setupPlayersInGame(page);

    // Both see the concede button once their game menu is open
    await expectConcedeAvailable(aliceFrame);
    await expectConcedeAvailable(bobFrame);

    // Bob concedes
    await concedeFromMenu(bobFrame);

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
