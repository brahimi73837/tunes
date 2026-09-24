import { defineConfig, devices } from '@playwright/test'

// BASE_URL lets the same suite run against the live GitHub Pages site.
const baseURL = process.env.BASE_URL ?? 'http://localhost:4173/tunes/'
const local = !process.env.BASE_URL

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } }],
  webServer: local
    ? { command: 'npm run preview', url: 'http://localhost:4173/tunes/', reuseExistingServer: true, timeout: 60_000 }
    : undefined,
})
