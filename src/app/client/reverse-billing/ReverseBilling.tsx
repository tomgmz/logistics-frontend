'use client'

import { motion, Variants, AnimatePresence } from 'framer-motion'
import { useState, useRef, useCallback } from 'react'
import {
  FileText, Search, ChevronRight, ChevronLeft,
  MapPin, Truck, Package, Calendar, Hash,
  Plus, X, Check, Upload, Download, AlertCircle,
  Clock, CheckCircle2, XCircle, Receipt,
} from 'lucide-react'

import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import FormHelperText from '@mui/material/FormHelperText'
import { SxProps, Theme } from '@mui/material/styles'

const BG_PAGE   = '#0a0a0a'
const BG_PANEL  = '#2A2828'
const BG_CARD   = '#424242'
const BORDER    = 'rgba(255,255,255,0.07)'
const BORDER_C  = 'rgba(255,255,255,0.12)'
const CYAN      = '#4DF9ED'
const MUTED     = '#818181'
const ERROR     = '#f87171'
const ERROR_B   = `${ERROR}99`
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
      color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
      padding: 0,
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

const HELPER_SX: SxProps<Theme> = {
  color: ERROR, fontSize: '0.7rem', marginTop: '3px',
  marginLeft: '2px', fontFamily: 'inherit', lineHeight: 1.3,
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

type BillingStatus = 'not_filed' | 'pending' | 'approved' | 'rejected'

interface CompletedDelivery {
  id: string
  bookingRef: string
  pickup: string
  dropoffs: string[]
  completedDate: string
  cargoSummary: string
  baseAmount: number
  billingStatus: BillingStatus
  rejectionRemark?: string
}

interface BillingLineItem {
  id: string
  description: string
  amount: string
}

interface BillingFormState {
  billingDate: string
  billingNumber: string
  lineItems: BillingLineItem[]
  remarks: string
}

interface BillingFormErrors {
  billingDate?: string
  billingNumber?: string
  lineItems?: Record<string, { description?: string; amount?: string }>
  remarks?: string
  attachments?: string
}

const MOCK_DELIVERIES: CompletedDelivery[] = [
  {
    id: 'del-001',
    bookingRef: 'BK-2025-0042',
    pickup: 'Parañaque City Distribution Hub',
    dropoffs: ['Makati CBD Warehouse', 'BGC Logistics Center'],
    completedDate: '2025-04-28',
    cargoSummary: '3 pallets · 450 KG · 2.40 CBM',
    baseAmount: 18500,
    billingStatus: 'not_filed',
  },
  {
    id: 'del-002',
    bookingRef: 'BK-2025-0039',
    pickup: 'Parañaque City Distribution Hub',
    dropoffs: ['Pasay Cold Storage Facility'],
    completedDate: '2025-04-25',
    cargoSummary: '12 pieces · 180 KG · 1.10 CBM',
    baseAmount: 9200,
    billingStatus: 'pending',
  },
  {
    id: 'del-003',
    bookingRef: 'BK-2025-0031',
    pickup: 'Parañaque City Distribution Hub',
    dropoffs: ['Quezon City Depot'],
    completedDate: '2025-04-18',
    cargoSummary: '6 pallets · 720 KG · 3.60 CBM',
    baseAmount: 24800,
    billingStatus: 'approved',
  },
  {
    id: 'del-004',
    bookingRef: 'BK-2025-0027',
    pickup: 'Parañaque City Distribution Hub',
    dropoffs: ['Manila Port Area', 'Taguig Industrial Zone', 'Muntinlupa Depot'],
    completedDate: '2025-04-12',
    cargoSummary: '8 pieces · 210 KG · 1.85 CBM',
    baseAmount: 14600,
    billingStatus: 'rejected',
    rejectionRemark: 'Billing amount discrepancy detected. Please re-check line item #2 and resubmit.',
  },
  {
    id: 'del-005',
    bookingRef: 'BK-2025-0019',
    pickup: 'Parañaque City Distribution Hub',
    dropoffs: ['Las Piñas Warehouse'],
    completedDate: '2025-04-05',
    cargoSummary: '4 pallets · 390 KG · 2.10 CBM',
    baseAmount: 11400,
    billingStatus: 'not_filed',
  },
]

function makeLine(): BillingLineItem {
  return { id: crypto.randomUUID(), description: '', amount: '' }
}

const STATUS_META: Record<BillingStatus, { label: string; color: string; icon: React.ReactNode }> = {
  not_filed: { label: 'Not Filed',  color: MUTED,    icon: <Clock      size={12} /> },
  pending:   { label: 'Pending',    color: '#FBBF24', icon: <Clock      size={12} /> },
  approved:  { label: 'Approved',   color: CYAN,      icon: <CheckCircle2 size={12} /> },
  rejected:  { label: 'Rejected',   color: ERROR,     icon: <XCircle    size={12} /> },
}

const TAB_FILTERS: { key: BillingStatus | 'all'; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'not_filed', label: 'Not Filed' },
  { key: 'pending',   label: 'Pending' },
  { key: 'approved',  label: 'Approved' },
  { key: 'rejected',  label: 'Rejected' },
]

const MAX_FILES        = 3
const MAX_FILE_BYTES   = 10 * 1024 * 1024
const ALLOWED_EXTS     = ['.pdf', '.docx', '.xlsx', '.jpg', '.png']

function formatBytes(b: number) {
  if (b < 1024)        return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatPeso(n: number) {
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white">{icon}</span>
      <h3 className="font-body text-white font-bold tracking-wide text-sm">{title}</h3>
    </div>
  )
}

function StatusBadge({ status }: { status: BillingStatus }) {
  const m = STATUS_META[status]
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm"
      style={{ color: m.color, background: `${m.color}18`, border: `1px solid ${m.color}40` }}
    >
      {m.icon}{m.label}
    </span>
  )
}

function DeliveryCard({
  delivery,
  onSelect,
}: {
  delivery: CompletedDelivery
  onSelect: () => void
}) {
  const canFile = delivery.billingStatus === 'not_filed' || delivery.billingStatus === 'rejected'
  return (
    <motion.div
      variants={fadeUp}
      layout
      className="rounded-xl border p-4 flex flex-col gap-3 transition-colors"
      style={{ background: BG_PANEL, borderColor: BORDER }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Hash size={12} style={{ color: CYAN }} />
            <span className="font-bold text-white text-sm tracking-wide">{delivery.bookingRef}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
            <Calendar size={11} />
            <span>Completed {formatDate(delivery.completedDate)}</span>
          </div>
        </div>
        <StatusBadge status={delivery.billingStatus} />
      </div>

      {/* Route */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Truck size={11} style={{ color: CYAN }} />
          <span className="truncate text-white/70">{delivery.pickup}</span>
        </div>
        {delivery.dropoffs.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs pl-0.5" style={{ color: MUTED }}>
            <MapPin size={11} style={{ color: ERROR }} />
            <span className="truncate text-white/70">{d}</span>
          </div>
        ))}
      </div>

      {/* Cargo + amount row */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
          <Package size={11} />
          <span>{delivery.cargoSummary}</span>
        </div>
        <span className="text-sm font-bold text-white">{formatPeso(delivery.baseAmount)}</span>
      </div>

      {/* Rejection remark */}
      {delivery.billingStatus === 'rejected' && delivery.rejectionRemark && (
        <div className="flex items-start gap-2 rounded-md px-3 py-2 text-xs"
          style={{ background: `${ERROR}14`, border: `1px solid ${ERROR}30`, color: ERROR }}>
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{delivery.rejectionRemark}</span>
        </div>
      )}

      {/* Action */}
      <button
        onClick={onSelect}
        disabled={!canFile && delivery.billingStatus !== 'approved'}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold
                   uppercase tracking-widest transition-all cursor-pointer disabled:opacity-30
                   disabled:cursor-not-allowed"
        style={
          canFile
            ? { background: `${CYAN}18`, border: `1px solid ${CYAN}50`, color: CYAN }
            : delivery.billingStatus === 'approved'
            ? { background: `${CYAN}18`, border: `1px solid ${CYAN}50`, color: CYAN }
            : { background: 'transparent', border: `1px solid ${BORDER_C}`, color: MUTED }
        }
      >
        {canFile ? (
          <><FileText size={13} />{delivery.billingStatus === 'rejected' ? 'Refile Billing' : 'File Billing'}</>
        ) : delivery.billingStatus === 'approved' ? (
          <><Download size={13} />Download Invoice</>
        ) : (
          <><Clock size={13} />Awaiting Review</>
        )}
      </button>
    </motion.div>
  )
}

function BillingForm({
  delivery,
  onBack,
  onSubmit,
}: {
  delivery: CompletedDelivery
  onBack: () => void
  onSubmit: () => void
}) {
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState<BillingFormState>({
    billingDate:   today,
    billingNumber: '',
    lineItems:     [{ id: crypto.randomUUID(), description: 'Freight Charge', amount: String(delivery.baseAmount) }],
    remarks:       '',
  })
  const [files,    setFiles]    = useState<File[]>([])
  const [fileErr,  setFileErr]  = useState<string | null>(null)
  const [touched,  setTouched]  = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  function validate(): BillingFormErrors {
    const errs: BillingFormErrors = {}
    if (!form.billingDate)   errs.billingDate   = 'Billing date is required.'
    if (!form.billingNumber) errs.billingNumber = 'Billing number is required.'
    const lineErrs: Record<string, { description?: string; amount?: string }> = {}
    form.lineItems.forEach((li) => {
      const e: { description?: string; amount?: string } = {}
      if (!li.description.trim()) e.description = 'Description is required.'
      const amt = parseFloat(li.amount)
      if (!li.amount || isNaN(amt) || amt <= 0) e.amount = 'Enter a valid amount.'
      if (Object.keys(e).length) lineErrs[li.id] = e
    })
    if (Object.keys(lineErrs).length) errs.lineItems = lineErrs
    if (files.length === 0) errs.attachments = 'At least one supporting document is required.'
    return errs
  }

  const errors = touched ? validate() : {}
  const hasErrors = Object.keys(validate()).length > 0

  function addLine() {
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, makeLine()] }))
  }
  function removeLine(id: string) {
    setForm((f) => ({ ...f, lineItems: f.lineItems.filter((l) => l.id !== id) }))
  }
  function updateLine(id: string, patch: Partial<BillingLineItem>) {
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((l) => l.id === id ? { ...l, ...patch } : l),
    }))
  }

  const totalAmount = form.lineItems.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  const addFiles = useCallback((incoming: File[]) => {
    setFileErr(null)
    const slots    = MAX_FILES - files.length
    const accepted = incoming.slice(0, slots)
    if (!accepted.length) return
    for (const f of accepted) {
      const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '')
      if (!ALLOWED_EXTS.includes(ext)) { setFileErr(`"${f.name}" is not a supported type.`); return }
      if (f.size > MAX_FILE_BYTES)     { setFileErr(`"${f.name}" exceeds 10 MB.`); return }
    }
    setFiles((prev) => [...prev, ...accepted])
  }, [files.length])

  function handleSubmit() {
    setTouched(true)
    if (hasErrors) return
    onSubmit()
  }

  return (
    <motion.div
      key="billing-form"
      variants={slideIn}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-4 pb-4"
    >
      {/* Delivery summary banner */}
      <div
        className="rounded-xl border p-4 flex flex-col gap-2"
        style={{ background: BG_PANEL, borderColor: BORDER, borderTopWidth: 3, borderTopColor: CYAN }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Receipt size={15} style={{ color: CYAN }} />
          <span className="text-white font-bold text-sm tracking-wide">Delivery Reference</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InfoTile label="Booking Ref"    value={delivery.bookingRef}             />
          <InfoTile label="Completed"      value={formatDate(delivery.completedDate)} />
          <InfoTile label="Cargo"          value={delivery.cargoSummary}           />
          <InfoTile label="Service Amount" value={formatPeso(delivery.baseAmount)} accent />
        </div>
        <div className="flex flex-col gap-1 mt-1 pt-2 border-t" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
            <Truck size={11} style={{ color: CYAN }} />
            <span className="text-white/70">{delivery.pickup}</span>
          </div>
          {delivery.dropoffs.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs pl-0.5">
              <MapPin size={11} style={{ color: ERROR }} />
              <span className="text-white/70">{d}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 
      
      
      
      BILLING DETAILS HEREEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE
      
      
      
      */}

      {/* Supporting Documents */}
      <div
        className="rounded-xl border p-4 flex flex-col gap-4"
        style={{ background: BG_PANEL, borderColor: BORDER }}
      >
        <SectionHeader icon={<Upload size={15} />} title="Supporting Documents" />
        <p className="text-xs" style={{ color: MUTED }}>
          Attach supporting files for your billing request. Accepted formats: PDF, DOCX, XLSX, JPG, PNG — max 10 MB each, up to 3 files.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)) }}
          onClick={() => { if (files.length < MAX_FILES) fileRef.current?.click() }}
          className="flex flex-col items-center gap-2 rounded-lg px-4 py-5 border border-dashed cursor-pointer transition-all"
          style={{
            background:    BG_CARD,
            borderColor:   dragging ? CYAN : (touched && !!errors.attachments && !fileErr) ? ERROR_B : '#818181',
            opacity:       files.length >= MAX_FILES ? 0.5 : 1,
            pointerEvents: files.length >= MAX_FILES ? 'none' : 'auto',
          }}
        >
          <Upload size={22} style={{ color: dragging ? CYAN : 'rgba(255,255,255,0.35)' }} />
          <div className="flex items-center gap-1 text-sm">
            <span style={{ color: CYAN, textDecoration: 'underline', textUnderlineOffset: 3 }} className="text-sm">
              Click to browse
            </span>
            <span className="text-white/70 text-sm">or drag and drop</span>
          </div>
          <p className="text-xs text-center" style={{ color: MUTED }}>
            PDF, DOCX, XLSX, JPG, PNG · max 10 MB · up to 3 files
          </p>
          <input
            ref={fileRef} type="file"
            accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
            multiple className="sr-only"
            onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
          />
        </div>

        {fileErr && <p className="text-xs text-red-400">{fileErr}</p>}
        {touched && errors.attachments && !fileErr && (
          <p className="text-xs text-red-400">{errors.attachments}</p>
        )}
        {files.length >= MAX_FILES && (
          <p className="text-xs text-center" style={{ color: MUTED }}>Maximum of {MAX_FILES} files reached.</p>
        )}

        <AnimatePresence>
          {files.map((f, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between rounded-lg px-3 py-2 border"
              style={{ background: BG_CARD, borderColor: BORDER_C }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                <FileText size={13} style={{ color: MUTED }} className="shrink-0" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-xs text-white/80 truncate">{f.name}</span>
                  <span className="text-[10px]" style={{ color: MUTED }}>{formatBytes(f.size)} · queued</span>
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
            {files.length} file{files.length !== 1 ? 's' : ''} will be attached to your billing request
          </p>
        )}
      </div>

      {/* Remarks */}
      <div
        className="rounded-xl border p-4 flex flex-col gap-3"
        style={{ background: BG_PANEL, borderColor: BORDER }}
      >
        <SectionHeader icon={<FileText size={15} />} title="Remarks" />
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: MUTED }}>
            Additional notes or billing context <span style={{ color: MUTED }}>(optional)</span>
          </label>
          <TextField
            fullWidth multiline rows={3}
            placeholder="e.g. This billing covers the April 28 delivery run including surcharges for fuel adjustment."
            value={form.remarks}
            onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            variant="outlined"
            sx={textareaSx(BG_CARD, BORDER_C)}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-between gap-3 pt-1">
        <WizBtn onClick={onBack} variant="back">
          <ChevronLeft size={15} /> BACK
        </WizBtn>
        <WizBtn onClick={handleSubmit} variant="next">
          SUBMIT BILLING <ChevronRight size={15} />
        </WizBtn>
      </div>
    </motion.div>
  )
}

function SuccessView({
  delivery,
  onDone,
}: {
  delivery: CompletedDelivery
  onDone: () => void
}) {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.4 } }}
      className="flex flex-col items-center gap-6 py-12 px-4"
    >
      {/* Icon */}
      <div className="relative flex items-center justify-center w-20 h-20 rounded-full"
        style={{ background: `${CYAN}14`, border: `2px solid ${CYAN}40` }}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1, transition: { delay: 0.15, type: 'spring', stiffness: 200 } }}
        >
          <CheckCircle2 size={36} style={{ color: CYAN }} />
        </motion.div>
      </div>

      <div className="flex flex-col items-center gap-2 text-center max-w-sm">
        <h2 className="text-xl font-bold text-white tracking-wide">Billing Request Submitted</h2>
        <p className="text-sm" style={{ color: MUTED }}>
          Your billing request for <span className="text-white font-semibold">{delivery.bookingRef}</span> has been
          submitted and is now under review by the Accounting Personnel.
        </p>
      </div>

      {/* Status card */}
      <div
        className="w-full max-w-sm rounded-xl border p-4 flex flex-col gap-3"
        style={{ background: BG_PANEL, borderColor: BORDER }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>Status</span>
          <StatusBadge status="pending" />
        </div>
        <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: BORDER }}>
          <span className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>Reference</span>
          <span className="text-sm text-white font-mono">{delivery.bookingRef}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: BORDER }}>
          <span className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>Next Step</span>
          <span className="text-xs text-white/70">Awaiting AP review</span>
        </div>
      </div>

      <p className="text-xs text-center max-w-xs" style={{ color: MUTED }}>
        Once the Accounting Personnel approves your billing request, the system will generate your invoice and notify you to download it.
      </p>

      <WizBtn onClick={onDone} variant="next">
        BACK TO DELIVERIES
      </WizBtn>
    </motion.div>
  )
}

function ApprovedView({
  delivery,
  onBack,
}: {
  delivery: CompletedDelivery
  onBack: () => void
}) {
  return (
    <motion.div
      key="approved"
      variants={slideIn} initial="hidden" animate="show"
      className="flex flex-col items-center gap-6 py-12 px-4"
    >
      <div className="relative flex items-center justify-center w-20 h-20 rounded-full"
        style={{ background: `${CYAN}14`, border: `2px solid ${CYAN}40` }}>
        <Download size={34} style={{ color: CYAN }} />
      </div>

      <div className="flex flex-col items-center gap-2 text-center max-w-sm">
        <h2 className="text-xl font-bold text-white tracking-wide">Invoice Ready</h2>
        <p className="text-sm" style={{ color: MUTED }}>
          Your billing for <span className="text-white font-semibold">{delivery.bookingRef}</span> has been approved.
          You can download the official invoice below.
        </p>
      </div>

      <div
        className="w-full max-w-sm rounded-xl border p-4 flex flex-col gap-3"
        style={{ background: BG_PANEL, borderColor: BORDER }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>Status</span>
          <StatusBadge status="approved" />
        </div>
        <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: BORDER }}>
          <span className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>Booking Ref</span>
          <span className="text-sm text-white font-mono">{delivery.bookingRef}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: BORDER }}>
          <span className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>Service Amount</span>
          <span className="text-sm font-bold" style={{ color: CYAN }}>{formatPeso(delivery.baseAmount)}</span>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-sm cursor-pointer"
        style={{ background: CYAN, color: '#0a0a0a' }}
        onClick={() => alert('Invoice download triggered (connect to actual endpoint).')}
      >
        <Download size={16} /> Download Invoice
      </motion.button>

      <button onClick={onBack}
        className="text-xs uppercase tracking-widest cursor-pointer hover:text-white transition-colors"
        style={{ color: MUTED }}>
        ← Back to deliveries
      </button>
    </motion.div>
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

function Req() {
  return <span style={{ color: ERROR, marginLeft: 2 }}>*</span>
}

function WizBtn({
  onClick, variant, children, disabled,
}: {
  onClick: () => void
  variant: 'next' | 'back'
  children: React.ReactNode
  disabled?: boolean
}) {
  const isNext = variant === 'next'
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs uppercase
                 tracking-widest transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={
        isNext
          ? { background: CYAN,        color: '#0a0a0a' }
          : { background: 'transparent', color: '#fff', border: `1px solid ${BORDER_C}` }
      }
    >
      {children}
    </motion.button>
  )
}

type View = 'list' | 'form' | 'success' | 'approved'

export default function ReverseBillingModule() {
  const [deliveries, setDeliveries] = useState<CompletedDelivery[]>(MOCK_DELIVERIES)
  const [view,       setView]       = useState<View>('list')
  const [selected,   setSelected]   = useState<CompletedDelivery | null>(null)
  const [search,     setSearch]     = useState('')
  const [activeTab,  setActiveTab]  = useState<BillingStatus | 'all'>('all')

  const filtered = deliveries.filter((d) => {
    const matchesTab = activeTab === 'all' || d.billingStatus === activeTab
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      d.bookingRef.toLowerCase().includes(q) ||
      d.pickup.toLowerCase().includes(q) ||
      d.dropoffs.some((x) => x.toLowerCase().includes(q))
    return matchesTab && matchesSearch
  })

  function handleSelect(delivery: CompletedDelivery) {
    setSelected(delivery)
    if (delivery.billingStatus === 'approved') {
      setView('approved')
    } else {
      setView('form')
    }
  }

  function handleSubmit() {
    if (selected) {
      setDeliveries((prev) =>
        prev.map((d) => d.id === selected.id ? { ...d, billingStatus: 'pending' } : d)
      )
    }
    setView('success')
  }

  function handleDone() {
    setSelected(null)
    setView('list')
  }

  const counts: Record<BillingStatus | 'all', number> = {
    all:       deliveries.length,
    not_filed: deliveries.filter((d) => d.billingStatus === 'not_filed').length,
    pending:   deliveries.filter((d) => d.billingStatus === 'pending').length,
    approved:  deliveries.filter((d) => d.billingStatus === 'approved').length,
    rejected:  deliveries.filter((d) => d.billingStatus === 'rejected').length,
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: BG_PAGE, color: '#fff' }}
    >
      <div
        className="flex items-center gap-3 px-4 lg:px-6 py-4 border-b shrink-0"
        style={{ borderColor: BORDER }}
      >
        {(view === 'form' || view === 'approved') && (
          <button
            onClick={handleDone}
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
            {view === 'list'     ? 'Reverse Billing'           : null}
            {view === 'form'     ? 'File Billing Request'      : null}
            {view === 'success'  ? 'Billing Submitted'         : null}
            {view === 'approved' ? 'Download Invoice'          : null}
          </h1>
        </div>
        {view === 'list' && selected && (
          <span className="text-xs ml-auto" style={{ color: MUTED }}>
            {selected.bookingRef}
          </span>
        )}
        {view === 'list' && (
          <span className="ml-auto text-xs uppercase tracking-widest font-bold px-2 py-0.5 rounded"
            style={{ background: `${CYAN}18`, color: CYAN }}>
            {deliveries.length} deliveries
          </span>
        )}
      </div>

      {(view === 'form' || view === 'success') && selected && (
        <div className="flex items-center gap-1.5 px-4 lg:px-6 py-2 text-xs border-b shrink-0"
          style={{ borderColor: BORDER, color: MUTED }}>
          <button onClick={handleDone} className="hover:text-white transition-colors cursor-pointer">
            Completed Deliveries
          </button>
          <ChevronRight size={11} />
          <span className="text-white/70">{selected.bookingRef}</span>
          {view === 'form' && (
            <>
              <ChevronRight size={11} />
              <span style={{ color: CYAN }}>File Billing</span>
            </>
          )}
          {view === 'success' && (
            <>
              <ChevronRight size={11} />
              <span style={{ color: CYAN }}>Submitted</span>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <AnimatePresence mode="wait">

          {/* LIST VIEW */}
          {view === 'list' && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-4">

              {/* Search filter */}
              <div className="flex flex-col gap-3">
                <TextField
                  fullWidth placeholder="Search by booking reference or location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  variant="outlined"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search size={15} style={{ color: MUTED }} />
                      </InputAdornment>
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
                    '& .MuiInputBase-input': {
                      padding: '0 8px', height: 36, boxSizing: 'border-box',
                      '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
                    },
                  }}
                />

                {/* Tab bar */}
                <div className="flex items-center gap-0 border-b overflow-x-auto" style={{ borderColor: BORDER }}>
                  {TAB_FILTERS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setActiveTab(t.key)}
                      className="flex items-center gap-1.5 pb-2 px-3 text-xs font-bold uppercase tracking-wider
                                 transition-colors whitespace-nowrap cursor-pointer"
                      style={
                        activeTab === t.key
                          ? { color: '#fff', borderBottom: `2px solid ${CYAN}`, marginBottom: -1 }
                          : { color: MUTED }
                      }
                    >
                      {t.label}
                      <span
                        className="px-1.5 py-0.5 rounded-sm text-[10px]"
                        style={{
                          background: activeTab === t.key ? `${CYAN}22` : 'rgba(255,255,255,0.06)',
                          color:      activeTab === t.key ? CYAN : MUTED,
                        }}
                      >
                        {counts[t.key]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cards grid */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <Package size={32} style={{ color: MUTED }} />
                  <p className="text-sm" style={{ color: MUTED }}>No deliveries found.</p>
                </div>
              ) : (
                <motion.div
                  variants={stagger} initial="hidden" animate="show"
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
                >
                  {filtered.map((d) => (
                    <DeliveryCard key={d.id} delivery={d} onSelect={() => handleSelect(d)} />
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* FORM VIEW */}
          {view === 'form' && selected && (
            <BillingForm
              key="form"
              delivery={selected}
              onBack={handleDone}
              onSubmit={handleSubmit}
            />
          )}

          {/* SUCCESS VIEW */}
          {view === 'success' && selected && (
            <SuccessView key="success" delivery={selected} onDone={handleDone} />
          )}

          {/* APPROVED DOWNLOAD VIEW */}
          {view === 'approved' && selected && (
            <ApprovedView key="approved" delivery={selected} onBack={handleDone} />
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}