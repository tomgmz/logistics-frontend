'use client'

import { motion, Variants, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FileText, Search, ChevronRight, ChevronLeft,
  MapPin, Truck, Package, Calendar, Hash,
  X, Check, Upload, Download, AlertCircle,
  Clock, CheckCircle2, XCircle, Receipt, RefreshCw, Lock, Inbox,
} from 'lucide-react'

import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { SxProps, Theme } from '@mui/material/styles'

import {
  actionFor,
  clientBillingService,
  periodLabel,
  statusExplanation,
  type BillingPeriod,
  type BillingPeriodDetail,
  type BillingStatus,
  type PeriodAction,
  type PeriodDelivery,
} from '@/lib/services/client/billing.service'
import { uploadService } from '@/lib/services/admin/documentUpload.service'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'

const BG_PAGE   = '#0a0a0a'
const BG_PANEL  = '#2A2828'
const BG_CARD   = '#424242'
const BORDER    = 'rgba(255,255,255,0.07)'
const BORDER_C  = 'rgba(255,255,255,0.12)'
const CYAN      = '#4DF9ED'
const MUTED     = '#818181'
const ERROR     = '#f87171'
const ERROR_B   = `${ERROR}99`
const AMBER     = '#FBBF24'
const RADIUS    = '8px'

function fieldSx(bg: string, border: string, hasError = false): SxProps<Theme> {
  const active = hasError ? ERROR : `${CYAN}66`
  const idle   = hasError ? ERROR_B : border
  return {
    '& .MuiInputBase-root': {
      height: 36, borderRadius: RADIUS, backgroundColor: bg,
      color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
    },
    '& .MuiInputBase-input': {
      padding: '0 12px', height: 36, boxSizing: 'border-box',
      '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
    },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: idle, borderRadius: RADIUS },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: active },
    '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: active, borderWidth: 1 },
    '& .MuiInputLabel-root': { display: 'none' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

function textareaSx(bg: string, border: string, hasError = false): SxProps<Theme> {
  const active = hasError ? ERROR : `${CYAN}66`
  const idle   = hasError ? ERROR_B : border
  return {
    '& .MuiInputBase-root': {
      borderRadius: RADIUS, backgroundColor: bg,
      color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit', padding: 0,
    },
    '& .MuiInputBase-input': {
      padding: '10px 12px',
      '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
    },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: idle, borderRadius: RADIUS },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: active },
    '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: active, borderWidth: 1 },
    '& .MuiInputLabel-root': { display: 'none' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35 } },
}
const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
}
const slideIn: Variants = {
  hidden: { opacity: 0, x: 24 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.3 } },
}

const MAX_FILES      = 3
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_EXTS   = ['.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png']

function formatBytes(b: number) {
  if (b < 1024)        return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

function formatPeso(n: number) {
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

const STATUS_META: Record<BillingStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft:                    { label: 'Upcoming',        color: MUTED, icon: <Clock size={12} /> },
  consolidating:            { label: 'Being Prepared',  color: MUTED, icon: <Clock size={12} /> },
  awaiting_submission:      { label: 'Ready to Bill',   color: CYAN,  icon: <FileText size={12} /> },
  awaiting_client_approval: { label: 'Needs Review',    color: CYAN,  icon: <FileText size={12} /> },
  under_review:             { label: 'Under Review',    color: AMBER, icon: <Clock size={12} /> },
  rejected:                 { label: 'Needs Correcting', color: ERROR, icon: <XCircle size={12} /> },
  approved:                 { label: 'Approved',        color: CYAN,  icon: <CheckCircle2 size={12} /> },
  invoiced:                 { label: 'Invoiced',        color: CYAN,  icon: <Receipt size={12} /> },
  paid:                     { label: 'Paid',            color: CYAN,  icon: <CheckCircle2 size={12} /> },
  closed:                   { label: 'Closed',          color: MUTED, icon: <CheckCircle2 size={12} /> },
  cancelled:                { label: 'Cancelled',       color: MUTED, icon: <XCircle size={12} /> },
  rolled_over:              { label: 'Moved Forward',   color: AMBER, icon: <ChevronRight size={12} /> },
}

/** Client-meaningful groupings, not raw workflow states. */
type TabKey = 'all' | 'action' | 'waiting' | 'settled'

const TAB_FILTERS: { key: TabKey; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'action',  label: 'Action Needed' },
  { key: 'waiting', label: 'In Progress' },
  { key: 'settled', label: 'Settled' },
]

function tabOf(period: BillingPeriod): Exclude<TabKey, 'all'> {
  if (actionFor(period) !== 'none') return 'action'
  if (['paid', 'closed', 'cancelled', 'rolled_over'].includes(period.status)) return 'settled'
  return 'waiting'
}

function StatusBadge({ status }: { status: BillingStatus }) {
  const m = STATUS_META[status]
  if (!m) return null
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm"
      style={{ color: m.color, background: `${m.color}18`, border: `1px solid ${m.color}40` }}
    >
      {m.icon}{m.label}
    </span>
  )
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white">{icon}</span>
      <h3 className="ff-sc text-white font-bold tracking-wide text-sm">{title}</h3>
    </div>
  )
}

function InfoTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>{label}</span>
      <span className="text-sm font-bold" style={{ color: accent ? CYAN : '#fff' }}>{value}</span>
    </div>
  )
}

function WizBtn({
  onClick, variant, children, disabled,
}: {
  onClick: () => void
  variant: 'next' | 'back' | 'danger'
  children: React.ReactNode
  disabled?: boolean
}) {
  const style =
    variant === 'next'   ? { background: CYAN, color: '#0a0a0a' }
  : variant === 'danger' ? { background: 'transparent', color: ERROR, border: `1px solid ${ERROR}60` }
  :                        { background: 'transparent', color: '#fff', border: `1px solid ${BORDER_C}` }

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs uppercase
                 tracking-widest transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={style}
    >
      {children}
    </motion.button>
  )
}

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------

/**
 * One completed delivery inside a billing period.
 *
 * `billed_amount` is null whenever 8338 has not disclosed its figures — which,
 * for a monthly cut-off, is the norm until the client has submitted their own.
 * That is shown as an explicit "not disclosed" rather than a blank, so the
 * absence reads as deliberate rather than as missing data.
 */
function DeliveryRow({ delivery }: { delivery: PeriodDelivery }) {
  return (
    <div
      className="rounded-lg border p-3 flex flex-col gap-2"
      style={{ background: BG_CARD, borderColor: BORDER_C }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Hash size={12} style={{ color: CYAN }} className="shrink-0" />
          <span className="font-bold text-white text-sm tracking-wide truncate">
            {delivery.reference_number ?? delivery.booking_id.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: MUTED }}>
          <Calendar size={11} />
          <span>{formatDate(delivery.schedule_date)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {delivery.origin && (
          <div className="flex items-center gap-2 text-xs">
            <Truck size={11} style={{ color: CYAN }} className="shrink-0" />
            <span className="truncate text-white/70">{delivery.origin}</span>
          </div>
        )}
        {delivery.destinations.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs pl-0.5">
            <MapPin size={11} style={{ color: ERROR }} className="shrink-0" />
            <span className="truncate text-white/70">{d}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1.5 border-t" style={{ borderColor: BORDER }}>
        <span className="text-[11px]" style={{ color: MUTED }}>
          {delivery.truck_type_needed ?? '—'}
          {delivery.payment_terms ? ` · ${delivery.payment_terms} day terms` : ''}
        </span>
        {delivery.billed_amount !== null ? (
          <span className="text-sm font-bold text-white">{formatPeso(delivery.billed_amount)}</span>
        ) : (
          <span className="text-[11px] flex items-center gap-1" style={{ color: MUTED }}>
            <Lock size={10} /> not disclosed
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Period card
// ---------------------------------------------------------------------------

function PeriodCard({
  period,
  onOpen,
}: {
  period: BillingPeriod & { delivery_count?: number }
  onOpen: () => void
}) {
  const action = actionFor(period)
  const count = period.delivery_count ?? 0

  const cta =
    action === 'submit'    ? 'File Reverse Billing'
  : action === 'resubmit'  ? 'Correct & Resubmit'
  : action === 'review'    ? 'Review Summary'
  : 'View Details'

  return (
    <motion.div
      variants={fadeUp}
      layout
      className="rounded-xl border p-4 flex flex-col gap-3 transition-colors"
      style={{
        background: BG_PANEL,
        borderColor: action !== 'none' ? `${CYAN}40` : BORDER,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-bold text-white text-sm tracking-wide truncate">
            {periodLabel(period)}
          </span>
          <span className="text-xs" style={{ color: MUTED }}>
            {period.mode === 'monthly'
              ? `Monthly · cut-off ${period.cutoff_no ?? ''}`
              : 'Weekly billing'}
          </span>
        </div>
        <StatusBadge status={period.status} />
      </div>

      <div className="flex items-center justify-between gap-3 pt-1 border-t" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
          <Package size={11} />
          <span>{count} completed {count === 1 ? 'delivery' : 'deliveries'}</span>
        </div>
        {period.amounts_hidden ? (
          <span className="text-[11px] flex items-center gap-1" style={{ color: MUTED }}>
            <Lock size={10} /> not disclosed
          </span>
        ) : period.total_amount !== null ? (
          <span className="text-sm font-bold text-white">{formatPeso(period.total_amount)}</span>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
        {statusExplanation(period)}
      </p>

      <button
        onClick={onOpen}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold
                   uppercase tracking-widest transition-all cursor-pointer"
        style={
          action !== 'none'
            ? { background: `${CYAN}18`, border: `1px solid ${CYAN}50`, color: CYAN }
            : { background: 'transparent', border: `1px solid ${BORDER_C}`, color: MUTED }
        }
      >
        <FileText size={13} />{cta}
      </button>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Monthly: file a reverse billing
// ---------------------------------------------------------------------------

function SubmitBillingForm({
  detail,
  onDone,
}: {
  detail: BillingPeriodDetail
  onDone: () => void
}) {
  const today = new Date().toISOString().split('T')[0]

  const [amount, setAmount]     = useState('')
  const [refNo, setRefNo]       = useState('')
  const [date, setDate]         = useState(today)
  const [remarks, setRemarks]   = useState('')
  const [files, setFiles]       = useState<File[]>([])
  const [fileErr, setFileErr]   = useState<string | null>(null)
  const [touched, setTouched]   = useState(false)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy]         = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const amountNum = parseFloat(amount)
  const errors = {
    amount: !amount || isNaN(amountNum) || amountNum <= 0 ? 'Enter the total you are billing.' : undefined,
    date:   !date ? 'Billing date is required.' : undefined,
    files:  files.length === 0 ? 'Attach your billing summary document.' : undefined,
  }
  const hasErrors = Object.values(errors).some(Boolean)

  const addFiles = useCallback((incoming: File[]) => {
    setFileErr(null)
    const accepted = incoming.slice(0, MAX_FILES - files.length)
    if (!accepted.length) return
    for (const f of accepted) {
      const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '')
      if (!ALLOWED_EXTS.includes(ext)) { setFileErr(`"${f.name}" is not a supported type.`); return }
      if (f.size > MAX_FILE_BYTES)     { setFileErr(`"${f.name}" exceeds 10 MB.`); return }
    }
    setFiles((prev) => [...prev, ...accepted])
  }, [files.length])

  async function handleSubmit() {
    setTouched(true)
    if (hasErrors || busy) return

    setBusy(true)
    try {
      // Files go to Cloudinary first; the API only ever stores URLs.
      const { urls } = await uploadService.uploadBookingDocuments(files)
      await clientBillingService.submitBilling(detail.period_id, {
        submitted_amount: amountNum,
        client_billing_number: refNo || null,
        client_billing_date: date,
        remarks: remarks || null,
        document_urls: urls,
      })
      appToast.success('Reverse billing submitted for review.')
      onDone()
    } catch (err) {
      appToast.error(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const rejection = detail.submissions?.find(
    (s) => s.review_status === 'rejected' && s.origin === 'client',
  )

  return (
    <motion.div variants={slideIn} initial="hidden" animate="show" className="flex flex-col gap-4 pb-4">
      {rejection?.review_remarks && (
        <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
          style={{ background: `${ERROR}14`, border: `1px solid ${ERROR}30`, color: ERROR }}>
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold mb-0.5">8338 could not match your previous submission</p>
            <p>{rejection.review_remarks}</p>
          </div>
        </div>
      )}

      {/* What is being billed — scope only, no 8338 figures. */}
      <div className="rounded-xl border p-4 flex flex-col gap-3"
        style={{ background: BG_PANEL, borderColor: BORDER, borderTopWidth: 3, borderTopColor: CYAN }}>
        <SectionHeader icon={<Receipt size={15} />} title="Deliveries in this cut-off" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <InfoTile label="Period" value={periodLabel(detail)} />
          <InfoTile label="Deliveries" value={String(detail.deliveries.length)} />
          <InfoTile
            label="Submit by"
            value={detail.submission_end ? formatDate(detail.submission_end) : '—'}
            accent
          />
        </div>
        <div className="flex flex-col gap-2 mt-1">
          {detail.deliveries.map((d) => <DeliveryRow key={d.booking_id} delivery={d} />)}
        </div>
        <p className="text-[11px] leading-relaxed flex items-start gap-1.5" style={{ color: MUTED }}>
          <Lock size={11} className="mt-0.5 shrink-0" />
          8338&rsquo;s own figures stay sealed until you submit. They cross-check your total against
          their records, which only works if both sides compute it independently.
        </p>
      </div>

      {/* Your figures */}
      <div className="rounded-xl border p-4 flex flex-col gap-4" style={{ background: BG_PANEL, borderColor: BORDER }}>
        <SectionHeader icon={<FileText size={15} />} title="Your billing summary" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: MUTED }}>
              Total amount <span style={{ color: ERROR }}>*</span>
            </label>
            <TextField
              fullWidth type="number" placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><span style={{ color: MUTED }}>₱</span></InputAdornment> }}
              sx={fieldSx(BG_CARD, BORDER_C, touched && !!errors.amount)}
            />
            {touched && errors.amount && <span className="text-[11px]" style={{ color: ERROR }}>{errors.amount}</span>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: MUTED }}>Your billing no. <span style={{ color: MUTED }}>(optional)</span></label>
            <TextField
              fullWidth placeholder="e.g. RB-2026-0041"
              value={refNo} onChange={(e) => setRefNo(e.target.value)}
              sx={fieldSx(BG_CARD, BORDER_C)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: MUTED }}>
              Billing date <span style={{ color: ERROR }}>*</span>
            </label>
            <TextField
              fullWidth type="date"
              value={date} onChange={(e) => setDate(e.target.value)}
              sx={fieldSx(BG_CARD, BORDER_C, touched && !!errors.date)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: MUTED }}>Remarks <span style={{ color: MUTED }}>(optional)</span></label>
          <TextField
            fullWidth multiline rows={3}
            placeholder="Anything 8338 should know when checking these figures."
            value={remarks} onChange={(e) => setRemarks(e.target.value)}
            sx={textareaSx(BG_CARD, BORDER_C)}
          />
        </div>
      </div>

      {/* Attachments */}
      <div className="rounded-xl border p-4 flex flex-col gap-4" style={{ background: BG_PANEL, borderColor: BORDER }}>
        <SectionHeader icon={<Upload size={15} />} title="Supporting documents" />
        <p className="text-xs" style={{ color: MUTED }}>
          Attach your billing summary. PDF, DOCX, XLSX, JPG, PNG — max 10 MB each, up to {MAX_FILES} files.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)) }}
          onClick={() => { if (files.length < MAX_FILES) fileRef.current?.click() }}
          className="flex flex-col items-center gap-2 rounded-lg px-4 py-5 border border-dashed cursor-pointer transition-all"
          style={{
            background: BG_CARD,
            borderColor: dragging ? CYAN : (touched && errors.files && !fileErr) ? ERROR_B : '#818181',
            opacity: files.length >= MAX_FILES ? 0.5 : 1,
            pointerEvents: files.length >= MAX_FILES ? 'none' : 'auto',
          }}
        >
          <Upload size={22} style={{ color: dragging ? CYAN : 'rgba(255,255,255,0.35)' }} />
          <div className="flex items-center gap-1 text-sm">
            <span style={{ color: CYAN, textDecoration: 'underline', textUnderlineOffset: 3 }}>Click to browse</span>
            <span className="text-white/70">or drag and drop</span>
          </div>
          <input
            ref={fileRef} type="file" accept={ALLOWED_EXTS.join(',')} multiple className="sr-only"
            onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
          />
        </div>

        {fileErr && <p className="text-xs" style={{ color: ERROR }}>{fileErr}</p>}
        {touched && errors.files && !fileErr && (
          <p className="text-xs" style={{ color: ERROR }}>{errors.files}</p>
        )}

        <AnimatePresence>
          {files.map((f, i) => (
            <motion.div key={`${f.name}-${i}`}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center justify-between rounded-lg px-3 py-2 border"
              style={{ background: BG_CARD, borderColor: BORDER_C }}>
              <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                <FileText size={13} style={{ color: MUTED }} className="shrink-0" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-xs text-white/80 truncate">{f.name}</span>
                  <span className="text-[10px]" style={{ color: MUTED }}>{formatBytes(f.size)}</span>
                </div>
              </div>
              <button onClick={() => { setFiles((p) => p.filter((_, j) => j !== i)); setFileErr(null) }}
                className="hover:text-red-400 transition-colors cursor-pointer shrink-0">
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {files.length > 0 && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: MUTED }}>
            <Check size={11} style={{ color: CYAN }} />
            {files.length} file{files.length !== 1 ? 's' : ''} will be attached
          </p>
        )}
      </div>

      <div className="flex justify-between gap-3 pt-1">
        <WizBtn onClick={onDone} variant="back"><ChevronLeft size={15} /> Back</WizBtn>
        <WizBtn onClick={handleSubmit} variant="next" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit Billing'} <ChevronRight size={15} />
        </WizBtn>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Weekly: review 8338's summary
// ---------------------------------------------------------------------------

function ReviewSummaryPanel({
  detail,
  onDone,
}: {
  detail: BillingPeriodDetail
  onDone: () => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [remarks, setRemarks]     = useState('')
  const [busy, setBusy]           = useState(false)

  async function decide(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !remarks.trim()) {
      appToast.error('Tell 8338 what is wrong so they can correct it.')
      return
    }
    setBusy(true)
    try {
      await clientBillingService.reviewSummary(detail.period_id, decision, remarks || null)
      appToast.success(decision === 'approve' ? 'Summary approved.' : 'Summary sent back for revision.')
      onDone()
    } catch (err) {
      appToast.error(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div variants={slideIn} initial="hidden" animate="show" className="flex flex-col gap-4 pb-4">
      <div className="rounded-xl border p-4 flex flex-col gap-3"
        style={{ background: BG_PANEL, borderColor: BORDER, borderTopWidth: 3, borderTopColor: CYAN }}>
        <SectionHeader icon={<Receipt size={15} />} title="Billing summary from 8338" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InfoTile label="Period" value={periodLabel(detail)} />
          <InfoTile label="Deliveries" value={String(detail.deliveries.length)} />
          <InfoTile label="Review by" value={detail.review_due_on ? formatDate(detail.review_due_on) : '—'} />
          <InfoTile label="Total" value={formatPeso(detail.total_amount ?? 0)} accent />
        </div>
      </div>

      <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ background: BG_PANEL, borderColor: BORDER }}>
        <SectionHeader icon={<Package size={15} />} title="What is being billed" />
        <div className="flex flex-col gap-2">
          {detail.deliveries.map((d) => <DeliveryRow key={d.booking_id} delivery={d} />)}
        </div>
      </div>

      <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ background: BG_PANEL, borderColor: BORDER }}>
        <SectionHeader icon={<FileText size={15} />} title="Your decision" />
        <p className="text-xs" style={{ color: MUTED }}>
          Approve to let 8338 issue the Service Invoices, or reject with a reason so they can revise
          and resend.
        </p>

        {rejecting && (
          <TextField
            fullWidth multiline rows={3} autoFocus
            placeholder="What does not match your records?"
            value={remarks} onChange={(e) => setRemarks(e.target.value)}
            sx={textareaSx(BG_CARD, BORDER_C)}
          />
        )}

        <div className="flex flex-wrap justify-between gap-3 pt-1">
          <WizBtn onClick={onDone} variant="back"><ChevronLeft size={15} /> Back</WizBtn>
          <div className="flex gap-2">
            {rejecting ? (
              <>
                <WizBtn onClick={() => { setRejecting(false); setRemarks('') }} variant="back">Cancel</WizBtn>
                <WizBtn onClick={() => decide('reject')} variant="danger" disabled={busy}>
                  {busy ? 'Sending…' : 'Confirm Reject'}
                </WizBtn>
              </>
            ) : (
              <>
                <WizBtn onClick={() => setRejecting(true)} variant="danger" disabled={busy}>
                  <XCircle size={14} /> Reject
                </WizBtn>
                <WizBtn onClick={() => decide('approve')} variant="next" disabled={busy}>
                  <CheckCircle2 size={14} /> {busy ? 'Approving…' : 'Approve'}
                </WizBtn>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Read-only detail (no action available)
// ---------------------------------------------------------------------------

function PeriodDetailPanel({ detail, onDone }: { detail: BillingPeriodDetail; onDone: () => void }) {
  return (
    <motion.div variants={slideIn} initial="hidden" animate="show" className="flex flex-col gap-4 pb-4">
      <div className="rounded-xl border p-4 flex flex-col gap-3"
        style={{ background: BG_PANEL, borderColor: BORDER, borderTopWidth: 3, borderTopColor: CYAN }}>
        <div className="flex items-center justify-between gap-2">
          <SectionHeader icon={<Receipt size={15} />} title={periodLabel(detail)} />
          <StatusBadge status={detail.status} />
        </div>
        <p className="text-xs" style={{ color: MUTED }}>{statusExplanation(detail)}</p>
      </div>

      {!!detail.invoices?.length && (
        <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ background: BG_PANEL, borderColor: BORDER }}>
          <SectionHeader icon={<Receipt size={15} />} title="Service Invoices" />
          <p className="text-[11px]" style={{ color: MUTED }}>
            One invoice per delivery, each with its own payment term and due date. 8338 accepts
            payment on Fridays only.
          </p>
          {detail.invoices.map((inv) => (
            <div key={inv.invoice_id}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border"
              style={{ background: BG_CARD, borderColor: BORDER_C }}>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white font-mono">SI {inv.si_number}</span>
                <span className="text-[10px]" style={{ color: MUTED }}>
                  {inv.payment_terms_days}-day terms · due {formatDate(inv.due_date)}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-bold text-white">{formatPeso(inv.total_amount_due)}</span>
                {inv.pdf_url && (
                  <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                    style={{ color: CYAN }}>
                    <Download size={13} /> PDF
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ background: BG_PANEL, borderColor: BORDER }}>
        <SectionHeader icon={<Package size={15} />} title="Deliveries in this period" />
        {detail.deliveries.length === 0 ? (
          <p className="text-xs" style={{ color: MUTED }}>No completed deliveries fall in this period.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {detail.deliveries.map((d) => <DeliveryRow key={d.booking_id} delivery={d} />)}
          </div>
        )}
      </div>

      {!!detail.submissions?.length && (
        <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ background: BG_PANEL, borderColor: BORDER }}>
          <SectionHeader icon={<FileText size={15} />} title="History" />
          {detail.submissions.map((s) => (
            <div key={s.submission_id} className="flex items-start gap-2 text-xs border-b pb-2 last:border-0"
              style={{ borderColor: BORDER }}>
              <span className="font-mono shrink-0" style={{ color: MUTED }}>r{s.revision}</span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-white/80">
                  {s.origin === 'client' ? 'You submitted' : '8338 sent a summary'}
                  {s.submitted_amount !== null ? ` — ${formatPeso(s.submitted_amount)}` : ''}
                </span>
                {s.review_remarks && <span style={{ color: MUTED }}>{s.review_remarks}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-start pt-1">
        <WizBtn onClick={onDone} variant="back"><ChevronLeft size={15} /> Back</WizBtn>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------

type ListRow = BillingPeriod & { delivery_count?: number }

export default function ReverseBillingModule() {
  const [periods, setPeriods]   = useState<ListRow[]>([])
  const [detail, setDetail]     = useState<BillingPeriodDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [opening, setOpening]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [activeTab, setTab]     = useState<TabKey>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await clientBillingService.listPeriods({ limit: 60 })
      // A period covering no completed work is noise — the screen is about
      // deliveries that are done and ready to bill, not the calendar.
      setPeriods((rows as ListRow[]).filter((p) => (p.delivery_count ?? 0) > 0))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openPeriod = useCallback(async (periodId: string) => {
    setOpening(true)
    try {
      setDetail(await clientBillingService.getPeriod(periodId))
    } catch (err) {
      appToast.error(getApiErrorMessage(err))
    } finally {
      setOpening(false)
    }
  }, [])

  const closeDetail = useCallback(() => {
    setDetail(null)
    void load()
  }, [load])

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: periods.length, action: 0, waiting: 0, settled: 0 }
    for (const p of periods) c[tabOf(p)]++
    return c
  }, [periods])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return periods.filter((p) => {
      if (activeTab !== 'all' && tabOf(p) !== activeTab) return false
      if (!q) return true
      return periodLabel(p).toLowerCase().includes(q) || p.mode.includes(q) || p.status.includes(q)
    })
  }, [periods, search, activeTab])

  const action: PeriodAction = detail ? actionFor(detail) : 'none'

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG_PAGE, color: '#fff' }}>
      <div className="flex items-center gap-3 px-4 lg:px-6 py-4 border-b shrink-0" style={{ borderColor: BORDER }}>
        {detail && (
          <button
            onClick={closeDetail}
            className="flex items-center justify-center w-8 h-8 rounded-lg border transition-colors
                       hover:border-white/30 hover:text-white cursor-pointer"
            style={{ borderColor: BORDER_C, color: MUTED }}
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <Receipt size={18} style={{ color: CYAN }} />
          <h1 className="font-bold text-white text-base tracking-wide">
            {!detail ? 'Reverse Billing'
              : action === 'review' ? 'Review Billing Summary'
              : action === 'submit' || action === 'resubmit' ? 'File Reverse Billing'
              : 'Billing Period'}
          </h1>
        </div>
        {!detail && (
          <button
            onClick={() => void load()}
            className="ml-auto flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold
                       transition-colors hover:bg-white/5 cursor-pointer"
            style={{ borderColor: BORDER_C, color: 'rgba(255,255,255,0.8)' }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <AnimatePresence mode="wait">
          {detail ? (
            action === 'review' ? (
              <ReviewSummaryPanel key="review" detail={detail} onDone={closeDetail} />
            ) : action === 'submit' || action === 'resubmit' ? (
              <SubmitBillingForm key="submit" detail={detail} onDone={closeDetail} />
            ) : (
              <PeriodDetailPanel key="detail" detail={detail} onDone={closeDetail} />
            )
          ) : (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-4">

              <div className="flex flex-col gap-3">
                <TextField
                  fullWidth placeholder="Search by period, mode or status…"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start"><Search size={15} style={{ color: MUTED }} /></InputAdornment>
                    ),
                    endAdornment: search ? (
                      <InputAdornment position="end">
                        <button onClick={() => setSearch('')} className="cursor-pointer hover:text-white" style={{ color: MUTED }}>
                          <X size={14} />
                        </button>
                      </InputAdornment>
                    ) : null,
                  }}
                  sx={{
                    ...fieldSx(BG_PANEL, BORDER),
                    '& .MuiInputBase-input': { padding: '0 8px', height: 36, boxSizing: 'border-box' },
                  }}
                />

                <div className="flex items-center gap-0 border-b overflow-x-auto" style={{ borderColor: BORDER }}>
                  {TAB_FILTERS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className="flex items-center gap-1.5 pb-2 px-3 text-xs font-bold uppercase tracking-wider
                                 transition-colors whitespace-nowrap cursor-pointer"
                      style={activeTab === t.key
                        ? { color: '#fff', borderBottom: `2px solid ${CYAN}`, marginBottom: -1 }
                        : { color: MUTED }}
                    >
                      {t.label}
                      <span className="px-1.5 py-0.5 rounded-sm text-[10px]"
                        style={{
                          background: activeTab === t.key ? `${CYAN}22` : 'rgba(255,255,255,0.06)',
                          color: activeTab === t.key ? CYAN : MUTED,
                        }}>
                        {counts[t.key]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {loading || opening ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-xl border p-4 h-44 animate-pulse"
                      style={{ background: BG_PANEL, borderColor: BORDER }} />
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <AlertCircle size={32} style={{ color: ERROR }} />
                  <p className="text-sm" style={{ color: ERROR }}>{error}</p>
                  <WizBtn onClick={() => void load()} variant="back">Try again</WizBtn>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
                  <Inbox size={32} style={{ color: MUTED }} />
                  <p className="text-sm" style={{ color: MUTED }}>
                    {periods.length === 0
                      ? 'No completed deliveries are ready for billing yet.'
                      : 'No billing periods match this filter.'}
                  </p>
                  {periods.length === 0 && (
                    <p className="text-xs max-w-sm" style={{ color: MUTED }}>
                      Billing periods appear here once a delivery is completed. They become
                      actionable when the period closes and its window opens.
                    </p>
                  )}
                </div>
              ) : (
                <motion.div variants={stagger} initial="hidden" animate="show"
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filtered.map((p) => (
                    <PeriodCard key={p.period_id} period={p} onOpen={() => void openPeriod(p.period_id)} />
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
