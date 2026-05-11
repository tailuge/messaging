import { test, expect } from '@playwright/test';

const lobbyUrl = (id: string, name: string) =>
    `http://localhost/lobby.html?userId=${id}&userName=${name}`;

// Count real (non-bot) users visible in the online list on a given page
const realUserCount = (page: any) =>
    page.evaluate(() => {
        const panel = document.querySelector('lobby-app')?.shadowRoot?.querySelector('online-panel') as any;
        return panel?._state?.users?.length ?? 0;
    });

test.describe('Presence Lifecycle', () => {
    test('second user appears in list when both are connected', async ({ browser }) => {
        const ctx1 = await browser.newContext();
        const ctx2 = await browser.newContext();
        const page1 = await ctx1.newPage();
        const page2 = await ctx2.newPage();

        await page1.goto(lobbyUrl('plc-user1', 'User1'));
        await page2.goto(lobbyUrl('plc-user2', 'User2'));

        // Each should see the other in the list
        await expect(page1.locator('[aria-label="User2"]')).toBeVisible({ timeout: 10000 });
        await expect(page2.locator('[aria-label="User1"]')).toBeVisible({ timeout: 10000 });

        await ctx1.close();
        await ctx2.close();
    });

    test('user disappears from list after navigating away', async ({ browser }) => {
        const ctx1 = await browser.newContext();
        const ctx2 = await browser.newContext();
        const page1 = await ctx1.newPage();
        const page2 = await ctx2.newPage();

        await page1.goto(lobbyUrl('plc-user3', 'User3'));
        await page2.goto(lobbyUrl('plc-user4', 'User4'));

        await expect(page1.locator('[aria-label="User4"]')).toBeVisible({ timeout: 10000 });
        await expect(page2.locator('[aria-label="User3"]')).toBeVisible({ timeout: 10000 });

        // User3 navigates away — sends a leave message
        await page1.goto('about:blank');

        // User4 should no longer see User3
        await expect(page2.locator('[aria-label="User3"]')).not.toBeVisible({ timeout: 10000 });

        await ctx1.close();
        await ctx2.close();
    });

    test('user reappears after navigating back', async ({ browser }) => {
        const ctx1 = await browser.newContext();
        const ctx2 = await browser.newContext();
        const page1 = await ctx1.newPage();
        const page2 = await ctx2.newPage();

        await page1.goto(lobbyUrl('plc-user5', 'User5'));
        await page2.goto(lobbyUrl('plc-user6', 'User6'));

        await expect(page2.locator('[aria-label="User5"]')).toBeVisible({ timeout: 10000 });

        // User5 navigates away then back
        await page1.goto('about:blank');
        await expect(page2.locator('[aria-label="User5"]')).not.toBeVisible({ timeout: 10000 });

        await page1.goBack();

        // User6 should see User5 again
        await expect(page2.locator('[aria-label="User5"]')).toBeVisible({ timeout: 15000 });

        await ctx1.close();
        await ctx2.close();
    });
});
