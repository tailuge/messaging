import { expect, Page, Frame } from '@playwright/test';

export const TEST_URL = process.env.TEST_URL || 'http://localhost:80/test.html';
export const VISIBILITY_TIMEOUT = 3000;
// The lobby handoff re-issues the challenge after a reload, so the confirming
// banner arrives a few seconds after the accept click, not instantly.
export const HANDOFF_TIMEOUT = 15000;

/**
 * Open the game page's menu dropdown. The Concede button lives inside
 * <details id="menuDropdown">, so it is only visible once the menu is open.
 * Idempotent: clicking the summary of an already-open menu would close it.
 */
export async function openGameMenu(frame: Frame): Promise<void> {
  const details = frame.locator('#menuDropdown');
  // getAttribute() waits for the element, with an explicit budget: the game page
  // can still be busy booting, and the 5s default actionTimeout is not enough.
  const isOpen = (await details.getAttribute('open', { timeout: HANDOFF_TIMEOUT })) !== null;
  if (isOpen) return;
  // force: the summary can be momentarily covered by a game notification while it
  // is still the control we want; the open-state assertion below still verifies it.
  await frame.locator('#menuDropdown > summary[aria-label="Menu"]').click({ timeout: HANDOFF_TIMEOUT, force: true });
  await expect(details).toHaveJSProperty('open', true, { timeout: HANDOFF_TIMEOUT });
}

/**
 * Challenges a user from the lobby: open the Challenge button on their row,
 * pick the rule family, then the first rule variant inside it. Both the modal
 * and the rule list are rendered after the click that precedes them, so each
 * step waits for the element it is about to act on instead of assuming the
 * previous click has already rendered.
 */
export async function challengeUser(
  target: Page | Frame,
  opponentName: string,
  ruleType = 'eightball',
  timeout = VISIBILITY_TIMEOUT,
): Promise<void> {
  // Scope within the specific <li> to avoid ambiguity when the slot manager
  // shows duplicate user entries (one with Challenge, one with Spectate).
  const challengeBtn = target
    .locator(`user-list li[aria-label="${opponentName}"]:not(.is-offline) button[aria-label="Challenge ${opponentName}"]`)
    .first();
  await expect(challengeBtn).toBeVisible({ timeout });
  await challengeBtn.click();

  const ruleTypeBtn = target.locator(`challenge-modal button[aria-label="${ruleType}"]`);
  await expect(ruleTypeBtn).toBeVisible({ timeout });
  // The modal keeps its expanded section across opens, and clicking an already
  // expanded header collapses it, so only expand when it is not open yet.
  if ((await ruleTypeBtn.getAttribute('aria-expanded')) !== 'true') await ruleTypeBtn.click();

  // Rule variants live in collapsible sections, so take the first rule of the
  // section the rule-type click just expanded.
  const ruleBtn = target.locator('challenge-modal .section-body.expanded button.rule').first();
  await expect(ruleBtn).toBeVisible({ timeout });
  await ruleBtn.click();
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
  // force: the menu items are the same transiently-covered controls as the summary.
  await frame.locator('button[aria-label="Concede"]').click({ force: true });
  await frame.locator('button[data-notification-action="concede-confirm"]').click({ force: true });
}

/**
 * After an in-game challenge accept, the game page only redirects the accepting
 * player to the lobby; that lobby re-issues the challenge and the original
 * challenger confirms it from the challenge banner. Waits for either outcome
 * (already launched into the table, or asked to confirm) and confirms if asked.
 */
export async function confirmHandoffIfAsked(frame: Frame, timeout = HANDOFF_TIMEOUT): Promise<void> {
  const accept = frame.locator('button[aria-label="Accept challenge"]');
  await expect
    .poll(
      async () => {
        if (/tableId=/.test(frame.url())) return true;
        return accept.isVisible().catch(() => false);
      },
      { timeout },
    )
    .toBe(true);
  if (!/tableId=/.test(frame.url())) await accept.click();
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
export async function setupPlayersInGame(page: Page, ruleType = 'eightball'): Promise<{ aliceFrame: Frame; bobFrame: Frame }> {
  const aliceName = 'Alice';
  const bobName = 'Bob';
  await page.goto(TEST_URL);

  const aliceFrame = await getFrame(page, new RegExp(`lobby\\.html.*${aliceName}`));
  const bobFrame = await getFrame(page, new RegExp(`lobby\\.html.*${bobName}`));

  // Alice sees Bob in the lobby and challenges him to the requested rule.
  await challengeUser(aliceFrame, bobName, ruleType);

  // Bob sees the incoming challenge and accepts
  const acceptBtn = bobFrame.locator('button[aria-label="Accept challenge"]');
  await expect(acceptBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
  await acceptBtn.click();

  // Verify both iframes navigated to the game page
  await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);
  await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);

  return { aliceFrame, bobFrame };
}
