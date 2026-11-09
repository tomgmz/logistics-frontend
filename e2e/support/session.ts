import fs from 'node:fs'
import path from 'node:path'
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test'

/**
 * Seed accounts (logistics-backend/scripts/seed-scenarios.mjs, in production
 * since 2026-11-07). Never a real person's account: there is no active seed
 * General Manager or IT Administrator, so those portals are not covered.
 */
export type Role = 'admin' | 'admin_readonly' | 'ops' | 'fleet' | 'client'

export const PORTAL: Record<Role, string> = {
  admin:          '/admin',
  admin_readonly: '/admin',
  ops:            '/operations_admin',
  fleet:          '/fleet_admin',
  client:         '/client',
}

function password(): string {
  if (process.env.E2E_PASSWORD) return process.env.E2E_PASSWORD
  const manifest = path.resolve(__dirname, '../../../logistics-backend/scripts/seed-scenarios.manifest.json')
  return JSON.parse(fs.readFileSync(manifest, 'utf8')).password
}

const pad = (n: number) => String(n).padStart(3, '0')

/**
 * Which seed account a role uses in this project. Slot 2 of each staff role is
 * the Read Only one, 20 must change its password, so projects use 1, 3, 4, 5.
 */
export function emailFor(role: Role, info: TestInfo): string {
  const meta = info.project.metadata as { slot: number; client: string }
  const tag =
    role === 'admin_readonly' ? 'admin002'
    : role === 'client'       ? meta.client
    : `${role}${pad(meta.slot)}`
  return `8338logisticsservice+seed.${tag}@gmail.com`
}

/** Problems seen on a page; read and reset by the tests. */
export interface Watch {
  pageErrors:   string[]
  serverErrors: string[]   // API answers 500+
  denied:       string[]   // API answers 401/403 (reported, not failed: some screens probe)
}

/**
 * A signed-in browser window for `role`. Google Maps is blocked (billed per
 * load); everything else runs as in real use.
 */
export async function signIn(browser: Browser, info: TestInfo, role: Role) {
  const context: BrowserContext = await browser.newContext({ ...info.project.use })
  // Maps only: Google Fonts (fonts.googleapis.com) is free and must still load.
  await context.route(/maps\.googleapis\.com|maps\.gstatic\.com|maps\.google\./, (r) => r.abort())

  const page: Page = await context.newPage()
  const watch: Watch = { pageErrors: [], serverErrors: [], denied: [] }
  page.on('pageerror', (e) => watch.pageErrors.push(e.message))
  page.on('response', (res) => {
    const url = res.url()
    if (!/\/api\//.test(url)) return
    const short = url.replace(/^https?:\/\/[^/]+/, '')
    if (res.status() >= 500) watch.serverErrors.push(`${res.status()} ${short}`)
    else if (res.status() === 401 || res.status() === 403) watch.denied.push(`${res.status()} ${short}`)
  })

  // Through the real form, as a person signs in (the app keeps the signed-in
  // user in its own store, which only this flow fills). Always the PASSWORD
  // method: the emailed-code button sends an email.
  await page.goto('/')
  await page.getByRole('button', { name: /^sign in$/i }).filter({ visible: true }).first().click()
  await page.getByPlaceholder('email@example.com').fill(emailFor(role, info))
  await page.getByRole('button', { name: /^continue$/i }).click()
  await page.getByRole('button', { name: /password/i }).filter({ hasText: /sign in with your account password/i }).click()
  await page.locator('input[type="password"]').fill(password())
  await page.locator('form').getByRole('button', { name: /^sign in$/i }).click()

  await page.waitForURL((u) => u.pathname.startsWith(PORTAL[role]), { timeout: 90_000 })
  return { context, page, watch }
}

export async function signOut(page: Page) {
  await page.request.post('/api/auth/logout', { headers: { Origin: 'http://localhost:3000' } }).catch(() => {})
}

/** Text that means a screen failed to load its data. */
export const ERROR_TEXT = /could not load|failed to load|failed to fetch|request failed|something went wrong/i

/** Every module link the signed-in portal offers (sidebar and shortcuts). */
export async function moduleLinks(page: Page, portal: string): Promise<string[]> {
  const hrefs = await page.locator(`a[href^="${portal}/"]`).evaluateAll((as) =>
    as.map((a) => new URL((a as HTMLAnchorElement).href).pathname))
  return [...new Set(hrefs)]
    // A map page loads Google Maps; it is blocked, so its map area would be empty.
    .filter((p) => !/transit-tracking/.test(p))
    .sort()
}
