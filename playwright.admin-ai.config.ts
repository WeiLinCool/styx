import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3210',
    headless: true,
  },
});
