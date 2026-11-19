import { defineConfig, devices } from '@playwright/test'
// Settings come ONLY from logistics-backend/.env.e2e (the TEST database and
// bucket); env.cjs throws if anything matches production.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { backendEnv, webEnv, WEB_PORT, API_PORT } = require('./e2e/support/env.cjs')

/**
 * Browser tests. Run against the TEST Supabase project, never production.
 *
 *   npm run build:e2e      once after web changes (builds into .next-e2e)
 *   npm run test:e2e:ui    Playwright's window: watch every step
 *   npm run test:e2e       all browsers, headless; report in e2e-report/
 *
 * The test cases these implement are listed in docs/testing/8338 Test Cases.xlsx
 * (each test title starts with its case ID).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // excel-reporter writes every result into docs/testing/8338 Test Cases.xlsx.
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }], ['./e2e/support/excel-reporter.ts']],
  outputDir: 'e2e-results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // SLOWMO=500 waits 500 ms between actions so a person can follow along.
    launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'edge',     use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
    { name: 'iphone',   use: { ...devices['iPhone 13 mini'] } },
  ],
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: '../logistics-backend',
      url: `http://localhost:${API_PORT}/api/auth/csrf`,
      env: backendEnv,
      // Own ports (4100 / 3100), and never reuse a running server: the dev
      // servers on 3000 / 4000 point at PRODUCTION.
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npx next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: webEnv,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
