import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests (e2e/). READ ONLY: they sign in with the seed accounts, open
 * screens and use filters; they never save, assign, approve or archive.
 *
 * They run against THIS machine: the web app on :3000 and the backend on :4000,
 * started below unless already running. The local backend's .env points at the
 * PRODUCTION database, so it is started with DISABLE_SCHEDULERS=1 (no second
 * copy of the reminders), and every Google Maps request is blocked in the
 * browser (e2e/support/session.ts), so a run costs nothing.
 *
 * Each project signs in its own seed accounts (`slot`): the one-session rule
 * would otherwise sign one browser out when another signs in.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 4,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium',       use: { ...devices['Desktop Chrome'] },  metadata: { slot: 1, client: 'client038' } },
    { name: 'firefox',        use: { ...devices['Desktop Firefox'] }, metadata: { slot: 3, client: 'client052' } },
    { name: 'webkit',         use: { ...devices['Desktop Safari'] },  metadata: { slot: 4, client: 'client024' } },
    // Phone width (375 px) on the iPhone profile, WebKit engine.
    { name: 'iphone',         use: { ...devices['iPhone 13 mini'] },  metadata: { slot: 5, client: 'client031' } },
  ],
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: '../logistics-backend',
      url: 'http://localhost:4000/api/auth/csrf',
      env: { DISABLE_SCHEDULERS: '1' },
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      // The BUILT app (run `npm run build` first): what users get, and far
      // lighter than `next dev`, which ran this PC out of memory compiling pages.
      command: 'npx next start -p 3000',
      url: 'http://localhost:3000',
      // Session cookies without `Secure` on http://localhost (WebKit drops them
      // otherwise); see app/api/auth/_proxy.ts. Never set on a deployment.
      env: { E2E_LOCAL_HTTP: '1' },
      reuseExistingServer: true,
      timeout: 300_000,
    },
  ],
})
