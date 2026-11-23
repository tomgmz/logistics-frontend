import crypto from 'node:crypto'
import { test, expect, request, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { PORTAL, signInWithPassword, expectSignedInto, startSignIn } from './support/session'
import { API } from './support/api'

// Test case IDs refer to docs/testing/8338 Test Cases.xlsx (Test Cases sheet, PROF-…).
//
// The test backend has no email provider, so a reset link never reaches a
// mailbox (a self-service link whose email fails is closed again). The tests
// therefore check the request side through the TEST database, and open the reset
// page with a link they plant themselves (known token, hashed the way the server
// hashes it). They stop on the new-password form, so the seeded accounts keep
// their password. Every planted or created request is closed again.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { backendEnv, seedEmail } = require('./support/env.cjs')

const db = createClient(backendEnv.SUPABASE_URL, backendEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const hashToken = (t: string) =>
  crypto.createHash('sha256').update(t + backendEnv.TOKEN_PEPPER).digest('hex')

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

/** A live self-service link, as if emailed `sentSecondsAgo` seconds ago. */
async function plantLink(tag: string, sentSecondsAgo = 0) {
  const u = await userOf(tag)
  await closeRequests(u.user_id)
  const token  = crypto.randomBytes(32).toString('base64url')
  const sentAt = Date.now() - sentSecondsAgo * 1000
  const { data, error } = await db.from('password_reset_requests').insert({
    user_id:          u.user_id,
    email:            u.email,
    requested_role:   u.role,
    handler_group:    'it_admin',
    delivery_method:  'link',
    status:           'sent',
    token_hash:       hashToken(token),
    token_expires_at: new Date(sentAt + 5 * 60_000).toISOString(),
    sent_by:          u.user_id,
    sent_at:          new Date(sentAt).toISOString(),
  }).select('request_id').single()
  if (error || !data) throw new Error(`could not plant link for ${tag}: ${error?.message}`)
  return { token, requestId: data.request_id as string, userId: u.user_id, email: u.email }
}

async function statusOf(requestId: string) {
  const { data } = await db.from('password_reset_requests').select('status').eq('request_id', requestId).single()
  return data?.status
}

async function openProfile(page: Page, tag: string, portal: string) {
  await signInWithPassword(page, tag)
  await expectSignedInto(page, portal)
  await page.goto(`${portal}/profile`)
  await expect(page.getByRole('heading', { name: 'Password' })).toBeVisible({ timeout: 30_000 })
}

test.describe('Profile: password', () => {
  test('PROF-001 General Manager emails themselves a reset link straight away', async ({ page }) => {
    const gm = await userOf('gm001')
    await closeRequests(gm.user_id)
    const since = new Date(Date.now() - 5_000).toISOString()
    try {
      await openProfile(page, 'gm001', PORTAL.gm)
      await expect(page.getByRole('button', { name: 'Request Password Reset' })).toHaveCount(0)
      await page.getByRole('button', { name: 'Email Me A Reset Link' }).click()
      await expect(page.getByRole('dialog')).toContainText('Email you a reset link?')
      await page.getByRole('button', { name: 'Send Link' }).click()
      await expect(page.getByText(/^Link sent\. Check your email/)).toBeVisible()

      // The server minted the link and marked it sent by the person themselves:
      // no approval. (TEST has no mail, so the row is then closed as undeliverable.)
      const { data } = await db.from('password_reset_requests')
        .select('delivery_method, sent_by, sent_at').eq('user_id', gm.user_id).gte('created_at', since)
      expect(data?.length).toBe(1)
      expect(data![0]).toMatchObject({ delivery_method: 'link', sent_by: gm.user_id })
      expect(data![0].sent_at).toBeTruthy()
    } finally {
      await closeRequests(gm.user_id)
    }
  })

  test('PROF-002 Company Administrator is offered the reset link, not a request', async ({ page }) => {
    await openProfile(page, 'admin001', PORTAL.admin)
    await expect(page.getByText(/We email a one-time link to .+ straight away/)).toBeVisible()
    await page.getByRole('button', { name: 'Email Me A Reset Link' }).click()
    await expect(page.getByRole('dialog')).toContainText('It works once and expires in 5 minutes')
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  test('PROF-003 a new link cancels the old one; asking again within a minute sends nothing', async () => {
    const ctx = await request.newContext({ baseURL: API })
    const gm = await userOf('gm001')
    try {
      // Within the minute: the live link is kept and nothing new is made.
      const fresh = await plantLink('gm001', 10)
      await ctx.post('auth/forgot-password', { data: { email: gm.email } })
      expect(await statusOf(fresh.requestId)).toBe('sent')

      // After the minute: the old link is cancelled and no longer opens.
      const old = await plantLink('gm001', 90)
      await ctx.post('auth/forgot-password', { data: { email: gm.email } })
      expect(await statusOf(old.requestId)).toBe('cancelled')
      const check = await ctx.post('auth/reset-password/verify', { data: { token: old.token } })
      expect((await check.json()).data.valid).toBe(false)
    } finally {
      await ctx.dispose()
      await closeRequests(gm.user_id)
    }
  })

  test('PROF-004 Operations Manager requests a reset from the IT Administrator', async ({ page }) => {
    const ops = await userOf('ops001')
    await closeRequests(ops.user_id)
    try {
      await openProfile(page, 'ops001', PORTAL.ops)
      await expect(page.getByRole('button', { name: 'Email Me A Reset Link' })).toHaveCount(0)
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

  test('PROF-005 client sees Request Password Reset, not the instant link', async ({ page }) => {
    await openProfile(page, 'client002', PORTAL.client)
    await expect(page.getByRole('button', { name: 'Request Password Reset' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email Me A Reset Link' })).toHaveCount(0)
  })

  test('PROF-006 server never sends an instant link to a role that needs approval', async () => {
    const ops = await userOf('ops001')
    await closeRequests(ops.user_id)
    const ctx = await request.newContext({ baseURL: API })
    try {
      const res = await ctx.post('auth/forgot-password', { data: { email: ops.email } })
      // The same reply a senior role gets, so it reveals nothing about the account.
      expect((await res.json()).message).toMatch(/straight away for IT Administrator, Company Administrator and General Manager accounts/)
      const { data } = await db.from('password_reset_requests')
        .select('status, token_hash, sent_by').eq('user_id', ops.user_id).in('status', ['pending', 'sent'])
      expect(data).toEqual([{ status: 'pending', token_hash: null, sent_by: null }])
    } finally {
      await ctx.dispose()
      await closeRequests(ops.user_id)
    }
  })
})

test('PROF-011 reset link: a refresh keeps working, nothing goes to other sites', async ({ page }) => {
  const link = await plantLink('gm001')
  try {
    const consoleLines: string[] = []
    page.on('console', (m) => consoleLines.push(m.text()))
    const res = await page.goto(`/reset-password?token=${link.token}`)
    expect(res?.headers()['referrer-policy']).toBe('no-referrer')
    expect(res?.headers()['cache-control']).toContain('no-store')
    await expect(page.getByRole('heading', { name: 'Set A New Password' })).toBeVisible({ timeout: 30_000 })
    // The address is shown masked, never in full.
    await expect(page.getByText(/Resetting the password for 83•+@gmail\.com/)).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Set A New Password' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByPlaceholder('Create a strong password')).toBeVisible()

    // Not copied into storage or the console.
    const stored = await page.evaluate(() =>
      JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie)
    expect(stored).not.toContain(link.token)
    expect(consoleLines.join(' ')).not.toContain(link.token)
  } finally {
    await closeRequests(link.userId)
  }
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
  test('PROF-010 Forgot password: one Request Reset Link for everyone, no code option', async ({ page }) => {
    await startSignIn(page, 'client002')
    await page.getByRole('button', { name: /^Password/ }).click()
    await page.getByRole('button', { name: /Forgot password/i }).click()
    await expect(page.getByText(/Administrator, Company Administrator and General Manager accounts get it straight away/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Request Reset Link' })).toBeVisible()
    await expect(page.getByRole('button', { name: /emailed code/i })).toHaveCount(0)
  })

  test('PROF-009 Profile fits 320, 375, tablet and desktop widths', async ({ page }, info) => {
    await openProfile(page, 'gm001', PORTAL.gm)
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      await page.waitForTimeout(300)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `sideways scroll at ${width}px`).toBeLessThanOrEqual(0)
      const box = await page.getByRole('button', { name: 'Email Me A Reset Link' }).boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= width, `reset button inside ${width}px`).toBeTruthy()
      const guide = page.getByRole('link', { name: /Open User Guide/ })
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
