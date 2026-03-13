import { test, expect } from '@playwright/test';

test.describe('Seek Flow', () => {
  test('should notify Alice when Bob joins her seek', async ({ browser }) => {
    // Create two separate browser contexts (simulating two users)
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    // Navigate both to the client (served from Docker on port 80)
    await alicePage.goto('http://localhost/example/client.html?id=alice&name=Alice');
    await bobPage.goto('http://localhost/example/client.html?id=bob&name=Bob');

    // Wait for both to connect
    await alicePage.waitForSelector('#conn-status.online', { timeout: 10000 });
    await bobPage.waitForSelector('#conn-status.online', { timeout: 10000 });

    // Step 1: Alice clicks "Find Game" to seek
    await alicePage.click('#btn-find-game');
    
    // Verify Alice's seek status is shown
    const aliceSeekContainer = alicePage.locator('#seek-container');
    await expect(aliceSeekContainer).toBeVisible();

    // Step 2: Bob should see Alice seeking in the user list
    const bobUserList = bobPage.locator('#user-list');
    await expect(bobUserList).toContainText('(Seeking Game...)', { timeout: 5000 });

    // Step 3: Bob clicks "Join Game" on Alice's seek
    // Find the Join Game button for Alice in Bob's user list
    const joinButton = bobPage.locator('.btn-join').first();
    await joinButton.click();

    // Step 4: Verify Bob joined the game
    await expect(bobPage.locator('#game-container')).toBeVisible();

    // Step 5: Verify Alice's seek status is cleared (this is the bug!)
    // Alice should no longer be seeking after someone joined
    await expect(aliceSeekContainer).toBeHidden({ timeout: 5000 });
    
    // Alice should now be in a game
    await expect(alicePage.locator('#game-container')).toBeVisible();

    // Cleanup
    await aliceContext.close();
    await bobContext.close();
  });
});
