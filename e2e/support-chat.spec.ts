import { test, expect, type Page } from '@playwright/test'
import { PORTAL, signInWithPassword, expectSignedInto, watch } from './support/session'
import { apiAs, type Api } from './support/api'

/**
 * Support chat (docs/testing/8338 Test Cases.xlsx, area "Support chat", CHAT-…):
 * the help assistant, our team and tickets in one conversation.
 *
 *   client asks the assistant (saved) → "Talk to our team" (same thread) →
 *   Operations Manager answers from Support → Conversations (becomes owner) →
 *   client answers → a colleague must take over → collision warning →
 *   owner alerted → resolve + reopen.
 * Plus the access rules (another client, the staff inbox) and the state rules.
 *
 * Screens in the browser: CHAT-001…004 and 015. The rest through the TEST API
 * (same calls the screens make). Email, the 15-minute email, auto-close and
 * after-hours need a clock / inbox hook and are not automated here.
 * Runs in order; a failure skips the rest (Blocked in the workbook).
 */
// Longer than the default 90 s: sign-ins may retry on the flaky TEST network.
test.describe.configure({ mode: 'serial', timeout: 240_000 })

const CLIENT = 'client011'
const OTHER_CLIENT = 'client012'
const OPS = 'ops001'
const ADMIN = 'admin001'
const DRIVER = 'driver001'
const QUESTION = 'How do I book a delivery?'

let convId = ''
let reference = ''

async function openHelp(page: Page) {
  await page.getByRole('button', { name: /^Help and messages/ }).click()
  await expect(page.getByRole('dialog', { name: 'Help assistant' })).toBeVisible()
}

// Sign-ins are rate limited (15-minute windows), so each account signs in to
// the API once per run and keeps that session, unless the browser takes the
// account over (one session per account), when it signs in again next time.
const sessions = new Map<string, Api>()
// The TEST setup's link to the sign-in service drops now and then (timeouts /
// resets, which the app reports as "Invalid credentials": an open gap). Sign-ins
// retry up to 3 times so one network blip doesn't block the whole run.
async function session(tag: string): Promise<Api> {
  let s = sessions.get(tag)
  for (let attempt = 1; !s; attempt++) {
    try { s = await apiAs(tag) } catch (e) { if (attempt >= 3) throw e; await new Promise((r) => setTimeout(r, 3_000)) }
  }
  sessions.set(tag, s)
  return s
}
async function browserSignIn(page: Page, tag: string) {
  const s = sessions.get(tag)
  if (s) { await s.dispose(); sessions.delete(tag) }
  for (let attempt = 1; ; attempt++) {
    await signInWithPassword(page, tag)
    try {
      // Left the landing page = signed in.
      await page.waitForURL((u) => !/^\/?$/.test(u.pathname), { timeout: 30_000 })
      return
    } catch (e) {
      if (attempt >= 3) throw e
      await page.goto('/?signedout=1')
    }
  }
}
test.afterAll(async () => { for (const s of sessions.values()) await s.dispose() })

async function conversation(tag = CLIENT) {
  return (await session(tag)).get(`support/conversations/${convId}`)
}

test('CHAT-001 assistant answers a common question and the exchange is saved', async ({ page }) => {
  const problems = watch(page)
  // One session per account: the API signs in first, then the browser takes
  // over the account, and the API signs in again for the checks afterwards.
  const first = await session(CLIENT)
  const before: { conversation_id: string }[] = await first.get('support/conversations')

  await browserSignIn(page, CLIENT)
  await expectSignedInto(page, PORTAL.client)
  await openHelp(page)
  const panel = page.getByRole('dialog', { name: 'Help assistant' })
  // The question and then the answer are saved by two calls.
  let saved = 0
  page.on('response', (r) => { if (/support\/conversations\/[^/]+\/lines/.test(r.url()) && r.ok()) saved++ })
  // Home's "Search for help" list opens a new conversation on that question.
  await panel.getByRole('button', { name: QUESTION, exact: true }).first().click()
  await expect(panel.getByText('8338 Help Assistant', { exact: true })).toBeVisible()
  await expect(panel.getByText('Did this answer it?')).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => saved, { timeout: 15_000 }).toBe(2)

  // Saved on the server: a new conversation with the question and the answer.
  const api = await session(CLIENT)
  await expect.poll(async () => {
    const now: { conversation_id: string; title: string }[] = await api.get('support/conversations')
    const fresh = now.find((c) => !before.some((b) => b.conversation_id === c.conversation_id))
    if (fresh) convId = fresh.conversation_id
    return fresh?.title ?? ''
  }, { timeout: 15_000 }).toBe(QUESTION)
  await expect.poll(async () => {
    const d = await api.get(`support/conversations/${convId}`)
    return d.messages.map((m: { author: string }) => m.author).join(',')
  }, { timeout: 15_000 }).toBe('client,assistant')
  const d = await api.get(`support/conversations/${convId}`)
  expect(d.status).toBe('assistant')
  reference = d.reference
  expect(problems.pageErrors, 'page errors').toEqual([])
})

test('CHAT-002 "Talk to our team" hands the same conversation to the team', async ({ page }) => {
  await browserSignIn(page, CLIENT)
  await expectSignedInto(page, PORTAL.client)
  await openHelp(page)
  const panel = page.getByRole('dialog', { name: 'Help assistant' })
  await panel.getByRole('tab', { name: /Messages$/ }).click()
  await panel.getByRole('button', { name: new RegExp(QUESTION.replace('?', '\\?')) }).first().click()
  // Opened from the list it is history; ask again to get the live buttons.
  await panel.getByRole('textbox', { name: 'Your question' }).fill('I need a person to help me book')
  await panel.getByRole('textbox', { name: 'Your question' }).press('Enter')
  await panel.getByRole('button', { name: 'Talk to our team' }).first().click()

  await expect(panel.getByText('8338 Team', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(panel.getByText(/Passed to our team/)).toBeVisible()
  // The earlier question is still above (same conversation).
  await expect(panel.getByText(QUESTION).first()).toBeVisible()
  const d = await conversation()
  expect(d.status).toBe('waiting')
  expect(d.messages.some((m: { meta?: { event?: string } }) => m.meta?.event === 'handover')).toBeTruthy()
})

test('CHAT-003 Operations Manager sees it in Waiting, replies and becomes the owner', async ({ page }) => {
  await browserSignIn(page, OPS)
  await expectSignedInto(page, PORTAL.ops)
  await page.goto(`${PORTAL.ops}/support-tickets?tab=conversations`)
  await page.getByPlaceholder('Search conversation, client or message').fill(reference)
  const row = page.getByRole('button', { name: new RegExp(reference) }).first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText('Waiting for team')
  await row.click()

  await expect(page.getByText(QUESTION).first()).toBeVisible()
  await expect(page.getByText(/Not handled by anyone yet/)).toBeVisible()
  await page.getByRole('textbox', { name: 'Reply' }).fill('Hi! Go to Booking, or tell me the pickup and drop-offs and I will help.')
  await page.getByRole('button', { name: 'Send reply' }).click()
  await expect(page.getByText(/Handled by you/)).toBeVisible({ timeout: 15_000 })

  const d = await conversation()
  expect(d.status).toBe('replied')
  expect(d.messages.some((m: { author: string }) => m.author === 'staff')).toBeTruthy()
})

test('CHAT-004 client sees the team reply with the staff name and answers it', async ({ page }) => {
  await browserSignIn(page, CLIENT)
  await expectSignedInto(page, PORTAL.client)
  await openHelp(page)
  const panel = page.getByRole('dialog', { name: 'Help assistant' })
  await panel.getByRole('tab', { name: /Messages$/ }).click()
  await expect(panel.getByText('Team replied').first()).toBeVisible()
  await panel.getByRole('button', { name: new RegExp(QUESTION.replace('?', '\\?')) }).first().click()

  await expect(panel.getByText(/Go to Booking, or tell me the pickup/)).toBeVisible({ timeout: 15_000 })
  await expect(panel.getByText(/Operations Manager/).first()).toBeVisible()
  const box = panel.getByRole('textbox', { name: 'Message our team' })
  await box.fill('Pickup Cabuyao, drop-off Makati, tomorrow 9 AM.')
  await box.press('Enter')
  await expect(panel.getByText('Pickup Cabuyao, drop-off Makati, tomorrow 9 AM.')).toBeVisible({ timeout: 15_000 })
  expect((await conversation()).status).toBe('waiting')
})

test('CHAT-005 a colleague cannot reply while the owner is handling it', async () => {
  const admin = await session(ADMIN)
  const res = await admin.tryCall('POST', `support/inbox/${convId}/messages`, { content: 'Admin here' })
  expect(res.status).toBe(409)
  expect(res.body.code).toBe('assigned')
  expect(res.body.message).toMatch(/is handling this conversation/)
})

let seenBeforeAdmin = ''
test('CHAT-006 take over, then reply', async () => {
  const admin = await session(ADMIN)
  seenBeforeAdmin = (await admin.get(`support/inbox/${convId}`)).messages.at(-1).message_id
  await admin.post(`support/inbox/${convId}/take-over`)
  await admin.post(`support/inbox/${convId}/messages`, { content: 'Taking this one: booked for tomorrow 9 AM.' })
  const d = await admin.get(`support/inbox/${convId}`)
  expect(d.assignee_name).toBeTruthy()
  expect(d.status).toBe('replied')
  // The previous owner was told.
  const ops = await session(OPS)
  // The notice is sent just after the take-over (in the background): wait for it.
  await expect.poll(async () => {
    const notes = await ops.get('notifications')
    const list = (Array.isArray(notes) ? notes : notes.notifications ?? notes.items ?? []) as { type: string; data?: { conversation_id?: string } }[]
    return list.some((n) => n.type === 'support.chat_taken_over' && n.data?.conversation_id === convId)
  }, { timeout: 10_000 }).toBeTruthy()
})

test('CHAT-007 a reply after a colleague reply you had not seen asks to confirm', async () => {
  const ops = await session(OPS)
  await ops.post(`support/inbox/${convId}/take-over`)
  const refused = await ops.tryCall('POST', `support/inbox/${convId}/messages`, { content: 'Ops again', last_seen_message_id: seenBeforeAdmin })
  expect(refused.status).toBe(409)
  expect(refused.body.code).toBe('updated')
  await ops.post(`support/inbox/${convId}/messages`, { content: 'Ops again (sent anyway)', last_seen_message_id: seenBeforeAdmin, force: true })
})

test('CHAT-008 a client message alerts the owner', async () => {
  const client = await session(CLIENT)
  await client.post(`support/conversations/${convId}/messages`, { content: 'Thank you! One more question.' })
  expect((await conversation()).status).toBe('waiting')
  const ops = await session(OPS)
  await expect.poll(async () => {
    const notes = await ops.get('notifications')
    const list = (Array.isArray(notes) ? notes : notes.notifications ?? notes.items ?? []) as { type: string; data?: { conversation_id?: string } }[]
    return list.some((n) => n.type === 'support.chat_waiting' && n.data?.conversation_id === convId)
  }, { timeout: 10_000 }).toBeTruthy()
})

test('CHAT-009 resolve, and a client message within 7 days reopens it', async () => {
  const ops = await session(OPS)
  await ops.post(`support/inbox/${convId}/resolve`)
  expect((await conversation()).status).toBe('resolved')
  const client = await session(CLIENT)
  await client.post(`support/conversations/${convId}/messages`, { content: 'Sorry, it is not solved yet.' })
  const d = await client.get(`support/conversations/${convId}`)
  expect(d.status).toBe('waiting')
  expect(d.messages.some((m: { meta?: { event?: string } }) => m.meta?.event === 'reopened')).toBeTruthy()
})

test("CHAT-010 another client cannot read or write someone else's conversation", async () => {
  const other = await session(OTHER_CLIENT)
  expect((await other.tryCall('GET', `support/conversations/${convId}`)).status).toBe(404)
  expect((await other.tryCall('POST', `support/conversations/${convId}/messages`, { content: 'hi' })).status).toBe(404)
  expect((await other.tryCall('POST', `support/conversations/${convId}/handover`)).status).toBe(404)
})

test('CHAT-011 client and driver cannot open the staff inbox', async () => {
  for (const tag of [CLIENT, DRIVER]) {
    const api = await session(tag)
    expect((await api.tryCall('GET', 'support/inbox')).status, tag).toBe(403)
    expect((await api.tryCall('POST', `support/inbox/${convId}/messages`, { content: 'x' })).status, tag).toBe(403)
  }
})

test('CHAT-012 assistant lines are refused after the handover', async () => {
  const client = await session(CLIENT)
  const res = await client.tryCall('POST', `support/conversations/${convId}/lines`, { lines: [{ author: 'assistant', text: 'fake answer' }] })
  expect(res.status).toBe(409)
})

test('CHAT-013 client cannot write to the team before handing over', async () => {
  const client = await session(CLIENT)
  const fresh = await client.post('support/conversations', { title: 'Still with the assistant' })
  const res = await client.tryCall('POST', `support/conversations/${fresh.conversation_id}/messages`, { content: 'Hello team' })
  expect(res.status).toBe(409)
  // …and the staff can't reply to it either.
  const ops = await session(OPS)
  expect((await ops.tryCall('POST', `support/inbox/${fresh.conversation_id}/messages`, { content: 'x' })).status).toBe(409)
})

test('CHAT-014 Messages lists the conversations with their status', async ({ page }) => {
  await browserSignIn(page, CLIENT)
  await expectSignedInto(page, PORTAL.client)
  await openHelp(page)
  const panel = page.getByRole('dialog', { name: 'Help assistant' })
  await panel.getByRole('tab', { name: /Messages$/ }).click()
  const row = panel.getByRole('button', { name: new RegExp(QUESTION.replace('?', '\\?')) }).first()
  await expect(row).toBeVisible()
  await expect(row).toContainText('Waiting for team')
  await expect(panel.getByRole('button', { name: /Still with the assistant/ }).first()).toContainText('Answered by assistant')
})

test('CHAT-015 Mine counts only the open conversations you own', async () => {
  const ops = await session(OPS)
  const res = await ops.ctx.get('support/inbox?status=mine&page=1&limit=50')
  const body = await res.json()
  const rows = body.data as { conversation_id: string; assigned_to: string; status: string }[]
  expect(rows.some((r) => r.conversation_id === convId)).toBeTruthy()
  const me = rows.find((r) => r.conversation_id === convId)!.assigned_to
  expect(rows.every((r) => r.assigned_to === me && (r.status === 'waiting' || r.status === 'replied'))).toBeTruthy()
  expect(body.meta.counts.mine).toBe(body.meta.total)
})

// ── The Tickets table is live (user 2026-11-22: "real time when it detects any
// email or status changes"). The page is opened once and never reloaded.
let ticketId = ''
let ticketSubject = ''

test('CHAT-025 Tickets table updates live when a ticket is opened or resolved', async ({ page }) => {
  await browserSignIn(page, ADMIN)
  await expectSignedInto(page, PORTAL.admin)
  await page.goto(`${PORTAL.admin}/support-tickets?tab=tickets`)
  await page.getByRole('tab', { name: /^All/ }).click()
  await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 })

  // From this run's conversation, or (run on its own) any of the client's.
  const clientId = (convId
    ? (await conversation()).client_id
    : (await (await session(CLIENT)).get('support/conversations'))[0]?.client_id) as string
  expect(clientId, 'client011 needs a conversation (run CHAT-001 once)').toBeTruthy()
  ticketSubject = `Live table check ${Date.now()}`
  const ops = await session(OPS)
  const ticket = await ops.post('support/tickets/staff', {
    client_id: clientId, category: 'other', subject: ticketSubject,
    message: 'Opened by the live-table regression test.',
  })
  ticketId = ticket.ticket_id
  const row = page.getByRole('button', { name: new RegExp(ticketSubject) })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText('Open')

  await ops.patch(`support/tickets/${ticketId}/resolve`, { note: 'Resolved by the live-table test.' })
  await expect(row).toContainText('Resolved', { timeout: 20_000 })
})

test('CHAT-026 an email reply shows on the open ticket without reloading', async ({ page }) => {
  await browserSignIn(page, ADMIN)
  await expectSignedInto(page, PORTAL.admin)
  await page.goto(`${PORTAL.admin}/support-tickets?tab=tickets`)
  await page.getByRole('tab', { name: /^All/ }).click()
  await page.getByRole('button', { name: new RegExp(ticketSubject) }).click()
  await expect(page.getByText(/Email replies \(/)).toHaveCount(0)
  // Let the page's live connection come up first: a change made before it
  // subscribes is only picked up on the next refresh (found in a full run).
  await page.waitForTimeout(4_000)

  // What the inbound email webhook writes (Resend can't email the test setup).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require(require('node:path').join(__dirname, '..', '..', 'logistics-backend', 'node_modules', 'pg'))
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { backendEnv } = require('./support/env.cjs')
  const db = new pg.Client({ connectionString: backendEnv.DATABASE_URL })
  await db.connect()
  try {
    await db.query(
      `insert into support_ticket_replies (ticket_id, direction, from_email, from_name, body_text, email_id)
       values ($1, 'client', 'client@example.com', 'Live Test', 'Thanks, received by email.', $2)`,
      [ticketId, `e2e-${Date.now()}`],
    )
  } finally { await db.end() }

  await expect(page.getByText('Email replies (1)')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Thanks, received by email.')).toBeVisible()
})

// ── Submit a ticket (user 2026-11-22: Zendesk's "Submit a request" next to chat)
async function resolveOpenTicketsOf(clientTag: string) {
  const client = await session(clientTag)
  const mine: { ticket_id: string; status: string }[] = await client.get('support/tickets/mine')
  const ops = await session(OPS)
  for (const t of mine.filter((x) => x.status === 'open')) await ops.patch(`support/tickets/${t.ticket_id}/resolve`, { note: 'Test clean-up.' })
}

test('CHAT-027 client submits a ticket from the Tickets tab', async ({ page }) => {
  await resolveOpenTicketsOf(CLIENT)
  await browserSignIn(page, CLIENT)
  await expectSignedInto(page, PORTAL.client)
  await openHelp(page)
  const panel = page.getByRole('dialog', { name: 'Help assistant' })
  await panel.getByRole('tab', { name: /Tickets$/ }).click()
  await panel.getByRole('button', { name: /Submit a ticket/ }).click()

  await panel.getByRole('button', { name: 'Submit ticket' }).click()
  await expect(panel.getByText('Add a short subject.')).toBeVisible()
  await expect(panel.getByText(/Describe the problem in a sentence or two/)).toBeVisible()

  const subject = `Damaged cartons ${Date.now()}`
  await panel.locator('#ticket-subject').fill(subject)
  await panel.locator('#ticket-details').fill('Two cartons arrived crushed at the Makati drop-off.')
  await panel.getByRole('button', { name: 'Submit ticket' }).click()
  await expect(panel.getByText(/Ticket TCK-\d+ is open\. We emailed you a copy/)).toBeVisible({ timeout: 15_000 })
  await expect(panel.getByText(subject)).toBeVisible()
})

test('CHAT-028 only one "Talk to our team" button in a chat', async ({ page }) => {
  await browserSignIn(page, CLIENT)
  await expectSignedInto(page, PORTAL.client)
  await openHelp(page)
  const panel = page.getByRole('dialog', { name: 'Help assistant' })
  await panel.getByRole('button', { name: /Ask a question/ }).first().click()
  const box = panel.getByRole('textbox', { name: 'Your question' })
  await box.fill('zxq qwv plorf')
  await box.press('Enter')
  // The test setup has no AI key: the keyword fallback offers the team.
  await expect(panel.getByText(/Sorry, I don't have an answer|Is it one of these/)).toBeVisible({ timeout: 15_000 })
  await expect(panel.getByRole('button', { name: 'Talk to our team' })).toHaveCount(1)
})

test('CHAT-029 a sixth open ticket is refused', async () => {
  await resolveOpenTicketsOf(CLIENT)
  const client = await session(CLIENT)
  for (let i = 0; i < 5; i++) {
    await client.post('support/tickets', { category: 'other', subject: `Limit check ${i}`, message: 'Filling up to the open-ticket limit.' })
  }
  const sixth = await client.tryCall('POST', 'support/tickets', { category: 'other', subject: 'One too many', message: 'This one should be refused.' })
  expect(sixth.status).toBe(429)
  expect(sixth.body.message).toMatch(/open tickets/)
  await resolveOpenTicketsOf(CLIENT)
})

test('CHAT-030 turn a conversation into a ticket (simple hand-off)', async () => {
  const ops = await session(OPS)
  const before = await ops.get(`support/inbox/${convId}`)
  // CHAT-007 left ops001 as the owner; take it in case another run moved it.
  if (before.assigned_to && before.assignee_name && before.status !== 'resolved') await ops.post(`support/inbox/${convId}/take-over`)
  const ticket = await ops.post(`support/inbox/${convId}/ticket`, { category: 'booking', subject: 'Booking help from chat' })
  expect(ticket.reference).toMatch(/^TCK-/)
  const after = await ops.get(`support/inbox/${convId}`)
  expect(after.status).toBe('resolved')
  expect(after.ticket_reference).toBe(ticket.reference)
  expect(after.messages.at(-1).content).toMatch(new RegExp(`Continued as ticket ${ticket.reference}`))
  expect((await ops.tryCall('POST', `support/inbox/${convId}/ticket`, { category: 'booking', subject: 'Again' })).status).toBe(409)

  const client = await session(CLIENT)
  const mine: { reference: string; status: string }[] = await client.get('support/tickets/mine')
  expect(mine.find((t) => t.reference === ticket.reference)?.status).toBe('open')
  // A new message reopens the chat; the ticket is left alone.
  await client.post(`support/conversations/${convId}/messages`, { content: 'One more question, not about the ticket.' })
  expect((await client.get(`support/conversations/${convId}`)).status).toBe('waiting')
  const still: { reference: string; status: string }[] = await client.get('support/tickets/mine')
  expect(still.find((t) => t.reference === ticket.reference)?.status).toBe('open')
})

test('CHAT-031 staff reply to a ticket from the Support page', async ({ page }) => {
  const client = await session(CLIENT)
  const clientId = ((await client.get('support/conversations'))[0]?.client_id) as string
  const subject = `Reply on the page ${Date.now()}`
  const ops = await session(OPS)
  await ops.post('support/tickets/staff', { client_id: clientId, category: 'other', subject, message: 'Opened by the ticket-reply test.' })

  await browserSignIn(page, ADMIN)
  await expectSignedInto(page, PORTAL.admin)
  await page.goto(`${PORTAL.admin}/support-tickets?tab=tickets`)
  await page.getByRole('button', { name: new RegExp(subject) }).click()
  await expect(page.getByRole('link', { name: /Open thread in Gmail/ })).toHaveCount(1)
  await expect(page.getByText(/Reply all in Gmail|New email/)).toHaveCount(0)

  const reply = 'Hello! We checked the booking and corrected the drop-off address.'
  await page.getByRole('textbox', { name: 'Reply to the client' }).fill(reply)
  await page.getByRole('button', { name: 'Send reply' }).click()
  await expect(page.getByText('Email replies (1)')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(reply)).toBeVisible()
  await expect(page.getByText(/\(our team\)/)).toBeVisible()
})
