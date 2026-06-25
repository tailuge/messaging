import { test, expect } from '@playwright/test';
import { getFrame, TEST_URL, VISIBILITY_TIMEOUT } from './setupHelpers';
import { reduce, INITIAL_STATE } from '../src/client/utils.js';

test.describe('E2E rematch', () => {
  test.setTimeout(20000);

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
    const soloBtn = aliceFrame.locator('button[aria-label="Play Eight Ball"]');
    await expect(soloBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await soloBtn.click();

    // alice is in game url.
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/ruletype=eightball/);

    await page.waitForTimeout(shortWait);

    // bob challenges alice to a game of 8-ball
    const challengeBtn = bobFrame.locator('button[aria-label="Challenge Alice"]');
    await expect(challengeBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await challengeBtn.click();
    const eightBallBtn = bobFrame.locator('challenge-modal button:has-text("Eight Ball")');
    await expect(eightBallBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await eightBallBtn.click();

    await page.waitForTimeout(shortWait);

    // in game alice sees challenge pill with accept button, clicks accept
    await expect(aliceFrame.locator('#challengePill')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await aliceFrame.locator('#challengeAccept').click();

    await page.waitForTimeout(shortWait);

    // expect alice to return to lobby and auto intitate accept (maybe no assert required?)
    // eventually both players should be in new game with same tableid
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);

    const aliceTableId = new URL(aliceFrame.url()).searchParams.get('tableId');
    const bobTableId = new URL(bobFrame.url()).searchParams.get('tableId');
    expect(aliceTableId).toBe(bobTableId);
  });

  test.skip('bob plays solo, alice challenges, bob accepts from game, both go to new game', async ({ page }) => {

    // starting with iframe of alice and bob in lobby
    await page.goto(TEST_URL);
    const aliceFrame = await getFrame(page, new RegExp(`lobby\\.html.*Alice`));
    const bobFrame = await getFrame(page, new RegExp(`lobby\\.html.*Bob`));

    // Alice sees Bob in online user list and Bob sees Alice
    await expect(aliceFrame.locator(`user-list li[aria-label="Bob"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await expect(bobFrame.locator(`user-list li[aria-label="Alice"]:not(.is-offline)`).first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

    // bob clicks solo 8 ball game from solo-panel
    const soloBtn = bobFrame.locator('button[aria-label="Play Eight Ball"]');
    await expect(soloBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await soloBtn.click();

    // bob is in game url.
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/ruletype=eightball/);

    // alice challenges bob to a game of 8-ball
    const challengeBtn = aliceFrame.locator('button[aria-label="Challenge Bob"]');
    await expect(challengeBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await challengeBtn.click();
    const eightBallBtn = aliceFrame.locator('challenge-modal button:has-text("Eight Ball")');
    await expect(eightBallBtn).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await eightBallBtn.click();

    // in game bob sees challenge pill with accept button, clicks accept
    await expect(bobFrame.locator('#challengePill')).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    await bobFrame.locator('#challengeAccept').click();

    // eventually both players should be in new game with same tableid
    await expect.poll(() => aliceFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);
    await expect.poll(() => bobFrame.url(), { timeout: VISIBILITY_TIMEOUT }).toMatch(/tableId=/);

    const aliceTableId = new URL(aliceFrame.url()).searchParams.get('tableId');
    const bobTableId = new URL(bobFrame.url()).searchParams.get('tableId');
    expect(aliceTableId).toBe(bobTableId);
  });

  });
