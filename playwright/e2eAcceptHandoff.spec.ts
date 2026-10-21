import { test, expect } from '@playwright/test';
import { getFrame, HANDOFF_TIMEOUT, TEST_URL, VISIBILITY_TIMEOUT } from './setupHelpers';

/**
 * The game page's challenge-pill Accept redirects to
 *   lobby.html?action=join&acceptTableId=<tableId>&opponent.userId=...&ruletype=...
 * and this is the lobby half of that handoff. The offer's tableId cannot be read
 * back from the lobby (the presence channel keeps no history), so the test takes
 * it from the challenger's own pending challenge and replays the redirect.
 */
test.describe('in-game accept handoff', () => {
  test.setTimeout(45000);

  /** The tableId the challenger is currently offering. */
  const offeredTableId = (frame: import('@playwright/test').Frame) =>
    frame.evaluate(() => {
      const panel = document.querySelector('lobby-app')?.shadowRoot?.querySelector('online-panel');
      const challenges = Object.values(panel?.state?.challenges ?? {}) as Array<Record<string, string>>;
      return challenges.find((c) => c.status === 'pending')?.tableId ?? null;
    });

  const userIdOf = (frame: import('@playwright/test').Frame) =>
    new URL(frame.url()).searchParams.get('userId') ?? '';

  test('acceptTableId redirect lands both players on the offered table without a confirm click', async ({ page }) => {
    await page.goto(TEST_URL);
    const aliceFrame = await getFrame(page, new RegExp(`lobby\\.html.*Alice`));
    const bobFrame = await getFrame(page, new RegExp(`lobby\\.html.*Bob`));

    await expect(aliceFrame.locator(`user-list li[aria-label="Bob"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(bobFrame.locator(`user-list li[aria-label="Alice"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    // Bob challenges Alice from the lobby.
    await bobFrame.locator('button[aria-label="Challenge Alice"]').click();
    await bobFrame.locator('challenge-modal button[aria-label="eightball"]').click();
    const eightBallBtn = bobFrame.locator('challenge-modal .section-body.expanded button.rule').first();
    await expect(eightBallBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await eightBallBtn.click();

    await expect.poll(() => offeredTableId(bobFrame), { timeout: VISIBILITY_TIMEOUT }).not.toBeNull();
    const offerTableId = await offeredTableId(bobFrame);
    expect(offerTableId).toBeTruthy();

    // Alice is in a game and accepts there: the game page sends her back with
    // the accepted tableId plus the challenger to rejoin.
    const handoff = new URL('/lobby.html', TEST_URL);
    handoff.searchParams.set('action', 'join');
    handoff.searchParams.set('acceptTableId', offerTableId!);
    handoff.searchParams.set('ruletype', 'eightball');
    handoff.searchParams.set('opponent.userId', userIdOf(bobFrame));
    handoff.searchParams.set('opponent.userName', 'Bob');
    await aliceFrame.goto(handoff.toString());

    // No banner to confirm: the accept resolves to the challenger's table.
    await expect.poll(() => aliceFrame.url(), { timeout: HANDOFF_TIMEOUT }).toMatch(/tableId=/);
    await expect.poll(() => bobFrame.url(), { timeout: HANDOFF_TIMEOUT }).toMatch(/tableId=/);

    expect(new URL(aliceFrame.url()).searchParams.get('tableId')).toBe(offerTableId);
    expect(new URL(bobFrame.url()).searchParams.get('tableId')).toBe(offerTableId);
  });
});
