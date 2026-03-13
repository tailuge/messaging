import { test, expect } from '@playwright/test';

test.describe('Game iframe URL', () => {
  test('should set first=true only for the challenger (seek creator)', async ({ browser }) => {
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    await alicePage.goto('http://localhost/example/client.html?id=alice&name=Alice');
    await bobPage.goto('http://localhost/example/client.html?id=bob&name=Bob');

    await alicePage.waitForSelector('#conn-status.online', { timeout: 10000 });
    await bobPage.waitForSelector('#conn-status.online', { timeout: 10000 });

    // Alice creates a seek
    await alicePage.click('#btn-find-game');
    await alicePage.waitForSelector('#seek-container:visible', { timeout: 5000 });

    // Bob joins Alice's seek
    await bobPage.waitForSelector('.btn-join', { timeout: 5000 });
    await bobPage.click('.btn-join');

    // Both should now be in game
    await expect(alicePage.locator('#game-container')).toBeVisible();
    await expect(bobPage.locator('#game-container')).toBeVisible();

    // Wait for iframes to load
    await alicePage.waitForSelector('#game-iframe:not([src=""])', { timeout: 5000 });
    await bobPage.waitForSelector('#game-iframe:not([src=""])', { timeout: 5000 });

    // Check Alice's iframe URL - she created the seek, so first=true
    const aliceIframe = alicePage.locator('#game-iframe');
    const aliceSrc = await aliceIframe.getAttribute('src');
    expect(aliceSrc).toContain('first=true');
    expect(aliceSrc).not.toContain('first=false');

    // Check Bob's iframe URL - he joined, so first should NOT be present
    const bobIframe = bobPage.locator('#game-iframe');
    const bobSrc = await bobIframe.getAttribute('src');
    expect(bobSrc).not.toContain('first=');

    await aliceContext.close();
    await bobContext.close();
  });

  test('should set first=true only for challenger in challenge flow', async ({ browser }) => {
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    await alicePage.goto('http://localhost/example/client.html?id=alice&name=Alice');
    await bobPage.goto('http://localhost/example/client.html?id=bob&name=Bob');

    await alicePage.waitForSelector('#conn-status.online', { timeout: 10000 });
    await bobPage.waitForSelector('#conn-status.online', { timeout: 10000 });

    // Alice challenges Bob
    await alicePage.click('.btn-challenge >> text=Challenge');
    
    // Bob sees the challenge
    await expect(bobPage.locator('#challenge-container')).toBeVisible({ timeout: 5000 });
    
    // Bob accepts
    await bobPage.click('#btn-accept');

    // Both should now be in game
    await expect(alicePage.locator('#game-container')).toBeVisible();
    await expect(bobPage.locator('#game-container')).toBeVisible();

    // Wait for iframes to load
    await alicePage.waitForSelector('#game-iframe:not([src=""])', { timeout: 5000 });
    await bobPage.waitForSelector('#game-iframe:not([src=""])', { timeout: 5000 });

    // Check Alice's iframe URL - she sent the challenge, so first=true
    const aliceSrc = await alicePage.locator('#game-iframe').getAttribute('src');
    expect(aliceSrc).toContain('first=true');
    expect(aliceSrc).not.toContain('first=false');

    // Check Bob's iframe URL - he accepted, so first should NOT be present
    const bobSrc = await bobPage.locator('#game-iframe').getAttribute('src');
    expect(bobSrc).not.toContain('first=');

    await aliceContext.close();
    await bobContext.close();
  });
});
