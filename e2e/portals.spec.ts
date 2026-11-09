import { test, expect, type Page } from '@playwright/test'
import { signIn, signOut, moduleLinks, PORTAL, ERROR_TEXT, type Role, type Watch } from './support/session'

/**
 * Every portal we have a seed account for: each module opens, shows its data
 * and no error; going back to a module shows its rows from the page cache; a
 * Read Only account can't press the action buttons. Read only throughout.
 */

// Modules whose seed data always has rows (2026-11-07 scenario seed).
const EXPECT_ROWS = /booking-management|transaction-history|user-management|vehicle-management|reports|support-tickets|document-management|audit-logs|\/client\/history/

const ROWS = 'tbody tr, [role="row"]:not(:has([role="columnheader"]))'

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  // Skeletons / spinners gone (best effort: not every screen has one).
  await page.locator('[aria-busy="true"], .animate-pulse').first()
    .waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
}

/** Client-side navigation, as a person clicking the sidebar does (keeps the page cache). */
async function clickTo(page: Page, href: string) {
  await page.evaluate((h) => {
    const a = document.querySelector<HTMLAnchorElement>(`a[href="${h}"]`)
    if (!a) throw new Error(`no link to ${h}`)
    a.click()
  }, href)
  await page.waitForURL((u) => u.pathname === href)
}

function drain(w: Watch) {
  const out = { pageErrors: [...w.pageErrors], serverErrors: [...w.serverErrors], denied: [...w.denied] }
  w.pageErrors.length = 0; w.serverErrors.length = 0; w.denied.length = 0
  return out
}

const ROLES: Role[] = ['admin', 'admin_readonly', 'ops', 'fleet', 'client']

for (const role of ROLES) {
  test.describe(role, () => {
    test.describe.configure({ mode: 'serial' })
    let page: Page
    let watch: Watch
    let close: () => Promise<void>
    let links: string[] = []
    const portal = PORTAL[role]

    test.beforeAll(async ({ browser }, info) => {
      // The Read Only account is one account: sign it in from one browser only.
      if (role === 'admin_readonly' && info.project.name !== 'chromium') return
      const s = await signIn(browser, info, role)
      page = s.page; watch = s.watch
      close = async () => { await signOut(page); await s.context.close() }
      await settle(page)
      links = await moduleLinks(page, portal)
    })

    test.afterAll(async () => { if (close) await close() })

    test('every module opens without errors', async ({}, info) => {
      test.skip(!page, 'Read Only account runs in chromium only')
      expect(links.length, 'module links found in the portal').toBeGreaterThan(2)

      for (const href of links) {
        await test.step(href, async () => {
          drain(watch)
          await page.goto(href)
          await settle(page)
          const seen = drain(watch)

          expect.soft(seen.pageErrors, `${href}: script errors`).toEqual([])
          expect.soft(seen.serverErrors, `${href}: server errors`).toEqual([])
          expect.soft(await page.getByText(ERROR_TEXT).count(), `${href}: error message on screen`).toBe(0)
          if (seen.denied.length) info.annotations.push({ type: 'denied', description: `${href}: ${seen.denied.join(', ')}` })

          if (EXPECT_ROWS.test(href)) {
            // Table rows, or booking cards (the client's History) shown by their
            // BK- reference. Waited for: a full page load first restores who
            // is signed in, then asks for data.
            await expect.soft(page.locator(ROWS).or(page.getByText(/BK-\d{6}-\d{5}/)).first(),
              `${href}: rows shown`).toBeVisible({ timeout: 20_000 })
          }
        })
      }
    })

    test('going back to a module shows its rows from the cache', async () => {
      test.skip(!page, 'Read Only account runs in chromium only')
      const tables = links.filter((h) => EXPECT_ROWS.test(h))
      test.skip(tables.length < 2, 'needs two table modules')

      // Hold every data request back for 4 s: rows that show before then can
      // only have come from the page cache. Most calls go straight to the API
      // (localhost:4000 here), some through the web's /api/proxy.
      const isData = (u: URL) => u.port === '4000' || u.pathname.startsWith('/api/proxy/')
      const hold = async (r: import('@playwright/test').Route) => {
        await new Promise((ok) => setTimeout(ok, 4_000))
        await r.continue().catch(() => {})
      }

      // Every table module in turn: open it, go to another, come back.
      await page.goto(tables[0])
      await settle(page)
      for (const [i, a] of tables.entries()) {
        const b = tables[i + 1] ?? tables[i - 1]
        await test.step(a, async () => {
          if (new URL(page.url()).pathname !== a) { await clickTo(page, a); await settle(page) }
          const first = page.locator(ROWS).first()
          await first.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
          if (!(await first.isVisible())) return   // card layouts are covered by the module test
          // Page A's own first row, so B's rows (still on screen for a moment
          // after the click) can't pass for A's.
          // First CELL only: innerText puts tabs between cells, the text match does not.
          const firstRowA = (await first.innerText()).split(/[\t\r\n]+/).map((t) => t.trim()).find(Boolean) ?? ''
          await clickTo(page, b)
          await settle(page)

          await page.route(isData, hold)
          try {
            await clickTo(page, a)
            const cached = page.locator(ROWS).filter({ hasText: firstRowA }).first()
            const ok = await cached.waitFor({ state: 'visible', timeout: 2_500 }).then(() => true, () => false)
            if (!ok) {
              // Say what WAS on screen, so a failure explains itself.
              await test.info().attach(`${a} during the hold`, { body: await page.screenshot(), contentType: 'image/png' })
              const rowsNow = await page.locator(ROWS).allInnerTexts()
              test.info().annotations.push({ type: 'cache-miss', description:
                `${a}: expected a row with "${firstRowA}"; ${rowsNow.length} rows on screen; first: "${(rowsNow[0] ?? '').slice(0, 80)}"` })
            }
            expect.soft(ok, `${a}: rows shown from the cache`).toBe(true)
          } finally {
            await page.unroute(isData, hold)
          }
          await settle(page)
          expect.soft(await page.getByText(ERROR_TEXT).count(), `${a}: error message after the re-read`).toBe(0)
        })
      }
    })

    if (role === 'admin_readonly') {
      test('Read Only: action buttons are disabled', async () => {
        test.skip(!page, 'Read Only account runs in chromium only')
        const ACTION = /^\s*\+?\s*(add|new|create|upload|assign|approve)\b/i
        for (const href of links.filter((h) => /user-management|vehicle-management|booking-management|document-management/.test(h))) {
          await test.step(href, async () => {
            await page.goto(href)
            await settle(page)
            const buttons = page.getByRole('button', { name: ACTION })
            const n = await buttons.count()
            for (let i = 0; i < n; i++) {
              const btn = buttons.nth(i)
              if (!(await btn.isVisible())) continue
              expect.soft(await btn.isDisabled(), `${href}: "${(await btn.innerText()).trim()}" should be disabled`).toBe(true)
            }
          })
        }
      })
    }
  })
}
