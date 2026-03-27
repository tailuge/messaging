import { test, expect } from '@playwright/test';

test.describe('Presence Lifecycle', () => {
  test('should restore presence after BFCache navigation', async ({ page, context }) => {
    // 1. Open two pages to see each other
    const page1 = page;
    const page2 = await context.newPage();

    await page1.goto('http://localhost/example/client.html?id=user1&name=User1');
    await page2.goto('http://localhost/example/client.html?id=user2&name=User2');

    // Wait for both to be online
    await expect(page1.locator('#count')).toAtLeastCount(2);
    await expect(page2.locator('#count')).toAtLeastCount(2);

    // 2. Navigate away on page1
    await page1.goto('about:blank');

    // Page2 should eventually see only 1 user (itself)
    await expect(page2.locator('#count')).toHaveText('Online Users: 1', { timeout: 10000 });

    // 3. Navigate back on page1
    await page1.goBack();

    // Both should see 2 users again
    await expect(page1.locator('#count')).toHaveText('Online Users: 2', { timeout: 10000 });
    await expect(page2.locator('#count')).toHaveText('Online Users: 2', { timeout: 10000 });
  });

  test('should restore presence after visibility change', async ({ page, context }) => {
    const page1 = page;
    const page2 = await context.newPage();

    await page1.goto('http://localhost/example/client.html?id=user3&name=User3');
    await page2.goto('http://localhost/example/client.html?id=user4&name=User4');

    // Wait for both to be online
    await expect(page1.locator('#count')).toAtLeastCount(2);
    await expect(page2.locator('#count')).toAtLeastCount(2);

    // 1. Simulate hiding page1
    // Note: Playwright doesn't have a direct "hide tab" that triggers visibilitychange reliably across all OS/browsers
    // but we can trigger the event manually or use page.dispatchEvent
    await page1.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
        Object.defineProperty(document, 'hidden', { value: true, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });

    // Heartbeat should be paused, but user stays in list until prune (90s)
    // To test our fix, we can stop the client and then trigger visibilitychange
    await page1.evaluate(async () => {
        // @ts-ignore
        await window.messagingClient.stop();
    });

    // Page2 should eventually see only 1 user
    await expect(page2.locator('#count')).toHaveText('Online Users: 1', { timeout: 10000 });

    // 2. Simulate showing page1
    await page1.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
        Object.defineProperty(document, 'hidden', { value: false, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });

    // Both should see 2 users again
    await expect(page1.locator('#count')).toHaveText('Online Users: 2', { timeout: 10000 });
    await expect(page2.locator('#count')).toHaveText('Online Users: 2', { timeout: 10000 });
  });
});

// Helper for toAtLeastCount
expect.extend({
    async toAtLeastCount(locator, expected) {
        const text = await locator.innerText();
        const match = text.match(/Online Users: (\d+)/);
        const count = match ? parseInt(match[1], 10) : 0;
        const pass = count >= expected;
        if (pass) {
            return {
                message: () => `passed`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected at least ${expected} users, but got ${count}`,
                pass: false,
            };
        }
    },
});
