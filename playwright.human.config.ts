import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './qa/human-production',
  testMatch: '**/*.pw.ts',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-human-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.PRODUCTION_URL ?? 'https://ember-street.1106314996.workers.dev',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
});
