import { test, expect } from '@playwright/test'
import { PORTAL, signInWithPassword, expectSignedInto, watch } from './support/session'

// X-001 … X-006 in docs/testing/8338 Test Cases.xlsx: every sidebar module of
// each portal opens with no page errors and no API 500s.
const ROLES: [string, string, string, string][] = [
  ['X-001', 'Company Administrator', 'admin003', PORTAL.admin],
  ['X-002', 'General Manager', 'gm001', PORTAL.gm],
  ['X-003', 'Operations Manager', 'ops003', PORTAL.ops],
  ['X-004', 'Fleet Manager', 'fleet003', PORTAL.fleet],
  ['X-005', 'IT Administrator', 'it001', PORTAL.it],
  ['X-006', 'Client', 'client004', PORTAL.client],
]

for (const [id, label, tag, portal] of ROLES) {
  test(`${id} ${label}: every sidebar module opens without errors`, async ({ page }) => {
    const problems = watch(page)
    await signInWithPassword(page, tag)
    await expectSignedInto(page, portal)

    const hrefs = await page.locator(`nav a[href^="${portal}/"]`).evaluateAll(
      (as) => [...new Set(as.map((a) => a.getAttribute('href')!))],
    )
    expect(hrefs.length, 'sidebar has modules').toBeGreaterThan(0)

    for (const href of hrefs) {
      await test.step(href, async () => {
        problems.pageErrors.length = 0
        problems.serverErrors.length = 0
        await page.goto(href)
        await expect(page).toHaveURL(new RegExp(href.replace(/[/?]/g, '\\$&')))
        await page.waitForLoadState('networkidle').catch(() => {})
        await expect(page.getByText(/Loading…/)).toHaveCount(0)
        expect(problems.pageErrors, `page errors on ${href}`).toEqual([])
        expect(problems.serverErrors, `API 500s on ${href}`).toEqual([])
      })
    }
  })
}
