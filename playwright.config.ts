import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './playwright/globalSetup.ts',
  testDir: './playwright',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
