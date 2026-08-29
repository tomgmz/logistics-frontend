'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, RefreshCw, X, ChevronLeft, ChevronRight, Download, CheckCircle2,
  XCircle, Clock, Eye, AlertTriangle, Receipt, Paperclip, FileText, FileImage,
  FileSpreadsheet, File, Inbox, Send, Calculator, Banknote, Plus, Trash2, Lock,
  BookOpen,
} from 'lucide-react'
import ReusableModal from '@/components/layout/ReusableModal'
import BookletSettings from './BookletSettings'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  billingService,
  clientNameOf,
  periodLabel,
  staffAction,
  statusNote,
  STAFF_ACTION_LABEL,
  type BillableBooking,
  type BillingPeriod,
  type BillingStatus,
  type ConsolidationLineInput,
  type PeriodDetail,
  type BillingPayment,
  type ServiceInvoice,
  type StaffAction,
} from '@/lib/services/admin/billing.service'

const PAGE_SIZE = 8
const CYAN = '#4df9ed'

function fmtCurrency(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function fmtLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function fileExt(name: string) {
  return name.split('.').pop()?.toLowerCase().split('?')[0] ?? ''
}

function fileIconConfig(name: string): { icon: React.ReactNode; bg: string; color: string } {
  switch (fileExt(name)) {
    case 'pdf':  return { icon: <FileText size={13} />, bg: 'rgba(239,68,68,.18)', color: '#f87171' }
    case 'jpg': case 'jpeg': case 'png':
      return { icon: <FileImage size={13} />, bg: 'rgba(147,51,234,.18)', color: '#c084fc' }
    case 'xlsx': case 'xls':
      return { icon: <FileSpreadsheet size={13} />, bg: 'rgba(58,246,38,.15)', color: '#86efac' }
    case 'docx': case 'doc':
      return { icon: <FileText size={13} />, bg: 'rgba(77,249,237,.15)', color: CYAN }
    default: return { icon: <File size={13} />, bg: 'rgba(255,255,255,.08)', color: '#9ca3af' }
  }
}

/** One palette for the whole workflow vocabulary, keyed by real status. */
function statusStyle(status: BillingStatus): { bg: string; color: string; border: string; icon: React.ReactNode } {
  const green  = { bg: 'rgba(58,246,38,0.1)',   color: '#86efac', border: 'rgba(58,246,38,0.3)' }
  const cyan   = { bg: 'rgba(77,249,237,0.1)',  color: CYAN,      border: 'rgba(77,249,237,0.3)' }
  const amber  = { bg: 'rgba(246,159,38,0.1)',  color: '#fbbf24', border: 'rgba(246,159,38,0.3)' }
  const red    = { bg: 'rgba(239,68,68,0.1)',   color: '#f87171', border: 'rgba(239,68,68,0.3)' }
  const grey   = { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', border: 'rgba(107,114,128,0.3)' }

  switch (status) {
    case 'closed': case 'paid':      return { ...green, icon: <CheckCircle2 size={12} /> }
    case 'approved': case 'invoiced': return { ...cyan, icon: <Receipt size={12} /> }
    case 'consolidating':            return { ...cyan, icon: <Calculator size={12} /> }
    case 'under_review':             return { ...amber, icon: <Eye size={12} /> }
    case 'awaiting_submission':
    case 'awaiting_client_approval': return { ...amber, icon: <Clock size={12} /> }
    case 'rejected':                 return { ...red, icon: <AlertTriangle size={12} /> }
    case 'rolled_over':              return { ...amber, icon: <ChevronRight size={12} /> }
    case 'cancelled':                return { ...grey, icon: <XCircle size={12} /> }
    default:                         return { ...grey, icon: <Clock size={12} /> }
  }
}

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: 'all',                              label: 'All' },
  { key: 'draft,consolidating',              label: 'To Consolidate' },
  { key: 'awaiting_submission,awaiting_client_approval', label: 'With Client' },
  { key: 'under_review',                     label: 'To Cross-check' },
  { key: 'approved',                         label: 'To Invoice' },
  { key: 'invoiced',                         label: 'Unpaid' },
  { key: 'paid,closed',                      label: 'Settled' },
]

// ---------------------------------------------------------------------------

function SummaryCards({ periods, pendingProofs }: { periods: BillingPeriod[]; pendingProofs: number }) {
  const n = (fn: (p: BillingPeriod) => boolean) => periods.filter(fn).length

  const cards = [
    { label: 'Needs Action', value: n((p) => !['none', 'collect'].includes(staffAction(p))), sub: 'waiting on 8338', color: CYAN },
    // Money a client says they sent that nobody has checked. Until it is
    // verified the invoice stays unpaid, so this queue is what holds a cycle up.
    { label: 'Proofs to Verify', value: pendingProofs, sub: 'client payments unchecked', color: '#fbbf24' },
    { label: 'Unpaid',       value: n((p) => p.status === 'invoiced'), sub: 'invoiced, not settled', color: '#f87171' },
    { label: 'Closed',       value: n((p) => p.status === 'closed'), sub: 'receipt issued', color: '#86efac' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border p-3 flex flex-col gap-1"
          style={{ border: '1px solid #2a2a2a', background: '#1b1b1b' }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">{c.label}</p>
          <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: c.color }}>{c.value}</p>
          <p className="text-[10px] text-white/35">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Consolidation editor
// ---------------------------------------------------------------------------

interface DraftLine extends ConsolidationLineInput { key: string }

/**
 * Pricing worksheet.
 *
 * Lines are grouped by booking because each booking becomes its own Service
 * Invoice — a booking may carry several charges (freight, surcharge, waiting
 * time), and those become that invoice's per-item breakdown.
 */
function ConsolidationEditor({
  bookings,
  lines,
  setLines,
  readOnly,
}: {
  bookings: BillableBooking[]
  lines: DraftLine[]
  setLines: (fn: (prev: DraftLine[]) => DraftLine[]) => void
  readOnly: boolean
}) {
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)

  const addLine = (bookingId: string, ref: string) =>
    setLines((prev) => [...prev, {
      key: `${bookingId}-${Date.now()}`,
      booking_id: bookingId,
      description: `Freight and logistics services — ${ref}`,
      quantity: 1,
      unit_price: 0,
    }])

  return (
    <div className="space-y-3">
      {bookings.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
          <p className="text-xs text-white/30">No completed deliveries fall in this period.</p>
        </div>
      )}

      {bookings.map((b) => {
        const own = lines.filter((l) => l.booking_id === b.booking_id)
        const sub = own.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)

        return (
          <div key={b.booking_id} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white font-mono">
                  {b.reference_number ?? b.booking_id.slice(0, 8)}
                </p>
                <p className="text-[10px] text-white/40 truncate">
                  {fmtDate(b.schedule_date)} · {b.truck_type_needed ?? '—'}
                  {b.payment_terms ? ` · ${b.payment_terms}-day terms` : ''}
                </p>
                <p className="text-[10px] text-white/35 truncate mt-0.5">
                  {b.origin ?? '—'}{b.destinations.length ? ` → ${b.destinations.join(', ')}` : ''}
                </p>
              </div>
              <span className="text-sm font-bold text-white tabular-nums shrink-0">{fmtCurrency(sub)}</span>
            </div>

            <div className="space-y-1.5">
              {own.map((l) => (
                <div key={l.key} className="flex items-center gap-2">
                  <input
                    disabled={readOnly}
                    value={l.description}
                    onChange={(e) => setLines((p) => p.map((x) => x.key === l.key ? { ...x, description: e.target.value } : x))}
                    placeholder="Nature of service"
                    className="flex-1 min-w-0 rounded-lg border border-white/10 bg-[#111] px-2.5 py-1.5 text-xs text-white/85 outline-none focus:border-[rgba(77,249,237,0.4)] disabled:opacity-60"
                  />
                  <input
                    disabled={readOnly} type="number" min="0" step="0.01"
                    value={l.quantity}
                    onChange={(e) => setLines((p) => p.map((x) => x.key === l.key ? { ...x, quantity: Number(e.target.value) } : x))}
                    className="w-16 rounded-lg border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white/85 tabular-nums outline-none focus:border-[rgba(77,249,237,0.4)] disabled:opacity-60"
                    title="Quantity"
                  />
                  <input
                    disabled={readOnly} type="number" min="0" step="0.01"
                    value={l.unit_price}
                    onChange={(e) => setLines((p) => p.map((x) => x.key === l.key ? { ...x, unit_price: Number(e.target.value) } : x))}
                    className="w-28 rounded-lg border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white/85 tabular-nums outline-none focus:border-[rgba(77,249,237,0.4)] disabled:opacity-60"
                    title="Unit price"
                  />
                  {!readOnly && (
                    <button type="button" onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                      className="p-1.5 rounded-md text-white/30 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {!readOnly && (
              <button type="button"
                onClick={() => addLine(b.booking_id, b.reference_number ?? b.booking_id.slice(0, 8))}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold transition-colors"
                style={{ color: CYAN }}>
                <Plus size={12} /> Add charge line
              </button>
            )}
          </div>
        )
      })}

      {bookings.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/30 px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">Period total</span>
          <span className="text-lg font-bold text-white tabular-nums">{fmtCurrency(total)}</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

function InvoiceRow({
  invoice, canCreate, onPay, onReceipt,
}: {
  invoice: ServiceInvoice
  canCreate: boolean
  onPay: () => void
  onReceipt: () => void
}) {
  const overdue = invoice.payment_status === 'overdue'
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-bold text-white font-mono">SI {invoice.si_number}</p>
        <p className={`text-[10px] mt-0.5 ${overdue ? 'text-red-400' : 'text-white/40'}`}>
          {invoice.payment_terms_days}-day terms · due {fmtDate(invoice.due_date)}
          {overdue ? ' · overdue' : ''}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-bold text-white tabular-nums">{fmtCurrency(invoice.total_amount_due)}</span>
        {invoice.pdf_url && (
          <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer"
            className="text-white/30 hover:text-[#4df9ed] transition-colors" title="Download PDF">
            <Download size={14} />
          </a>
        )}
        {canCreate && invoice.payment_status !== 'paid' && invoice.payment_status !== 'cancelled' && (
          <button type="button" onClick={onPay}
            className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] font-semibold text-white/70 hover:bg-white/5 transition-colors">
            Record Payment
          </button>
        )}
        {canCreate && invoice.payment_status === 'paid' && (
          <button type="button" onClick={onReceipt}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-black transition-opacity hover:opacity-90"
            style={{ background: CYAN }}>
            Issue AR
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------

/**
 * A client's payment claim, awaiting a decision.
 *
 * Their declared figure sits beside the invoice total because the two
 * disagreeing is the whole reason a person looks at this. The date shown is
 * when the client says the money left their account, which can be any day —
 * the Friday 8338 accepts it is set on confirmation.
 */
function PendingProofRow({
  payment,
  invoiceTotal,
  canVerify,
  onVerify,
}: {
  payment: BillingPayment
  invoiceTotal: number
  canVerify: boolean
  onVerify: (decision: 'confirm' | 'reject') => void
}) {
  const variance = Number(payment.amount_paid) - Number(invoiceTotal)

  return (
    <div className="rounded-xl border p-3 mt-2"
      style={{ borderColor: 'rgba(246,159,38,0.3)', background: 'rgba(246,159,38,0.05)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Clock size={12} className="text-amber-400" />
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400/80">
          Payment awaiting verification
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-2">
        <div>
          <p className="text-[10px] text-white/35">Client paid</p>
          <p className="text-sm font-bold text-white tabular-nums">{fmtCurrency(Number(payment.amount_paid))}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/35">Invoice total</p>
          <p className="text-sm font-bold text-white tabular-nums">{fmtCurrency(Number(invoiceTotal))}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/35">Variance</p>
          <p className="text-sm font-bold tabular-nums"
            style={{ color: Math.abs(variance) < 0.005 ? '#86efac' : '#fbbf24' }}>
            {Math.abs(variance) < 0.005 ? 'Matches' : fmtCurrency(variance)}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-white/50 mb-2">
        {fmtLabel(payment.method)}
        {payment.reference_no ? ` · ref ${payment.reference_no}` : ''}
        {payment.client_declared_date ? ` · client says paid ${fmtDate(payment.client_declared_date)}` : ''}
      </p>

      {payment.proof_urls.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          {payment.proof_urls.map((url, i) => {
            const name = decodeURIComponent(url.split('/').pop() ?? `proof-${i + 1}`)
            const fi = fileIconConfig(name)
            return (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/[0.07] bg-black/20 hover:border-[rgba(77,249,237,0.3)] transition-all group">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: fi.bg, color: fi.color }}>{fi.icon}</div>
                <p className="text-[11px] font-semibold text-white/85 truncate flex-1">{name}</p>
                <Download size={11} className="text-white/30 group-hover:text-[#4df9ed] shrink-0" />
              </a>
            )
          })}
        </div>
      )}

      {canVerify && (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onVerify('reject')}
            className="px-3 py-1.5 rounded-lg border border-red-500/25 text-[11px] font-bold text-red-400 hover:bg-red-500/10 transition-colors">
            Reject
          </button>
          <button type="button" onClick={() => onVerify('confirm')}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-black hover:opacity-90"
            style={{ background: CYAN }}>
            Confirm Payment
          </button>
        </div>
      )}
    </div>
  )
}

type Dialog =
  | { kind: 'send' }
  | { kind: 'validate'; decision: 'accept' | 'reject' }
  | { kind: 'invoice' }
  | { kind: 'pay'; invoice: ServiceInvoice }
  | { kind: 'receipt'; invoice: ServiceInvoice }
  | { kind: 'verify'; payment: BillingPayment; decision: 'confirm' | 'reject' }
  | null

function PeriodDetailPanel({
  periodId, onClose, onChanged,
}: {
  periodId: string
  onClose: () => void
  onChanged: () => void
}) {
  const { canEdit, canCreate } = useModuleAccess()

  const [detail, setDetail]   = useState<PeriodDetail | null>(null)
  const [bookings, setBooks]  = useState<BillableBooking[]>([])
  const [lines, setLines]     = useState<DraftLine[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [dialog, setDialog]   = useState<Dialog>(null)
  const [remarks, setRemarks] = useState('')

  // Payment form
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate]     = useState('')
  const [payMethod, setPayMethod] = useState<'cash' | 'check'>('check')
  const [payRef, setPayRef]       = useState('')
  const [ewt, setEwt]             = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await billingService.getPeriod(periodId)
      setDetail(d)
      const action = staffAction(d)
      if (action === 'consolidate' || action === 'send_summary' || action === 'validate') {
        const c = await billingService.getConsolidation(periodId)
        setBooks(c.bookings)
        setLines(c.items.map((i) => ({
          key: i.item_id,
          booking_id: i.booking_id,
          description: i.description,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
        })))
      }
    } catch (err) {
      appToast.error(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [periodId])

  useEffect(() => { void load() }, [load])

  const action: StaffAction = detail ? staffAction(detail) : 'none'
  const editable = canEdit && ['consolidate', 'send_summary'].includes(action)

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      appToast.success(ok)
      setDialog(null)
      setRemarks('')
      await load()
      onChanged()
    } catch (err) {
      appToast.error(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const saveConsolidation = () =>
    run(
      () => billingService.saveConsolidation(
        periodId,
        lines.filter((l) => l.unit_price > 0).map(({ key: _key, ...rest }) => rest),
      ),
      'Consolidation saved.',
    )

  const clientSubmission = detail?.submissions?.find((s) => s.origin === 'client')
  const variance = clientSubmission?.submitted_amount != null && detail
    ? Number(clientSubmission.submitted_amount) - Number(detail.total_amount)
    : null

  return (
    <motion.div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/65"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 14, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-none rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: 'var(--color-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !detail ? (
          <div className="p-10 flex items-center justify-center">
            <RefreshCw size={20} className="animate-spin text-white/40" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.07]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                    {detail.mode === 'monthly' ? `Monthly · cut-off ${detail.cutoff_no ?? ''}` : 'Weekly billing'}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide"
                    style={statusStyle(detail.status)}>
                    {statusStyle(detail.status).icon}{fmtLabel(detail.status)}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1">{periodLabel(detail)}</h2>
                <p className="text-xs text-white/45 mt-0.5">{clientNameOf(detail)}</p>
              </div>
              <button type="button" onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/5 text-white/50 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <p className="text-xs text-white/55">{statusNote(detail)}</p>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-1">8338 Total</p>
                  <p className="text-xl font-bold text-white tabular-nums">{fmtCurrency(Number(detail.total_amount))}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-1">Deliveries</p>
                  <p className="text-xl font-bold text-white tabular-nums">{detail.deliveries?.length ?? 0}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-1">Invoices</p>
                  <p className="text-xl font-bold text-white tabular-nums">{detail.invoices?.length ?? 0}</p>
                </div>
              </div>

              {/* Cross-check: the client's figure against 8338's own. */}
              {clientSubmission && (
                <div className="rounded-xl border p-4"
                  style={variance === 0
                    ? { borderColor: 'rgba(58,246,38,0.25)', background: 'rgba(58,246,38,0.05)' }
                    : { borderColor: 'rgba(246,159,38,0.25)', background: 'rgba(246,159,38,0.05)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40 mb-2">
                    Client submission · revision {clientSubmission.revision}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] text-white/35">They billed</p>
                      <p className="text-sm font-bold text-white tabular-nums">
                        {clientSubmission.submitted_amount != null ? fmtCurrency(Number(clientSubmission.submitted_amount)) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/35">8338 consolidated</p>
                      <p className="text-sm font-bold text-white tabular-nums">{fmtCurrency(Number(detail.total_amount))}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/35">Variance</p>
                      <p className="text-sm font-bold tabular-nums"
                        style={{ color: variance === 0 ? '#86efac' : '#fbbf24' }}>
                        {variance === null ? '—' : variance === 0 ? 'Matches' : fmtCurrency(variance)}
                      </p>
                    </div>
                  </div>
                  {clientSubmission.remarks && (
                    <p className="text-xs text-white/60 mt-3 leading-relaxed">{clientSubmission.remarks}</p>
                  )}
                  {clientSubmission.document_urls.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                      {clientSubmission.document_urls.map((url, i) => {
                        const name = decodeURIComponent(url.split('/').pop() ?? `file-${i + 1}`)
                        const fi = fileIconConfig(name)
                        return (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/[0.07] bg-black/20 hover:border-[rgba(77,249,237,0.3)] transition-all group">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: fi.bg, color: fi.color }}>{fi.icon}</div>
                            <p className="text-xs font-semibold text-white/85 truncate flex-1">{name}</p>
                            <Download size={12} className="text-white/30 group-hover:text-[#4df9ed] shrink-0" />
                          </a>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Pricing worksheet */}
              {(action === 'consolidate' || action === 'send_summary' || action === 'validate') && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35">
                      Consolidation
                    </p>
                    {!canEdit && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-white/35">
                        <Lock size={10} /> read only
                      </span>
                    )}
                  </div>
                  <ConsolidationEditor
                    bookings={bookings} lines={lines} setLines={setLines}
                    readOnly={!editable}
                  />
                  {editable && (
                    <button type="button" onClick={saveConsolidation} disabled={busy}
                      className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors disabled:opacity-50">
                      <Calculator size={14} />{busy ? 'Saving…' : 'Save Consolidation'}
                    </button>
                  )}
                </div>
              )}

              {/* Invoices */}
              {!!detail.invoices?.length && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-2">
                    Service Invoices · one per booking
                  </p>
                  <div className="space-y-2">
                    {detail.invoices.map((inv) => {
                      // A client's claim sits under the invoice it settles, so
                      // the figures being compared are next to each other.
                      const pending = (inv.payments ?? []).find(
                        (p) => p.status === 'pending_verification',
                      )
                      return (
                        <div key={inv.invoice_id}>
                          <InvoiceRow
                            invoice={inv} canCreate={canCreate}
                            onPay={() => {
                              setPayAmount(String(inv.total_amount_due))
                              setPayDate('')
                              setDialog({ kind: 'pay', invoice: inv })
                            }}
                            onReceipt={() => setDialog({ kind: 'receipt', invoice: inv })}
                          />
                          {pending && (
                            <PendingProofRow
                              payment={pending}
                              invoiceTotal={Number(inv.total_amount_due)}
                              canVerify={canCreate}
                              onVerify={(decision) => {
                                setPayDate('')
                                setRemarks('')
                                setDialog({ kind: 'verify', payment: pending, decision })
                              }}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* History */}
              {!!detail.submissions?.length && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-2">History</p>
                  <div className="space-y-1.5">
                    {detail.submissions.map((s) => (
                      <div key={s.submission_id} className="flex items-start gap-2 text-xs border-b border-white/[0.05] pb-1.5 last:border-0">
                        <span className="font-mono text-white/35 shrink-0">r{s.revision}</span>
                        <div className="min-w-0">
                          <span className="text-white/75">
                            {s.origin === 'client' ? 'Client submitted' : '8338 sent a summary'}
                            {s.submitted_amount != null ? ` — ${fmtCurrency(Number(s.submitted_amount))}` : ''}
                            {s.review_status !== 'pending' ? ` · ${fmtLabel(s.review_status)}` : ''}
                          </span>
                          {s.review_remarks && <p className="text-white/40 mt-0.5">{s.review_remarks}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.deliveries?.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 p-6 flex flex-col items-center gap-2">
                  <Paperclip size={22} className="text-white/20" />
                  <p className="text-xs text-white/30">No completed deliveries in this period</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.07]">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/5 transition-colors">
                Close
              </button>

              {canCreate && action === 'send_summary' && (
                <button type="button" onClick={() => setDialog({ kind: 'send' })}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-black hover:opacity-90"
                  style={{ background: CYAN }}>
                  <Send size={15} /> Send Summary
                </button>
              )}

              {canCreate && action === 'validate' && (
                <>
                  <button type="button" onClick={() => setDialog({ kind: 'validate', decision: 'reject' })}
                    className="px-4 py-2 rounded-lg border border-red-500/25 text-sm font-bold text-red-400 hover:bg-red-500/10 transition-colors">
                    Reject
                  </button>
                  <button type="button" onClick={() => setDialog({ kind: 'validate', decision: 'accept' })}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-black hover:opacity-90"
                    style={{ background: CYAN }}>
                    Accept &amp; Approve
                  </button>
                </>
              )}

              {canCreate && action === 'invoice' && (
                <button type="button" onClick={() => { setEwt(''); setDialog({ kind: 'invoice' }) }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-black hover:opacity-90"
                  style={{ background: CYAN }}>
                  <Receipt size={15} /> Issue Invoices
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>

      {/* --- confirmations --------------------------------------------------- */}
      {dialog?.kind === 'send' && (
        <ReusableModal
          open
          title="Send the billing summary?"
          description={`The client will be notified and has 3 working days to approve or reject it. Total ${fmtCurrency(Number(detail?.total_amount ?? 0))}.`}
          confirmLabel={busy ? 'Sending…' : 'Send'}
          cancelLabel="Cancel"
          onConfirm={() => run(() => billingService.sendSummary(periodId), 'Summary sent to the client.')}
          onCancel={() => !busy && setDialog(null)}
          disableBackdropClose={busy}
        />
      )}

      {dialog?.kind === 'validate' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
          onClick={() => !busy && setDialog(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 p-5 space-y-4"
            style={{ background: 'var(--color-surface)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white">
              {dialog.decision === 'accept' ? 'Accept this reverse billing?' : 'Send it back for correction?'}
            </h3>
            <p className="text-xs text-white/50">
              {dialog.decision === 'accept'
                ? 'Confirms the client’s figures match 8338’s records. You can then issue one Service Invoice per booking.'
                : 'Explain the discrepancy so the client can correct and resubmit.'}
            </p>
            {dialog.decision === 'reject' && (
              <textarea
                rows={3} autoFocus value={remarks} onChange={(e) => setRemarks(e.target.value)}
                placeholder="What does not match?"
                className="w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/80 placeholder:text-white/30 outline-none focus:border-[rgba(77,249,237,0.4)] resize-none"
              />
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => !busy && setDialog(null)}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80">Cancel</button>
              <button type="button" disabled={busy}
                onClick={() => run(
                  () => billingService.validateSubmission(periodId, dialog.decision, remarks || null),
                  dialog.decision === 'accept' ? 'Reverse billing validated.' : 'Sent back to the client.',
                )}
                className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                style={dialog.decision === 'accept'
                  ? { background: CYAN, color: '#000' }
                  : { border: '1px solid rgba(239,68,68,.3)', color: '#f87171' }}>
                {busy ? 'Working…' : dialog.decision === 'accept' ? 'Accept' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'invoice' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
          onClick={() => !busy && setDialog(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 p-5 space-y-4"
            style={{ background: 'var(--color-surface)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white">Issue Service Invoices</h3>
            <p className="text-xs text-white/50">
              One invoice per booking, each taking its own 30/45/60 term and due date. Serials come
              from the booklet counter; a booking that already has an invoice is skipped.
            </p>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
                Withholding tax %
              </label>
              <input
                type="number" min="0" max="100" step="0.01" value={ewt}
                onChange={(e) => setEwt(e.target.value)} placeholder="0"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/80 outline-none focus:border-[rgba(77,249,237,0.4)]"
              />
              {/* Left at 0 unless set: the rate follows the client's tax status, and
                  guessing it would put a wrong TOTAL AMOUNT DUE on a BIR document. */}
              <p className="text-[10px] text-white/35 mt-1">
                Leave blank for none. Services are commonly withheld at 2% — confirm against the
                client’s tax status before issuing.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => !busy && setDialog(null)}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80">Cancel</button>
              <button type="button" disabled={busy}
                onClick={() => run(
                  () => billingService.issueInvoices(periodId, {
                    withholding_tax_rate: ewt ? Number(ewt) : undefined,
                  }),
                  'Service Invoices issued.',
                )}
                className="px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-50"
                style={{ background: CYAN }}>
                {busy ? 'Issuing…' : 'Issue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'pay' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
          onClick={() => !busy && setDialog(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 p-5 space-y-4"
            style={{ background: 'var(--color-surface)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white">Record payment · SI {dialog.invoice.si_number}</h3>
            {/* The server rejects a non-Friday and names the next one; this is the
                nudge, not the rule. */}
            <p className="text-xs text-white/50">
              8338 accepts payment on <strong className="text-white/80">Fridays only</strong>. Due{' '}
              {fmtDate(dialog.invoice.due_date)}.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">Amount</label>
                <input type="number" min="0" step="0.01" value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/80 outline-none focus:border-[rgba(77,249,237,0.4)]" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">Date paid</label>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/80 outline-none focus:border-[rgba(77,249,237,0.4)]" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'cash' | 'check')}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/80 outline-none">
                  <option value="check">Check</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">Reference</label>
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Check no."
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/80 outline-none focus:border-[rgba(77,249,237,0.4)]" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => !busy && setDialog(null)}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80">Cancel</button>
              <button type="button" disabled={busy || !payAmount || !payDate}
                onClick={() => run(
                  () => billingService.recordPayment(dialog.invoice.invoice_id, {
                    amount_paid: Number(payAmount),
                    payment_date: payDate,
                    method: payMethod,
                    reference_no: payRef || null,
                  }),
                  'Payment recorded.',
                )}
                className="px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-50"
                style={{ background: CYAN }}>
                <span className="inline-flex items-center gap-1.5"><Banknote size={14} />{busy ? 'Saving…' : 'Record'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'verify' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
          onClick={() => !busy && setDialog(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 p-5 space-y-4"
            style={{ background: 'var(--color-surface)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white">
              {dialog.decision === 'confirm' ? 'Confirm this payment?' : 'Reject this payment?'}
            </h3>
            <p className="text-xs text-white/50">
              {dialog.decision === 'confirm'
                ? `${fmtCurrency(Number(dialog.payment.amount_paid))} against this invoice. Confirming is what settles it — check the proof against the bank record first.`
                : 'The client will be told why and can upload proof again.'}
            </p>

            {dialog.decision === 'confirm' ? (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
                  Friday 8338 accepted it
                </label>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/80 outline-none focus:border-[rgba(77,249,237,0.4)]" />
                {/* Not the client's transfer date — 8338 only accepts payment on
                    Fridays, and the server refuses anything else. */}
                <p className="text-[10px] text-white/35 mt-1">
                  Must be a Friday.
                  {dialog.payment.client_declared_date
                    ? ` The client says they paid ${fmtDate(dialog.payment.client_declared_date)}.`
                    : ''}
                </p>
              </div>
            ) : (
              <textarea rows={3} autoFocus value={remarks} onChange={(e) => setRemarks(e.target.value)}
                placeholder="What does not match the bank record?"
                className="w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/80 placeholder:text-white/30 outline-none focus:border-[rgba(77,249,237,0.4)] resize-none" />
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => !busy && setDialog(null)}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80">Cancel</button>
              <button type="button"
                disabled={busy || (dialog.decision === 'confirm' ? !payDate : !remarks.trim())}
                onClick={() => run(
                  () => billingService.verifyPayment(dialog.payment.payment_id, {
                    decision: dialog.decision,
                    payment_date: dialog.decision === 'confirm' ? payDate : undefined,
                    remarks: dialog.decision === 'reject' ? remarks : undefined,
                  }),
                  dialog.decision === 'confirm' ? 'Payment confirmed.' : 'Sent back to the client.',
                )}
                className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                style={dialog.decision === 'confirm'
                  ? { background: CYAN, color: '#000' }
                  : { border: '1px solid rgba(239,68,68,.3)', color: '#f87171' }}>
                {busy ? 'Working…' : dialog.decision === 'confirm' ? 'Confirm' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'receipt' && (
        <ReusableModal
          open
          title="Issue the Acknowledgement Receipt?"
          description={`Closes the cycle for SI ${dialog.invoice.si_number}. The serial comes from the AR booklet counter; a hard copy still follows separately.`}
          confirmLabel={busy ? 'Issuing…' : 'Issue AR'}
          cancelLabel="Cancel"
          onConfirm={() => run(async () => {
            // The receipt hangs off the PAYMENT, not the invoice, so resolve the
            // settling payment first rather than assuming one.
            const inv = await billingService.getInvoice(dialog.invoice.invoice_id)
            const paymentId = inv.payments?.[0]?.payment_id
            if (!paymentId) throw new Error('No recorded payment found for this invoice.')
            return billingService.issueReceipt(paymentId)
          }, 'Acknowledgement Receipt issued.')}
          onCancel={() => !busy && setDialog(null)}
          disableBackdropClose={busy}
        />
      )}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------

export default function BillingManagementView({ roleView }: { roleView?: string } = {}) {
  void roleView

  const { canView } = useModuleAccess()

  const [periods, setPeriods] = useState<BillingPeriod[]>([])
  const [pendingProofs, setPendingProofs] = useState<BillingPayment[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('all')
  const [page, setPage]       = useState(0)
  const [openId, setOpenId]   = useState<string | null>(null)
  const [showBooklets, setShowBooklets] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [res, proofs] = await Promise.all([
        billingService.listPeriods({
          status: status === 'all' ? undefined : status,
          limit: 100,
        }),
        billingService.listPendingPayments(),
      ])
      setPeriods(res.data ?? [])
      setPendingProofs(proofs ?? [])
      setTotal(res.meta?.total ?? res.data?.length ?? 0)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return periods
    return periods.filter((p) =>
      clientNameOf(p).toLowerCase().includes(q) ||
      periodLabel(p).toLowerCase().includes(q) ||
      p.status.includes(q) ||
      p.mode.includes(q),
    )
  }, [periods, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe  = Math.min(page, pageCount - 1)
  const pageRows  = filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE)

  if (!canView) return null

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-sc bg-[var(--color-bg)]">
      <header className="shrink-0 px-3 py-3 lg:px-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Billing Management</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* The ATP block and serial counter printed on every generated
              document. Kept here rather than in system settings because it is
              the accountant who replaces the pad. */}
          <button type="button" onClick={() => setShowBooklets(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors">
            <BookOpen size={14} />
            Booklet Settings
          </button>
          <button type="button" onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 gap-3 overflow-hidden">
        <SummaryCards periods={periods} pendingProofs={pendingProofs.length} />

        <div className="flex flex-col xl:flex-row gap-2 xl:items-center shrink-0">
          <div className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-sm" style={{ background: '#2a2828' }}>
            <Search size={15} className="text-white/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Search client, period or status…"
              className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-white/40 hover:text-white/70">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            {STATUS_FILTERS.map((f) => {
              const active = status === f.key
              return (
                <button key={f.key} type="button"
                  onClick={() => { setStatus(f.key); setPage(0) }}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                  style={{
                    background: active ? 'rgba(77,249,237,0.12)' : 'transparent',
                    borderColor: active ? 'rgba(77,249,237,0.35)' : 'rgba(255,255,255,0.08)',
                    color: active ? CYAN : '#888',
                  }}>
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
          <div className="overflow-auto flex-1 min-h-0">
            {loading ? (
              <div className="p-10 flex items-center justify-center">
                <RefreshCw size={20} className="animate-spin text-white/40" />
              </div>
            ) : error ? (
              <div className="p-10 flex flex-col items-center gap-3">
                <AlertTriangle size={26} className="text-red-400" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            ) : pageRows.length === 0 ? (
              <div className="p-12 flex flex-col items-center gap-3 text-center">
                <Inbox size={28} className="text-white/20" />
                <p className="text-sm text-white/35">
                  {periods.length === 0 ? 'No billing periods yet.' : 'No periods match this filter.'}
                </p>
                {periods.length === 0 && (
                  <p className="text-xs text-white/25 max-w-sm">
                    Periods are created once a client has completed deliveries. They become
                    workable when the period closes.
                  </p>
                )}
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse min-w-[900px]">
                <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                  <tr className="text-[10px] uppercase tracking-wider text-white/40">
                    <th className="px-3 py-2.5 font-bold">Period</th>
                    <th className="px-3 py-2.5 font-bold">Client</th>
                    <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Mode</th>
                    <th className="px-3 py-2.5 font-bold">Deliveries</th>
                    <th className="px-3 py-2.5 font-bold">Amount</th>
                    <th className="px-3 py-2.5 font-bold">Status</th>
                    <th className="px-3 py-2.5 font-bold text-right w-[150px]">Next Step</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => {
                    const st = statusStyle(p.status)
                    const act = staffAction(p)
                    return (
                      <tr key={p.period_id}
                        className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
                        <td className="px-3 py-3 align-middle">
                          <p className="text-xs font-semibold text-white/90">{periodLabel(p)}</p>
                          <p className="text-[10px] text-white/40 mt-0.5">
                            {p.mode === 'monthly' ? `Cut-off ${p.cutoff_no ?? ''}` : 'Weekly'}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <p className="text-sm font-semibold text-white truncate max-w-[180px]">{clientNameOf(p)}</p>
                        </td>
                        <td className="px-3 py-3 align-middle hidden lg:table-cell">
                          <span className="text-xs text-white/60">{fmtLabel(p.mode)}</span>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <span className="text-xs text-white/70 tabular-nums">{p.delivery_count ?? 0}</span>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <span className="font-mono text-sm font-bold text-white tabular-nums">
                            {fmtCurrency(Number(p.total_amount))}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                            style={{ color: st.color, borderColor: st.border, background: st.bg }}>
                            {st.icon}{fmtLabel(p.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle text-right">
                          <button type="button" onClick={() => setOpenId(p.period_id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors"
                            style={act === 'none' || act === 'collect'
                              ? { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }
                              : { borderColor: 'rgba(77,249,237,0.35)', background: 'rgba(77,249,237,0.1)', color: CYAN }}>
                            <Eye size={13} />{STAFF_ACTION_LABEL[act]}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-white/[0.07] text-xs text-white/50">
            <span>
              {filtered.length === 0 ? '0'
                : `${pageSafe * PAGE_SIZE + 1}–${Math.min((pageSafe + 1) * PAGE_SIZE, filtered.length)}`}
              {' '}of {filtered.length} period{filtered.length === 1 ? '' : 's'}
              {total > periods.length ? ` (${total} total)` : ''}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={pageSafe <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="p-1.5 rounded-md border border-white/10 disabled:opacity-30 hover:bg-white/5 transition-colors">
                <ChevronLeft size={15} />
              </button>
              <span className="px-2 tabular-nums">{pageSafe + 1} / {pageCount}</span>
              <button type="button" disabled={pageSafe >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="p-1.5 rounded-md border border-white/10 disabled:opacity-30 hover:bg-white/5 transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showBooklets && <BookletSettings onClose={() => setShowBooklets(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {openId && (
          <PeriodDetailPanel
            periodId={openId}
            onClose={() => setOpenId(null)}
            onChanged={() => void load()}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
