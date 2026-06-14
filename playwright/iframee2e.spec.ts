import { test, expect, Page, Frame } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:80/test.html';
const VISIBILITY_TIMEOUT = 3000;

/**
 * Wait for a Playwright Frame whose current URL matches the given regex.
 * Uses expect.poll internally so there is no explicit sleep delay.
 */
async function getFrame(page: Page, pattern: RegExp): Promise<Frame> {
  await expect.poll(() => page.frame({ url: pattern }), { timeout: VISIBILITY_TIMEOUT }).toBeTruthy();
  return page.frame({ url: pattern })!;
}

/**
 * Navigates to the iframe test page with randomized user IDs,
 * then drives Alice to challenge Bob and Bob to accept.
 * Returns the Playwright Frame handles for both players once they are in-game.
 */
export async function setupPlayersInGame(page: Page): Promise<{ aliceFrame: Frame; bobFrame: Frame }> {
  const aliceName = 'Alice';
  const bobName = 'Bob';
  await page.goto(TEST_URL);

  const aliceFrame = await getFrame(page, new RegExp(`lobby\\.html.*${aliceName}`));
  const bobFrame = await getFrame(page, new RegExp(`lobby\\.html.*${bobName}`));

  // Alice sees Bob in the lobby and clicks Challenge
  const challengeBtn = aliceFrame.locator(`button[aria-label="Challenge ${bobName}"]`);
  await expect(challengeBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
  await challengeBtn.click();

  // Alice selects Eight Ball from the modal
  const eightBallBtn = aliceFrame.locator('challenge-modal button:has-text("Eight Ball")');
  await expect(eightBallBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
  await eightBallBtn.click();

  // Bob sees the incoming challenge and accepts
  const acceptBtn = bobFrame.locator('button[aria-label="Accept challenge"]');
  await expect(acceptBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
  await acceptBtn.click();

  // Verify both iframes navigated to the game page
  await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);
  await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);

  return { aliceFrame, bobFrame };
}

test.describe('Iframe E2E', () => {
  test.setTimeout(30000);

  test('concede triggers rematch flow', async ({ page }) => {
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
