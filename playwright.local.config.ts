import { defineConfig } from '@playwright/test';

export const PLAYWRIGHT_LOCAL_BASE_URL = 'http://127.0.0.1:4000';

export default defineConfig({
  testDir: './tests/e2e',
  reporter: [['list']],
  use: {
    baseURL: PLAYWRIGHT_LOCAL_BASE_URL,
    headless: true,
  },
});

