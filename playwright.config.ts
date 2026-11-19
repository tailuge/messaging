import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './playwright/globalSetup.ts',
  testDir: './playwright',
  timeout: 20000,
  // Always record traces so every run can be inspected in the HTML report.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost',
    trace: 'on',
    screenshot: 'only-on-failure',
    actionTimeout: 2500,
    navigationTimeout: 7500,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
