import { test, expect } from '@playwright/test';

test.describe('User ID Validation', () => {
  test('should fallback to random ID if forced userId is less than 2 chars', async ({ page }) => {
    // Attempt to force a 1-char userId
    await page.goto('http://localhost:80/lobby.html?userId=a&userName=Alice');
    
    // Wait for the lobby-app to be ready and check the online-panel's #myId
    await page.waitForSelector('lobby-app');
    
    const userId = await page.evaluate(() => {
        const app = document.querySelector('lobby-app') as any;
        return app._ctrl.shadowRoot.querySelector('user-list').getAttribute('myId');
    });

    console.log('Detected userId:', userId);
    expect(userId).not.toBe('a');
    expect(userId.length).toBeGreaterThanOrEqual(2);
    expect(userId).toMatch(/^user-/);
  });

  test('should fallback to random ID if forced userId is empty', async ({ page }) => {
    // Attempt to force an empty userId
    await page.goto('http://localhost:80/lobby.html?userId=&userName=Alice');
    
    await page.waitForSelector('lobby-app');
    
    const userId = await page.evaluate(() => {
        const app = document.querySelector('lobby-app') as any;
        return app._ctrl.shadowRoot.querySelector('user-list').getAttribute('myId');
    });

    console.log('Detected userId:', userId);
    expect(userId).not.toBe('');
    expect(userId.length).toBeGreaterThanOrEqual(2);
    expect(userId).toMatch(/^user-/);
  });

  test('should fallback to random ID if forced userId is only whitespace', async ({ page }) => {
    // Attempt to force a whitespace-only userId
    await page.goto('http://localhost:80/lobby.html?userId=%20%20&userName=Alice');
    
    await page.waitForSelector('lobby-app');
    
    const userId = await page.evaluate(() => {
        const app = document.querySelector('lobby-app') as any;
        return app._ctrl.shadowRoot.querySelector('user-list').getAttribute('myId');
    });

    console.log('Detected userId:', userId);
    expect(userId.trim()).not.toBe('');
    expect(userId.length).toBeGreaterThanOrEqual(2);
    expect(userId).toMatch(/^user-/);
  });

  test('should accept userId with 2 or more characters', async ({ page }) => {
    // Use a valid 2-char userId
    await page.goto('http://localhost:80/lobby.html?userId=ab&userName=Alice');
    
    await page.waitForSelector('lobby-app');
    
    const userId = await page.evaluate(() => {
        const app = document.querySelector('lobby-app') as any;
        return app._ctrl.shadowRoot.querySelector('user-list').getAttribute('myId');
    });

    console.log('Detected userId:', userId);
    expect(userId).toBe('ab');
  });
});
