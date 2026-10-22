import { test, expect } from '@playwright/test';
import {
  setupPlayersInGame,
  expectConcedeAvailable,
  concedeFromMenu,
  HANDOFF_TIMEOUT,
  VISIBILITY_TIMEOUT,
} from './setupHelpers';

test.describe('E2E rematch', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') await page.screenshot({ path: `screenshots/${testInfo.title.replace(/[^a-z0-9]+/gi, '-')}-fail.png`, fullPage: true });
  });

  test('concede and bob rematch, alice back to lobby show challenge', async ({ page }) => {

    const { aliceFrame, bobFrame } = await setupPlayersInGame(page, 'threecushion');

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
      bobFrame.locator('button[data-notification-action="rematch"]').click(),
      aliceFrame.locator('button[data-notification-action="lobby"]').click(),
    ]);

    // Both redirect back to lobby
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/lobby\.html/);
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/lobby\.html/);

    // Alice sees challenge banner from Bob. Bob's re-offer races her lobby's
    // reconnect, so allow the full handoff budget rather than the 3s used for
    // already-rendered UI.
    await expect(aliceFrame.locator('button[aria-label="Accept challenge"]')).toBeVisible({ timeout: HANDOFF_TIMEOUT });
    await expect(aliceFrame.locator('challenge-banner strong')).toContainText('Challenge from Bob', { timeout: HANDOFF_TIMEOUT });
  });
});
