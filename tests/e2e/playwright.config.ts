import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  timeout: 15_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: 'https://leapmotor.tt.kevingarre.de',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['iPhone 14'], browserName: 'chromium' },
    },
    { name: 'Desktop Chrome', use: { browserName: 'chromium' } },
  ],
});
