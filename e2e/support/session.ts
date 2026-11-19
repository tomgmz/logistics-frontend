import { expect, type Page } from '@playwright/test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedPassword, seedEmail } = require('./env.cjs')

export const PORTAL = {
  admin: '/admin', gm: '/general_manager', ops: '/operations_admin',
  fleet: '/fleet_admin', it: '/it_admin', client: '/client',
} as const

/** Problems seen on a page while a test runs. */
export function watch(page: Page) {
  const problems = { pageErrors: [] as string[], serverErrors: [] as string[] }
  page.on('pageerror', (e) => problems.pageErrors.push(e.message))
  page.on('response', (r) => {
    if (r.status() >= 500 && r.url().includes('/api/')) problems.serverErrors.push(`${r.status()} ${r.url()}`)
  })
  return problems
}

/** Opens the sign-in modal and submits the email step. */
export async function startSignIn(page: Page, tag: string) {
  // Google Maps is billed per load; tests never need it.
  await page.route(/maps\.googleapis\.com|maps\.gstatic\.com/, (r) => r.abort())
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign In' }).first().click()
  await page.getByPlaceholder('email@example.com').fill(seedEmail(tag))
  await page.getByRole('button', { name: 'Continue' }).click()
}

/** Opens the sign-in modal and goes through email → Password → password. */
export async function signInWithPassword(page: Page, tag: string, password = seedPassword()) {
  await startSignIn(page, tag)
  await page.getByRole('button', { name: /^Password/ }).click()
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).last().click()
}

export async function expectSignedInto(page: Page, portal: string) {
  await expect(page).toHaveURL(new RegExp(`${portal}(/|$|\\?)`), { timeout: 30_000 })
}

export async function expectRefused(page: Page, message: RegExp) {
  await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible()
  await expect(page).toHaveURL(/localhost:\d+\/?(\?.*)?$/)
}
