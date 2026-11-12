import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { signIn } from './support/session'

/**
 * Every row-detail panel follows a change saved elsewhere, without a reload or
 * a Refresh click (user 2026-11-12). Each case opens a panel as the Company
 * Administrator, changes one visible field on a SEED row straight in the
 * database (as another person's save or the driver app would), and waits for
 * every place that text shows (list and panel) to update. The field is put
 * back afterwards. Chromium only: it writes (seed rows), and the live path is
 * the same code in every browser.
 */
const BACKEND = path.resolve(__dirname, '../../logistics-backend')
const HELPER  = path.resolve(__dirname, 'support/live-edit.mts')
const MARK    = ' · live test'
const MARK2   = ' · live test 2'

function edit(action: 'mark' | 'mark2' | 'unmark', target: string, id: string) {
  // Retried: a dropped connection must never leave a seed row marked.
  for (let attempt = 1; ; attempt++) {
    try { execSync(`npx tsx "${HELPER}" ${action} ${target} ${id}`, { cwd: BACKEND, stdio: 'pipe' }); return }
    catch (e) {
      const err = String((e as { stderr?: Buffer }).stderr ?? '')
        .split('\n').filter((l) => !/dotenv|^\s*at /.test(l)).slice(-6).join('\n')
      if (attempt >= 4) throw new Error(`${action} ${target} failed:\n${err}`)
      execSync(process.platform === 'win32' ? 'powershell -c "Start-Sleep 3"' : 'sleep 3')
    }
  }
}

/**
 * The record gets a unique marker (MARK) and its panel is opened, so no other
 * row can share the text. Then the marker is changed (MARK2) in the database,
 * and every place showing it, list and panel, must follow without a reload.
 */
async function expectFollows(page: Page, open: () => Promise<void>, text: string, target: string, id: string) {
  edit('mark', target, id)
  try {
    await open()
    const first  = page.getByText(text + MARK, { exact: false })
    const second = page.getByText(text + MARK2, { exact: false })
    await expect(first.first()).toBeVisible({ timeout: 30_000 })
    edit('mark2', target, id)
    try {
      await expect.poll(async () => {
        // MARK2 contains MARK, so `first` also counts the updated places.
        const [all, updated] = [await first.count(), await second.count()]
        return updated > 0 && all === updated
      }, { timeout: 20_000 }).toBe(true)
    } catch (e) {
      const stale = await first.evaluateAll((els, m2) => els
        .filter((el) => !(el.textContent ?? '').includes(m2))
        .map((el) => {
          const box = el.closest('[class*="panel"], aside, section, table, [role="dialog"]')
          return `<${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().slice(0, 80)}" in ${box ? `<${box.tagName.toLowerCase()} class="${String(box.className).slice(0, 60)}">` : 'page'}`
        }), MARK2)
      throw new Error(`Still showing the old text:\n  ${stale.join('\n  ')}\n${String(e)}`)
    }
    // The old "N new updates — Refresh" bar must not come back anywhere.
    await expect(page.getByText(/new updates? —/i)).toHaveCount(0)
  } finally {
    edit('unmark', target, id)
  }
}

const SEED = {
  pending:    { id: '86dca64b-730b-4abf-9c05-4e8c6341f60a', ref: 'BK-202611-00001', origin: 'Km 14 East Service Road, Paranaque City' },
  assigned:   { id: '8eacf3f7-d228-4772-9dde-d83d55857ded', ref: 'BK-202611-00013', origin: 'Mac Arthur Highway, San Fernando, Pampanga' },
  inTransit:  { id: '137cd337-76fd-414d-b637-ff5621fb6b45', ref: 'BK-202611-00016', origin: 'Alabang-Zapote Road, Muntinlupa City' },
  completed:  { id: '95ad2feb-9b64-44ad-9ebf-5bed8292e25d', ref: 'BK-202611-00039', origin: 'Aguinaldo Highway, Imus, Cavite' },
  report:     { id: 'df3b520a-ae98-49e6-9661-022e5269b29c', text: 'Aircon and fan belt noise' },
  ticket:     { id: 'a0a890ba-7c4b-46e2-8740-26f2d8725091', text: 'Need a copy of the signed DR' },
}

test.describe('side panels are live', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page
  test.beforeAll(async ({ browser }, info) => {
    test.skip(info.project.name !== 'chromium', 'writes seed rows; run once')
    ;({ page } = await signIn(browser, info, 'admin'))
  })

  test('Transaction History: list and panel, no Refresh bar', async () => {
    const b = SEED.completed
    await expectFollows(page, async () => {
      await page.goto(`/admin/transaction-history?booking=${b.id}`)
      await expect(page.getByText(b.ref).first()).toBeVisible({ timeout: 30_000 })
    }, b.origin, 'booking', b.id)
  })

  test('Booking Management: a pending booking', async () => {
    const b = SEED.pending
    await expectFollows(page, async () => {
      await page.goto(`/admin/booking-management?booking=${b.id}`)
      await expect(page.getByText(b.ref).first()).toBeVisible({ timeout: 30_000 })
    }, b.origin, 'booking', b.id)
  })

  test('Booking Management: an assigned booking (no status change)', async () => {
    const b = SEED.assigned
    await expectFollows(page, async () => {
      await page.goto(`/admin/booking-management?booking=${b.id}`)
      await expect(page.getByText(b.ref).first()).toBeVisible({ timeout: 30_000 })
    }, b.origin, 'booking', b.id)
  })

  test('Transit Tracking: the open booking', async () => {
    const b = SEED.inTransit
    await expectFollows(page, async () => {
      await page.goto('/admin/transit-tracking')
      await page.getByText(b.ref).first().click({ timeout: 30_000 })
      // This screen shows the address as street + city lines; the marker ends
      // up on the city line.
    }, 'Muntinlupa City', 'booking', b.id)
  })

  test('Reports: the open report', async () => {
    const r = SEED.report
    await expectFollows(page, async () => {
      await page.goto(`/admin/reports?report=${r.id}`)
    }, r.text, 'report', r.id)
  })

  test('Tickets: the open ticket', async () => {
    const t = SEED.ticket
    await expectFollows(page, async () => {
      await page.goto('/admin/support-tickets')
      // Seed subjects repeat (one ticket per client); search for the marked
      // one so only that ticket is listed.
      await page.getByPlaceholder(/search ticket/i).fill(t.text + MARK)
      await page.getByText(t.text + MARK).first().click({ timeout: 30_000 })
    }, t.text, 'ticket', t.id)
  })
})

test.describe('client dashboard is live', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page
  test.beforeAll(async ({ browser }, info) => {
    test.skip(info.project.name !== 'chromium', 'writes seed rows; run once')
    // client038 is the Chromium project's client (playwright.config.ts).
    ;({ page } = await signIn(browser, info, 'client'))
  })

  test('a booking change shows without a reload', async () => {
    // BK-202611-00017, client038's assigned seed booking.
    const id = '6575e7ee-c2ac-4ddf-a174-305e8fe035fe'
    await expectFollows(page, async () => {
      await page.goto('/client/dashboard')
      await expect(page.getByText('BK-202611-00017').first()).toBeVisible({ timeout: 30_000 })
    }, 'Mac Arthur Highway, San Fernando, Pampanga', 'booking', id)
  })
})
