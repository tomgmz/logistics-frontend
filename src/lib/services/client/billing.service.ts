import proxyApi, { initCsrf } from '@/lib/api/auth.api'

/**
 * Reverse billing, client side.
 *
 * Every route here is scoped to the signed-in client by the server, which
 * resolves their client_id from the session — no call takes a client id, and
 * passing one would not widen what comes back.
 */

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
  meta?: { total: number }
}

const B = '/billing/me'

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url, { params })
  return data.data
}

async function post<T>(url: string, payload?: unknown): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.post<ApiResponse<T>>(url, payload ?? {})
  return data.data
}

// ---------------------------------------------------------------------------

export type BillingMode = 'weekly' | 'monthly'

export type BillingStatus =
  | 'draft'
  | 'consolidating'
  | 'awaiting_submission'
  | 'awaiting_client_approval'
  | 'under_review'
  | 'rejected'
  | 'approved'
  | 'invoiced'
  | 'paid'
  | 'closed'
  | 'cancelled'
  | 'rolled_over'

/** A completed delivery covered by a billing period. */
export interface PeriodDelivery {
  booking_id: string
  reference_number: string | null
  schedule_date: string
  origin: string | null
  destinations: string[]
  truck_type_needed: string | null
  payment_terms: string | null
  /**
   * Null when 8338 has not disclosed its figures yet. For a monthly cut-off
   * that is the norm until the client has submitted — the cross-check only
   * means anything if both sides reach their totals independently.
   */
  billed_amount: number | null
}

export interface BillingSubmission {
  submission_id: string
  revision: number
  origin: 'client' | 'company'
  submitted_amount: number | null
  client_billing_number: string | null
  client_billing_date: string | null
  remarks: string | null
  document_urls: string[]
  submitted_at: string
  review_status: 'pending' | 'accepted' | 'rejected'
  review_remarks: string | null
  reviewed_at: string | null
}

export type PaymentVerificationStatus = 'pending_verification' | 'confirmed' | 'rejected'

/**
 * A payment recorded against an invoice.
 *
 * A client's own upload arrives as `pending_verification` and counts for
 * nothing until 8338 confirms the money reached them — `payment_date` is the
 * Friday they accepted it, and stays null until then.
 */
export interface BillingPayment {
  payment_id: string
  invoice_id: string
  amount_paid: number
  status: PaymentVerificationStatus
  /** The Friday 8338 accepted it. Null while pending. */
  payment_date: string | null
  /** When the client says the transfer actually left their account. */
  client_declared_date: string | null
  method: 'cash' | 'check'
  reference_no: string | null
  proof_urls: string[]
  rejection_reason: string | null
  submitted_at: string | null
}

export interface ServiceInvoice {
  invoice_id: string
  booking_id: string | null
  si_number: string
  invoice_date: string
  total_amount_due: number
  payment_terms_days: 30 | 45 | 60
  due_date: string
  payment_status: 'unpaid' | 'due' | 'overdue' | 'paid' | 'cancelled'
  pdf_url: string | null
  /** Present on the single-invoice endpoint. */
  payments?: BillingPayment[]
}

export interface SubmitProofPayload {
  amount_paid: number
  client_declared_date: string
  method: 'cash' | 'check'
  reference_no?: string | null
  notes?: string | null
  proof_urls: string[]
}

export interface BillingPeriod {
  period_id: string
  mode: BillingMode
  period_start: string
  period_end: string
  cutoff_no: 1 | 2 | null
  status: BillingStatus
  rejected_by: 'client' | 'company' | null
  submission_start: string | null
  submission_end: string | null
  review_due_on: string | null
  summary_sent_at: string | null
  submitted_at: string | null
  total_amount: number | null
  /** Set by the server when its figures are being withheld. */
  amounts_hidden?: boolean
}

export interface BillingPeriodDetail extends BillingPeriod {
  deliveries: PeriodDelivery[]
  submissions: BillingSubmission[]
  invoices?: ServiceInvoice[]
}

export interface SubmitBillingPayload {
  submitted_amount: number
  client_billing_number?: string | null
  client_billing_date?: string | null
  remarks?: string | null
  document_urls: string[]
}

export const clientBillingService = {
  /** The client's billing periods, newest first. */
  listPeriods: (params?: { status?: string; limit?: number; offset?: number }) =>
    get<BillingPeriod[]>(`${B}/periods`, params),

  getPeriod: (periodId: string) => get<BillingPeriodDetail>(`${B}/periods/${periodId}`),

  /** Monthly: send 8338 the client's own billing summary for cross-checking. */
  submitBilling: (periodId: string, payload: SubmitBillingPayload) =>
    post<{ period: BillingPeriod; submission: BillingSubmission }>(
      `${B}/periods/${periodId}/submit`,
      payload,
    ),

  /** Weekly: accept or reject the summary 8338 sent. */
  reviewSummary: (periodId: string, decision: 'approve' | 'reject', remarks?: string | null) =>
    post<BillingPeriod>(`${B}/periods/${periodId}/review`, { decision, remarks }),

  getInvoice: (invoiceId: string) => get<ServiceInvoice>(`${B}/invoices/${invoiceId}`),

  /**
   * Tell 8338 an invoice has been paid, with evidence.
   *
   * Payment moves outside the system, so this is a claim, not a settlement —
   * the invoice stays unpaid until 8338 confirms the money arrived.
   */
  submitPaymentProof: (invoiceId: string, payload: SubmitProofPayload) =>
    post<BillingPayment>(`${B}/invoices/${invoiceId}/proof`, payload),
}

/** What the client can do about an invoice right now. */
export function invoiceState(
  invoice: ServiceInvoice,
  payments: BillingPayment[] = [],
): { label: string; tone: 'due' | 'pending' | 'rejected' | 'paid'; canUpload: boolean; reason?: string } {
  if (invoice.payment_status === 'paid') {
    return { label: 'Paid', tone: 'paid', canUpload: false }
  }
  const pending = payments.find((p) => p.status === 'pending_verification')
  if (pending) {
    return { label: 'Awaiting verification', tone: 'pending', canUpload: false }
  }
  const rejected = [...payments].reverse().find((p) => p.status === 'rejected')
  if (rejected) {
    return {
      label: 'Payment not confirmed',
      tone: 'rejected',
      canUpload: true,
      reason: rejected.rejection_reason ?? undefined,
    }
  }
  return {
    label: invoice.payment_status === 'overdue' ? 'Overdue' : 'Awaiting payment',
    tone: 'due',
    canUpload: true,
  }
}

// ---------------------------------------------------------------------------

/**
 * What the client can actually DO with a period right now.
 *
 * Derived in one place so the card, the tab filter and the detail screen cannot
 * disagree about whether something is actionable.
 */
export type PeriodAction = 'submit' | 'resubmit' | 'review' | 'none'

export function actionFor(period: BillingPeriod): PeriodAction {
  if (period.mode === 'monthly') {
    if (period.status === 'awaiting_submission') return 'submit'
    // 8338 found a discrepancy; the client files a further revision.
    if (period.status === 'rejected' && period.rejected_by === 'company') return 'resubmit'
    return 'none'
  }
  if (period.status === 'awaiting_client_approval') return 'review'
  return 'none'
}

/** Plain-language explanation of where a period stands, from the client's side. */
export function statusExplanation(period: BillingPeriod): string {
  const monthly = period.mode === 'monthly'
  switch (period.status) {
    case 'draft':
      return monthly
        ? `This cut-off is still running. You can submit your billing from ${period.submission_start ?? 'the submission window'}.`
        : 'This week is still running. 8338 will send the billing summary once it closes.'
    case 'consolidating':
      return monthly
        ? `8338 is finalising this cut-off. Your submission window opens ${period.submission_start ?? 'soon'}.`
        : '8338 is preparing your billing summary.'
    case 'awaiting_submission':
      return `Send your billing summary${period.submission_end ? ` by ${period.submission_end}` : ''}. Late submissions move to the next cut-off.`
    case 'awaiting_client_approval':
      return `Review 8338's summary and approve or reject it${period.review_due_on ? ` by ${period.review_due_on}` : ''}.`
    case 'under_review':
      return '8338 is cross-checking your submission against their records.'
    case 'rejected':
      return period.rejected_by === 'company'
        ? 'The figures did not match 8338’s records. Please correct and resubmit.'
        : 'You rejected this summary. 8338 is revising it.'
    case 'approved':
      return 'Both sides agree. 8338 will issue the Service Invoice.'
    case 'invoiced':
      return 'Service Invoices issued. Payment is accepted on Fridays only.'
    case 'paid':
      return 'Payment received. Your Acknowledgement Receipt is being issued.'
    case 'closed':
      return 'This billing cycle is closed.'
    case 'rolled_over':
      return 'No billing was submitted in the window, so this moved to the next cut-off.'
    case 'cancelled':
      return 'This billing period was cancelled.'
    default:
      return ''
  }
}

/** "Mar 01–15, 2026" — how a period is labelled throughout the UI. */
export function periodLabel(period: Pick<BillingPeriod, 'period_start' | 'period_end'>): string {
  const fmt = (d: string, withYear = false) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', {
      month: 'short',
      day: '2-digit',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    })
  return `${fmt(period.period_start)}–${fmt(period.period_end, true)}`
}
