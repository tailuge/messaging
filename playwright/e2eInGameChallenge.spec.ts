import { test, expect } from '@playwright/test';
import { challengeUser, confirmHandoffIfAsked, getFrame, HANDOFF_TIMEOUT, TEST_URL, VISIBILITY_TIMEOUT } from './setupHelpers';

test.describe('E2E rematch', () => {
  const shortWait = 250;

  test('alice plays solo, bob challenges, alice accepts from game, both go to new game', async ({ page }) => {

    // starting with iframe of alice and bob in lobby
    await page.goto(TEST_URL);
    const aliceFrame = await getFrame(page, new RegExp(`lobby\\.html.*Alice`));
    const bobFrame = await getFrame(page, new RegExp(`lobby\\.html.*Bob`));

    // Alice sees Bob in online user list and Bob sees Alice
    await expect(aliceFrame.locator(`user-list li[aria-label="Bob"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(bobFrame.locator(`user-list li[aria-label="Alice"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    // alice clicks solo 8 ball game from solo-panel
    const soloBtn = aliceFrame.locator('a[aria-label="Play Eight Ball"]');
    await expect(soloBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await soloBtn.click();

    // alice is in game url.
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/ruletype=eightball/);

    await page.waitForTimeout(shortWait);

    // bob challenges alice to a game of 8-ball
    await challengeUser(bobFrame, 'Alice', 'eightball');

    // in game alice sees challenge pill with accept button, clicks accept.
    // The game runs framed (test.html), so Accept opens the lobby handoff in a
    // new tab instead of navigating the frame: capture the popup and track it.
    await expect(aliceFrame.locator('#challengePill')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    const [alicePopup] = await Promise.all([
      page.context().waitForEvent('page'),
      aliceFrame.locator('#challengeAccept').click(),
    ]);

    // eventually both players should be in new game with same tableid
    await expect.poll(() => alicePopup.url(), { timeout: HANDOFF_TIMEOUT }).toMatch(/tableId=/);
    await expect.poll(() => bobFrame.url(), { timeout: HANDOFF_TIMEOUT }).toMatch(/tableId=/);

    const aliceTableId = new URL(alicePopup.url()).searchParams.get('tableId');
    const bobTableId = new URL(bobFrame.url()).searchParams.get('tableId');
    expect(aliceTableId).toBe(bobTableId);
  });

  test('bob plays solo, alice challenges, bob accepts from game, both go to new game', async ({ page }) => {

    // starting with iframe of alice and bob in lobby
    await page.goto(TEST_URL);
    const aliceFrame = await getFrame(page, new RegExp(`lobby\\.html.*Alice`));
    const bobFrame = await getFrame(page, new RegExp(`lobby\\.html.*Bob`));

    // Alice sees Bob in online user list and Bob sees Alice
    await expect(aliceFrame.locator(`user-list li[aria-label="Bob"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(bobFrame.locator(`user-list li[aria-label="Alice"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    // bob clicks solo 8 ball game from solo-panel
    const soloBtn = bobFrame.locator('a[aria-label="Play Eight Ball"]');
    await expect(soloBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await soloBtn.click();

    // bob is in game url.
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/ruletype=eightball/);

    // alice challenges bob to a game of 8-ball
    await challengeUser(aliceFrame, 'Bob', 'eightball');

    // in game bob sees challenge pill with accept button, clicks accept.
    // The game runs framed (test.html), so Accept opens the lobby handoff in a
    // new tab instead of navigating the frame: capture the popup and track it.
    await expect(bobFrame.locator('#challengePill')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    const [bobPopup] = await Promise.all([
      page.context().waitForEvent('page'),
      bobFrame.locator('#challengeAccept').click(),
    ]);

    // The in-game accept opens Bob's lobby in a new tab, which re-issues the
    // challenge; Alice (the original challenger) confirms it from the banner.
    await confirmHandoffIfAsked(aliceFrame);

    // eventually both players should be in new game with same tableid
    await expect.poll(() => aliceFrame.url(), { timeout: HANDOFF_TIMEOUT }).toMatch(/tableId=/);
    await expect.poll(() => bobPopup.url(), { timeout: HANDOFF_TIMEOUT }).toMatch(/tableId=/);

    const aliceTableId = new URL(aliceFrame.url()).searchParams.get('tableId');
    const bobTableId = new URL(bobPopup.url()).searchParams.get('tableId');
    expect(aliceTableId).toBe(bobTableId);
  });
});
