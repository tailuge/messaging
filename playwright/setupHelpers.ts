import { expect, Page, Frame } from '@playwright/test';

export const TEST_URL = process.env.TEST_URL || 'http://localhost:80/test.html';
export const VISIBILITY_TIMEOUT = 3000;

/**
 * Open the game page's menu dropdown. The Concede button lives inside
 * <details id="menuDropdown">, so it is only visible once the menu is open.
 * Idempotent: clicking the summary of an already-open menu would close it.
 */
export async function openGameMenu(frame: Frame): Promise<void> {
  const details = frame.locator('#menuDropdown');
  const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
  if (isOpen) return;
  await frame.locator('#menuDropdown > summary[aria-label="Menu"]').click();
  await expect(details).toHaveJSProperty('open', true);
}

/** Assert the frame offers Concede, opening its menu first. */
export async function expectConcedeAvailable(frame: Frame): Promise<void> {
  await openGameMenu(frame);
  await expect(frame.locator('button[aria-label="Concede"]')).toBeVisible({
    timeout: VISIBILITY_TIMEOUT,
  });
}

/** Concede through the menu: open it, hit Concede, then confirm. */
export async function concedeFromMenu(frame: Frame): Promise<void> {
  await openGameMenu(frame);
  await frame.locator('button[aria-label="Concede"]').click();
  await frame.locator('button[data-notification-action="concede-confirm"]').click();
}

/**
 * Wait for a Playwright Frame whose current URL matches the given regex.
 * Uses expect.poll internally so there is no explicit sleep delay.
 */
export async function getFrame(page: Page, pattern: RegExp): Promise<Frame> {
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

  // Alice sees Bob in the lobby and clicks Challenge.
  // Scope within the specific <li> to avoid ambiguity when the slot manager
  // shows duplicate user entries (one with Challenge, one with Spectate).
  const challengeBtn = aliceFrame.locator(`user-list li[aria-label="${bobName}"]:not(.is-offline) button[aria-label="Challenge ${bobName}"]`);
  await expect(challengeBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
  await challengeBtn.click();

  // Alice selects Eight Ball from the modal. Rule variants live in collapsible
  // sections, so expand the eightball section and take its first (plain) rule.
  await aliceFrame.locator('challenge-modal button[aria-label="eightball"]').click();
  const eightBallBtn = aliceFrame.locator('challenge-modal .section-body.expanded button.rule').first();
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
