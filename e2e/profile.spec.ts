import path from 'node:path'
import { test, expect, request, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { PORTAL, signInWithPassword, expectSignedInto, startSignIn } from './support/session'
import { API } from './support/api'

// Test case IDs refer to docs/testing/8338 Test Cases.xlsx (Test Cases sheet, PROF-…).
//
// The test backend has no email provider, so a requested reset code never
// reaches a mailbox (the server closes the request when the send fails). The
// code tests therefore plant a request with a KNOWN code in the TEST database
// and type that code in the browser: the request, verify and hand-off to the
// reset page all run for real. They stop on the new-password form, so the seeded
// accounts keep their password. Every planted or created request is closed again.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { backendEnv, seedEmail, BACKEND } = require('./support/env.cjs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcrypt'))

const db = createClient(backendEnv.SUPABASE_URL, backendEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const KNOWN_CODE = '246810'

async function userOf(tag: string): Promise<{ user_id: string; email: string; role: string }> {
  const { data, error } = await db.from('users').select('user_id, email, role').eq('email', seedEmail(tag)).single()
  if (error || !data) throw new Error(`seed user ${tag} not found: ${error?.message}`)
  return data
}

/** Close every open reset request for this person (pending / sent / expired). */
async function closeRequests(userId: string) {
  await db.from('password_reset_requests')
    .update({ status: 'cancelled', token_hash: null, otp_hash: null })
    .eq('user_id', userId)
    .in('status', ['pending', 'sent', 'expired'])
}

/** An open code request whose code is KNOWN_CODE, as if it had been emailed. */
async function plantCode(tag: string) {
  const u = await userOf(tag)
  await closeRequests(u.user_id)
  const now = Date.now()
  const { error } = await db.from('password_reset_requests').insert({
    user_id:         u.user_id,
    email:           u.email,
    requested_role:  u.role,
    handler_group:   'it_admin',
    delivery_method: 'otp',
    status:          'pending',
    otp_hash:        await bcrypt.hash(KNOWN_CODE, 4),
    otp_expires_at:  new Date(now + 10 * 60_000).toISOString(),
    otp_sent_at:     new Date(now).toISOString(),
    otp_attempts:    0,
  })
  if (error) throw new Error(`could not plant code for ${tag}: ${error.message}`)
  return u
}

async function openProfile(page: Page, tag: string, portal: string) {
  await signInWithPassword(page, tag)
  await expectSignedInto(page, portal)
  await page.goto(`${portal}/profile`)
  await expect(page.getByRole('heading', { name: 'Password' })).toBeVisible({ timeout: 30_000 })
}

test.describe('Profile: password', () => {
  test('PROF-001 General Manager resets by emailed code and reaches the new-password page', async ({ page }) => {
    const gm = await userOf('gm001')
    try {
      await openProfile(page, 'gm001', PORTAL.gm)
      await expect(page.getByRole('button', { name: 'Request Password Reset' })).toHaveCount(0)
      await page.getByRole('button', { name: 'Reset Password' }).click()
      await expect(page.getByRole('dialog')).toContainText('Reset your password?')
      await page.getByRole('button', { name: 'Email Me A Code' }).click()
      await expect(page.getByRole('dialog')).toContainText('Enter your code')

      // Stand in for the mailbox: the real send failed (no email key on TEST).
      await plantCode('gm001')
      // Six boxes, as on the sign-in screen. A whole code in the first box (what
      // paste and phone autofill do) spreads over the boxes and sends itself.
      await expect(page.getByRole('textbox', { name: /^Code digit \d of 6$/ })).toHaveCount(6)
      const consoleLines: string[] = []
      page.on('console', (m) => consoleLines.push(m.text()))
      const verified = page.waitForResponse((r) => r.url().includes('/auth/it-admin/verify-otp'))
      await page.getByRole('textbox', { name: 'Code digit 1 of 6' }).fill(KNOWN_CODE)
      const token: string = (await (await verified).json()).data.token
      expect(token).toBeTruthy()

      // No token in the address: it was handed over in memory.
      await expect(page).toHaveURL(/\/reset-password$/, { timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Set A New Password' })).toBeVisible({ timeout: 30_000 })
      // The address is shown masked, never in full.
      await expect(page.getByText(/Resetting the password for 83•+@gmail\.com/)).toBeVisible()
      await expect(page.getByPlaceholder('Create a strong password')).toBeVisible()

      // Nothing sensitive left where DevTools keeps it: not in the address (or
      // history), not in any storage, not in the console.
      expect(new URL(page.url()).search).toBe('')
      const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie)
      expect(stored).not.toContain(token)
      expect(stored).not.toContain(KNOWN_CODE)
      expect(consoleLines.join(' ')).not.toContain(token)
    } finally {
      await closeRequests(gm.user_id)
    }
  })

  test('PROF-002 Company Administrator is offered the emailed code', async ({ page }, info) => {
    const admin = await userOf('admin001')
    try {
      await openProfile(page, 'admin001', PORTAL.admin)
      await page.getByRole('button', { name: 'Reset Password' }).click()
      await page.getByRole('button', { name: 'Email Me A Code' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('Enter your code')
      await expect(dialog.getByRole('group', { name: 'Code' })).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: 'Code digit 1 of 6' })).toBeFocused()
      // The six boxes fit the narrowest phone.
      await page.setViewportSize({ width: 320, height: 700 })
      const last = await dialog.getByRole('textbox', { name: 'Code digit 6 of 6' }).boundingBox()
      expect(last && last.x + last.width <= 320).toBeTruthy()
      await page.screenshot({ path: info.outputPath('code-boxes-320.png') })
      await expect(dialog.getByRole('button', { name: /Resend in \d+s/ })).toBeDisabled()
    } finally {
      await closeRequests(admin.user_id)
    }
  })

  test('PROF-003 wrong code is refused under the field with attempts left', async ({ page }) => {
    const gm = await userOf('gm001')
    try {
      await openProfile(page, 'gm001', PORTAL.gm)
      await page.getByRole('button', { name: 'Reset Password' }).click()
      await page.getByRole('button', { name: 'Email Me A Code' }).click()
      await plantCode('gm001')
      // Typed one digit at a time: the cursor moves box to box, the 6th sends it.
      await page.getByRole('textbox', { name: 'Code digit 1 of 6' }).click()
      await page.keyboard.type('000000', { delay: 40 })
      await expect(page.getByText(/Incorrect code\. 4 attempts left/)).toBeVisible()
      // Boxes emptied and the first one ready for the next try.
      await expect(page.getByRole('textbox', { name: 'Code digit 1 of 6' })).toHaveValue('')
      await expect(page.getByRole('textbox', { name: 'Code digit 1 of 6' })).toBeFocused()
      await expect(page).toHaveURL(/\/general_manager\/profile/)
    } finally {
      await closeRequests(gm.user_id)
    }
  })

  test('PROF-004 Operations Manager requests a reset from the IT Administrator', async ({ page }) => {
    const ops = await userOf('ops001')
    await closeRequests(ops.user_id)
    try {
      await openProfile(page, 'ops001', PORTAL.ops)
      await expect(page.getByRole('button', { name: 'Reset Password', exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: 'Request Password Reset' }).click()
      await page.getByRole('button', { name: 'Send Request' }).click()
      await expect(page.getByText(/Request sent\. The IT Administrator has been notified/)).toBeVisible()

      const { data } = await db.from('password_reset_requests')
        .select('status, delivery_method, handler_group')
        .eq('user_id', ops.user_id).eq('status', 'pending')
      expect(data).toEqual([{ status: 'pending', delivery_method: 'link', handler_group: 'it_admin' }])
    } finally {
      await closeRequests(ops.user_id)
    }
  })

  test('PROF-005 client sees Request Password Reset, not the code', async ({ page }) => {
    await openProfile(page, 'client002', PORTAL.client)
    await expect(page.getByRole('button', { name: 'Request Password Reset' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset Password', exact: true })).toHaveCount(0)
  })

  test('PROF-006 server refuses a reset code for a role that cannot self-reset', async () => {
    const ops = await plantCode('ops001')
    const ctx = await request.newContext({ baseURL: API })
    try {
      const res = await ctx.post('auth/it-admin/verify-otp', { data: { email: ops.email, code: KNOWN_CODE } })
      const body = await res.json()
      expect(res.ok()).toBeFalsy()
      expect(body.message).toMatch(/invalid or has expired/i)
      expect(body.data?.token).toBeUndefined()
    } finally {
      await ctx.dispose()
      await closeRequests(ops.user_id)
    }
  })
})

test('PROF-011 reset link token leaves the address bar and is never sent to other sites', async ({ page }) => {
  const res = await page.goto('/reset-password?token=not-a-real-token')
  expect(res?.headers()['referrer-policy']).toBe('no-referrer')
  expect(res?.headers()['cache-control']).toContain('no-store')
  await expect(page).toHaveURL(/\/reset-password$/)
})

test.describe('Profile: user guide', () => {
  test('PROF-007 Open User Guide opens the PDF in a new tab', async ({ page }) => {
    await openProfile(page, 'client002', PORTAL.client)
    const link = page.getByRole('link', { name: /Open User Guide/ })
    await expect(link).toHaveAttribute('href', '/user-guide')
    await expect(link).toHaveAttribute('target', '_blank')
    // Same browser session (cookies) as the tab the link opens.
    const res = await page.request.get('/user-guide', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('application/pdf')
    expect(res.headers()['content-disposition']).toMatch(/^inline/)
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-')
  })

  test('PROF-008 signed-out visitor cannot open the user guide', async ({ page }) => {
    const res = await page.request.get('/user-guide', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(new URL(res.headers()['location']).pathname).toBe('/')
  })
})

test.describe('Profile: sign-in and layout', () => {
  test('PROF-010 Forgot password offers the emailed code to all three senior roles', async ({ page }) => {
    await startSignIn(page, 'client002')
    await page.getByRole('button', { name: /^Password/ }).click()
    await page.getByRole('button', { name: /Forgot password/i }).click()
    await expect(page.getByRole('button', {
      name: 'IT Administrator, Company Administrator or General Manager? Reset with an emailed code',
    })).toBeVisible()
  })

  test('PROF-009 Profile fits 320, 375, tablet and desktop widths', async ({ page }, info) => {
    await openProfile(page, 'gm001', PORTAL.gm)
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      await page.waitForTimeout(300)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `sideways scroll at ${width}px`).toBeLessThanOrEqual(0)
      for (const name of ['Reset Password']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox()
        expect(box && box.x >= 0 && box.x + box.width <= width, `${name} inside ${width}px`).toBeTruthy()
      }
      const guide = await page.getByRole('link', { name: /Open User Guide/ })
      await guide.scrollIntoViewIfNeeded()
      const gbox = await guide.boundingBox()
      expect(gbox && gbox.x >= 0 && gbox.x + gbox.width <= width, `guide link inside ${width}px`).toBeTruthy()
      await page.screenshot({ path: info.outputPath(`profile-${width}.png`), fullPage: true })
    }
  })
})

test.describe('Calendar: month and year choosers', () => {
  test('CLI-054 booking date: clicking the year opens a year grid; year → month → day', async ({ page }, info) => {
    await signInWithPassword(page, 'client002')
    await expectSignedInto(page, PORTAL.client)
    await page.goto('/client/booking')
    await page.getByRole('button', { name: 'Select date' }).click()
    await page.getByRole('button', { name: 'Choose year' }).click()

    // 12 years; only those inside the booking window (today to one month ahead) can be picked.
    const years = page.getByRole('button', { name: /^\d{4}$/ })
    await expect(years).toHaveCount(12)
    await page.screenshot({ path: info.outputPath('booking-year-grid.png') })
    const thisYear = String(new Date().getFullYear())
    await expect(page.getByRole('button', { name: String(Number(thisYear) - 1) })).toBeDisabled()
    await page.getByRole('button', { name: thisYear }).click()

    // Months of that year: pick the first allowed one, then its first allowed day.
    const months = page.getByRole('button', { name: new RegExp(`^[A-Z][a-z]+ ${thisYear}$`) })
    await expect(months).toHaveCount(12)
    await months.and(page.locator(':enabled')).first().click()
    await page.getByRole('button', { name: /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/ }).and(page.locator(':enabled')).first().click()
    await expect(page.getByRole('button', { name: /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select date' })).toHaveCount(0)
  })

  test('X-019 every other date field: the year chooser jumps years ahead', async ({ page }) => {
    await signInWithPassword(page, 'admin001')
    await expectSignedInto(page, PORTAL.admin)
    await page.goto('/admin/vehicle-management')
    await page.getByRole('button', { name: 'Add Vehicle' }).click()
    const field = page.getByRole('button', { name: 'Registration valid until' })
    await field.click()
    const cal = page.getByRole('dialog', { name: 'Registration valid until' })
    await cal.getByRole('button', { name: 'Choose year' }).click()
    await cal.getByRole('button', { name: 'Next 12 years' }).click()
    await cal.getByRole('button', { name: '2040' }).click()
    await cal.getByRole('button', { name: 'March 2040' }).click()
    await cal.getByRole('button', { name: 'Mar 5, 2040' }).click()
    await expect(field).toContainText('Mar 5, 2040')
  })
})
