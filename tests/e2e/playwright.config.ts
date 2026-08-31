import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  timeout: 15_000,
  expect: {
    timeout: 15_000,
  },
  webServer: process.env.PLAYWRIGHT_LOCAL === '1' ? {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory ../..',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  } : undefined,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://leapmotor.tt.kevingarre.de',
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
