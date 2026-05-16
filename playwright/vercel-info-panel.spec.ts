import { test, expect } from '@playwright/test';

test('info panel should be visible and show "Play online here" when hostname contains vercel', async ({ page }) => {
  // Intercept lobby.js to force isVercel to true for testing rendering logic
  await page.route('**/lobby.js', async route => {
    const response = await route.fetch();
    let text = await response.text();
    // Replace the isVercel detection with a hardcoded true
    text = text.replace(/window\.location\.hostname\.includes\("vercel"\)/g, 'true');
    await route.fulfill({ response, body: text });
  });

  // Go to the lobby page
  // Note: This requires a server running or using file:// if supported.
  // In our CI/test environment, we assume a server is available at localhost:80 or passed via baseURL.
  await page.goto('/lobby.html');

  const infoPanel = page.locator('info-panel');

  // It should have the 'loaded' class and be visible
  await expect(infoPanel).toHaveClass(/loaded/);
  await expect(infoPanel).toBeVisible();

  // It should contain the specific Vercel message link
  const link = infoPanel.locator('a:has-text("Play online here")');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://billiards.tailuge.workers.dev/lobby');
});
