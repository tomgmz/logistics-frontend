import proxyApi, { initCsrf } from '@/lib/api/auth.api'

/**
 * Reverse billing, staff side.
 *
 * Access is governed by the billing-management module tier, enforced on the
 * server: GET needs can_view, saving a consolidation needs can_edit, and
 * issuing a document needs can_create. The UI mirrors that with
 * useModuleAccess() so a read-only accountant is not shown buttons that would
 * be refused.
 */

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
  meta?: { total: number }
}

const B = '/billing'

async function raw<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url, { params })
  return data
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return (await raw<T>(url, params)).data
}

async function post<T>(url: string, payload?: unknown): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.post<ApiResponse<T>>(url, payload ?? {})
  return data.data
}

async function put<T>(url: string, payload?: unknown): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.put<ApiResponse<T>>(url, payload ?? {})
  return data.data
}

// ---------------------------------------------------------------------------

export type BillingMode = 'weekly' | 'monthly'

export type BillingStatus =
  | 'draft' | 'consolidating' | 'awaiting_submission' | 'awaiting_client_approval'
  | 'under_review' | 'rejected' | 'approved' | 'invoiced' | 'paid' | 'closed'
  | 'cancelled' | 'rolled_over'

export type PaymentStatus = 'unpaid' | 'due' | 'overdue' | 'paid' | 'cancelled'

export interface PeriodClient {
  client_id: string
  company_name: string | null
  registered_name: string | null
  billing_address: string | null
  tin: string | null
  billing_mode: BillingMode | null
}

export interface BillingPeriod {
  period_id: string
  client_id: string
  mode: BillingMode
  period_start: string
  period_end: string
  cutoff_no: 1 | 2 | null
  status: BillingStatus
  rejected_by: 'client' | 'company' | null
  consolidation_start: string | null
  consolidation_end: string | null
  submission_start: string | null
  submission_end: string | null
  validation_start: string | null
  validation_end: string | null
  review_due_on: string | null
  summary_sent_at: string | null
  submitted_at: string | null
  total_amount: number
  clients: PeriodClient | null
  delivery_count?: number
}

/** A completed delivery inside a period, as the consolidation worksheet sees it. */
export interface BillableBooking {
  booking_id: string
  reference_number: string | null
  schedule_date: string
  origin: string | null
  destinations: string[]
  truck_type_needed: string | null
  payment_terms: string | null
  billed_amount: number | null
}

/** One printed charge line. Several may share a booking. */
export interface PeriodItem {
  item_id: string
  period_id: string
  booking_id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  sort_order: number
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

export interface ServiceInvoice {
  invoice_id: string
  period_id: string
  booking_id: string | null
  si_number: string
  invoice_date: string
  sale_type: 'cash' | 'charge'
  sold_to_name: string
  total_sales_vat_inclusive: number
  net_of_vat: number
  vat_amount: number
  discount_amount: number
  withholding_tax_rate: number
  withholding_tax_amount: number
  total_amount_due: number
  payment_terms_days: 30 | 45 | 60
  term_end_date: string
  due_date: string
  payment_status: PaymentStatus
  pdf_url: string | null
  /** Every payment against this invoice, confirmed or not. */
  payments?: BillingPayment[]
}

export type PaymentVerificationStatus = 'pending_verification' | 'confirmed' | 'rejected'

export interface BillingPayment {
  payment_id: string
  invoice_id: string
  amount_paid: number
  status: PaymentVerificationStatus
  /** The Friday 8338 accepted it. Null while awaiting verification. */
  payment_date: string | null
  /** When the client says the transfer actually left their account. */
  client_declared_date: string | null
  method: 'cash' | 'check'
  reference_no: string | null
  notes: string | null
  proof_urls: string[]
  rejection_reason: string | null
  submitted_at: string | null
  /** Present on the pending queue, so a proof can be shown with its invoice. */
  service_invoices?: {
    invoice_id: string
    si_number: string
    period_id: string
    total_amount_due: number
    due_date: string
  } | null
}

export interface PeriodDetail extends BillingPeriod {
  items: PeriodItem[]
  submissions: BillingSubmission[]
  invoices: ServiceInvoice[]
  deliveries: BillableBooking[]
}

export interface ConsolidationView {
  period: BillingPeriod
  bookings: BillableBooking[]
  items: PeriodItem[]
}

export interface ConsolidationLineInput {
  booking_id: string
  description: string
  quantity: number
  unit_price: number
  sort_order?: number
}

export interface IssueInvoicesPayload {
  invoice_date?: string
  sale_type?: 'cash' | 'charge'
  discount_rate?: number
  withholding_tax_rate?: number
  booking_ids?: string[]
  overrides?: Record<string, { si_number?: string; withholding_tax_rate?: number }>
}

/**
 * One BIR-registered pad: its serial counter and the Authority to Print block
 * printed in its footer.
 *
 * The ATP fields are stored and printed verbatim — the date is a string because
 * the requirement is to reproduce the pad exactly, and reformatting it risks
 * showing something different from the paper.
 */
export interface BookletSettings {
  series_key: 'service_invoice' | 'acknowledgement_receipt'
  next_number: number
  booklet_start: number | null
  booklet_end: number | null
  /** Zero-padding: the AR pad prints 0015, the SI prints 151. */
  pad_width: number
  atp_number: string | null
  atp_date: string | null
  booklet_label: string | null
  printer_name: string | null
  printer_address: string | null
  printer_vat: string | null
  printer_accreditation: string | null
  printer_issued: string | null
  printer_expiry: string | null
  updated_at: string
}

export type BookletUpdate = Partial<Omit<BookletSettings, 'series_key' | 'updated_at'>> & {
  acknowledge_warnings?: boolean
}

/**
 * A risky serial change comes back unapplied, with what is risky about it, and
 * has to be re-sent acknowledged. Neither case can be forbidden outright — a
 * fresh pad legitimately resets the count — so they warn rather than block.
 */
export interface BookletSaveResult {
  requires_confirmation: boolean
  warnings: string[]
  series: BookletSettings
}

export const billingService = {
  listPeriods: (params?: {
    status?: string; mode?: BillingMode; client_id?: string; limit?: number; offset?: number
  }) => raw<BillingPeriod[]>(`${B}/periods`, params),

  getPeriod: (periodId: string) => get<PeriodDetail>(`${B}/periods/${periodId}`),

  /** An invoice with the payments recorded against it. */
  getInvoice: (invoiceId: string) =>
    get<ServiceInvoice & { payments: BillingPayment[] }>(`${B}/invoices/${invoiceId}`),

  getConsolidation: (periodId: string) =>
    get<ConsolidationView>(`${B}/periods/${periodId}/consolidation`),

  saveConsolidation: (periodId: string, items: ConsolidationLineInput[]) =>
    put<{ period: BillingPeriod; total: number; count: number }>(
      `${B}/periods/${periodId}/consolidation`,
      { items },
    ),

  /** Weekly only: send the priced summary to the client for cross-checking. */
  sendSummary: (periodId: string) => post<BillingPeriod>(`${B}/periods/${periodId}/send-summary`),

  /** Monthly only: accept or reject what the client submitted. */
  validateSubmission: (periodId: string, decision: 'accept' | 'reject', remarks?: string | null) =>
    post<BillingPeriod>(`${B}/periods/${periodId}/validate`, { decision, remarks }),

  /** Fans the period out into one Service Invoice per booking. */
  issueInvoices: (periodId: string, payload: IssueInvoicesPayload = {}) =>
    post<{ period: BillingPeriod; issued: ServiceInvoice[]; skipped_count: number }>(
      `${B}/periods/${periodId}/invoices`,
      payload,
    ),

  recordPayment: (
    invoiceId: string,
    payload: {
      amount_paid: number
      payment_date: string
      method: 'cash' | 'check'
      reference_no?: string | null
      notes?: string | null
    },
  ) =>
    post<{ payment: BillingPayment; settled: boolean; paid_so_far: number }>(
      `${B}/invoices/${invoiceId}/payments`,
      payload,
    ),

  /** The verification queue: client claims nobody has checked yet. */
  listPendingPayments: (periodId?: string) =>
    get<BillingPayment[]>(`${B}/payments/pending`, periodId ? { period_id: periodId } : undefined),

  /**
   * Confirm or reject a client's payment claim.
   *
   * `payment_date` is the FRIDAY 8338 accepted the money — not the date the
   * client said they transferred it. Confirming is the only way a client-
   * submitted payment ever counts toward an invoice.
   */
  verifyPayment: (
    paymentId: string,
    payload: { decision: 'confirm' | 'reject'; payment_date?: string; remarks?: string | null },
  ) => post<{ payment: BillingPayment; settled: boolean }>(`${B}/payments/${paymentId}/verify`, payload),

  /** Fills in a PDF that failed to render when the invoice was issued. */
  regenerateInvoicePdf: (invoiceId: string) =>
    post<{ invoice_id: string; pdf_url: string }>(`${B}/invoices/${invoiceId}/pdf`),

  /** Both BIR booklets in use. */
  listBooklets: () => get<BookletSettings[]>(`${B}/document-series`),

  saveBooklet: (key: string, payload: BookletUpdate) =>
    put<BookletSaveResult>(`${B}/document-series/${key}`, payload),

  issueReceipt: (
    paymentId: string,
    payload: { ar_number?: string; receipt_date?: string; payment_for?: string | null } = {},
  ) =>
    post<{ ar_id: string; ar_number: string; pdf_url: string | null }>(
      `${B}/payments/${paymentId}/receipt`,
      payload,
    ),
}

// ---------------------------------------------------------------------------

/** What 8338 has to do next on a period, if anything. */
export type StaffAction =
  | 'consolidate'   // price the deliveries
  | 'send_summary'  // weekly: hand it to the client
  | 'validate'      // monthly: cross-check what the client sent
  | 'invoice'       // both agreed; issue the Service Invoices
  | 'collect'       // invoiced; waiting on payment
  | 'receipt'       // paid; issue the Acknowledgement Receipt
  | 'none'

export function staffAction(period: BillingPeriod): StaffAction {
  switch (period.status) {
    case 'draft':
    case 'consolidating':
      // A weekly period that is already priced is ready to send.
      return period.mode === 'weekly' && period.total_amount > 0 ? 'send_summary' : 'consolidate'
    case 'rejected':
      // Whoever rejected decides who acts next: the client rejecting sends it
      // back to 8338 to re-price, while 8338 rejecting waits on the client.
      return period.rejected_by === 'client' ? 'consolidate' : 'none'
    case 'under_review':
      return 'validate'
    case 'approved':
      return 'invoice'
    case 'invoiced':
      return 'collect'
    case 'paid':
      return 'receipt'
    default:
      return 'none'
  }
}

export const STAFF_ACTION_LABEL: Record<StaffAction, string> = {
  consolidate:  'Consolidate',
  send_summary: 'Send Summary',
  validate:     'Cross-check',
  invoice:      'Issue Invoices',
  collect:      'Record Payment',
  receipt:      'Issue Receipt',
  none:         'View',
}

/** Plain-language note on where a period stands, from 8338's side. */
export function statusNote(p: BillingPeriod): string {
  switch (p.status) {
    case 'draft':          return 'Period still running. Price it once it closes.'
    case 'consolidating':  return p.mode === 'weekly'
      ? 'Price the week, then send the summary to the client.'
      : 'Price the cut-off so you have figures to cross-check against.'
    case 'awaiting_submission':      return 'Waiting for the client to send their billing summary.'
    case 'awaiting_client_approval': return 'Summary sent. Waiting for the client to approve.'
    case 'under_review':   return 'The client submitted. Cross-check it against your consolidation.'
    case 'rejected':       return p.rejected_by === 'client'
      ? 'The client rejected the summary. Revise the pricing and resend.'
      : 'Sent back to the client for correction.'
    case 'approved':       return 'Both sides agree. Issue one Service Invoice per booking.'
    case 'invoiced':       return 'Invoices issued. Payment is accepted on Fridays only.'
    case 'paid':           return 'Settled. Issue the Acknowledgement Receipt to close the cycle.'
    case 'closed':         return 'Cycle closed.'
    case 'rolled_over':    return 'Submission window was missed; moved to the next cut-off.'
    case 'cancelled':      return 'Cancelled.'
    default:               return ''
  }
}

/** "Mar 01–15, 2026" */
export function periodLabel(p: Pick<BillingPeriod, 'period_start' | 'period_end'>): string {
  const fmt = (d: string, withYear = false) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', {
      month: 'short',
      day: '2-digit',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    })
  return `${fmt(p.period_start)}–${fmt(p.period_end, true)}`
}

export function clientNameOf(p: BillingPeriod): string {
  return p.clients?.registered_name || p.clients?.company_name || 'Unknown client'
}
