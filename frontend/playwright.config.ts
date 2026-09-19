import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER === 'true' ? undefined : {
    command: 'npm start',
    url: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000
  }
});
