'use client'

import { useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
  Receipt,
  Paperclip,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
} from 'lucide-react'
import ReusableModal from '@/components/layout/ReusableModal'
import { nowDate } from '@/app/utils/serverTime'


type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled' | 'under_review'
type BillingType   = 'reverse'

interface SubmittedFile {
  name:     string
  size:     string
  uploaded: string
}

interface BillingRecord {
  billing_id:     string
  booking_id:     string
  client_name:    string
  client_email:   string
  amount:         number
  status:         PaymentStatus
  billing_type:   BillingType
  invoice_number: string
  issued_date:    string
  due_date:       string
  paid_date?:     string
  remarks?:       string
  service_type:   string
  trips:          number
  files:          SubmittedFile[]
}

type ConfirmKind = 'approve' | 'reject' | 'generate' | null

export const MOCK_BILLING: BillingRecord[] = [
  {
    billing_id:     'BL-001',
    booking_id:     'BK-2026-0041',
    client_name:    'Airspeed Corp.',
    client_email:   'billing@airspeed.ph',
    amount:         18500,
    status:         'under_review',
    billing_type:   'reverse',
    invoice_number: 'INV-2026-00041',
    issued_date:    '2026-04-28',
    due_date:       '2026-05-12',
    service_type:   'FMCG',
    trips:          2,
    remarks:        'Client submitted billing summary for 2 completed FMCG trips.',
    files: [
      { name: 'Billing_Summary_Apr28.pdf', size: '284 KB', uploaded: '2026-04-28' },
      { name: 'DR_Trip01_Signed.jpg',      size: '1.2 MB', uploaded: '2026-04-28' },
      { name: 'DR_Trip02_Signed.jpg',      size: '1.1 MB', uploaded: '2026-04-28' },
      { name: 'Trip_Computation.xlsx',     size: '96 KB',  uploaded: '2026-04-29' },
    ],
  },
  {
    billing_id:     'BL-002',
    booking_id:     'BK-2026-0038',
    client_name:    'STA Warehouses Inc.',
    client_email:   'accounts@stawh.com',
    amount:         9200,
    status:         'paid',
    billing_type:   'reverse',
    invoice_number: 'INV-2026-00038',
    issued_date:    '2026-04-20',
    due_date:       '2026-05-05',
    paid_date:      '2026-05-02',
    service_type:   'E-Commerce',
    trips:          1,
    files: [
      { name: 'OR_INV-2026-00038.pdf',     size: '156 KB', uploaded: '2026-05-02' },
      { name: 'Payment_Confirmation.pdf',  size: '88 KB',  uploaded: '2026-05-02' },
    ],
  },
  {
    billing_id:     'BL-003',
    booking_id:     'BK-2026-0035',
    client_name:    'MTR Port Logistics',
    client_email:   'finance@mtrport.com',
    amount:         32400,
    status:         'overdue',
    billing_type:   'reverse',
    invoice_number: 'INV-2026-00035',
    issued_date:    '2026-04-10',
    due_date:       '2026-04-25',
    service_type:   'FMCG',
    trips:          4,
    files: [
      { name: 'INV-2026-00035.pdf',        size: '204 KB', uploaded: '2026-04-10' },
      { name: 'POD_Batch_FMCG_Apr.xlsx',   size: '140 KB', uploaded: '2026-04-10' },
    ],
  },
  {
    billing_id:     'BL-004',
    booking_id:     'BK-2026-0030',
    client_name:    'Greenfield Supply Co.',
    client_email:   'ops@greenfieldsupply.ph',
    amount:         7800,
    status:         'pending',
    billing_type:   'reverse',
    invoice_number: 'INV-2026-00030',
    issued_date:    '2026-05-01',
    due_date:       '2026-05-15',
    service_type:   'E-Commerce',
    trips:          1,
    files: [],
  },
  {
    billing_id:     'BL-005',
    booking_id:     'BK-2026-0027',
    client_name:    'Airspeed Corp.',
    client_email:   'billing@airspeed.ph',
    amount:         14600,
    status:         'paid',
    billing_type:   'reverse',
    invoice_number: 'INV-2026-00027',
    issued_date:    '2026-04-05',
    due_date:       '2026-04-20',
    paid_date:      '2026-04-18',
    service_type:   'FMCG',
    trips:          2,
    files: [
      { name: 'Billing_Summary_Mar31.pdf', size: '261 KB', uploaded: '2026-04-05' },
      { name: 'OR_INV-2026-00027.pdf',     size: '148 KB', uploaded: '2026-04-18' },
      { name: 'Signed_DR_Apr05.jpg',       size: '980 KB', uploaded: '2026-04-05' },
    ],
  },
]

const PAGE_SIZE = 8

function fmtCurrency(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function fileExt(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function fileIconConfig(name: string): { icon: React.ReactNode; bg: string; color: string } {
  const ext = fileExt(name)
  switch (ext) {
    case 'pdf':
      return { icon: <FileText size={13} />, bg: 'rgba(239,68,68,.18)', color: '#f87171' }
    case 'jpg':
    case 'jpeg':
    case 'png':
      return { icon: <FileImage size={13} />, bg: 'rgba(147,51,234,.18)', color: '#c084fc' }
    case 'xlsx':
    case 'xls':
      return { icon: <FileSpreadsheet size={13} />, bg: 'rgba(58,246,38,.15)', color: '#86efac' }
    case 'docx':
    case 'doc':
      return { icon: <FileText size={13} />, bg: 'rgba(77,249,237,.15)', color: '#4df9ed' }
    default:
      return { icon: <File size={13} />, bg: 'rgba(255,255,255,.08)', color: '#9ca3af' }
  }
}

function statusStyle(status: PaymentStatus): { bg: string; color: string; border: string; icon: React.ReactNode } {
  switch (status) {
    case 'paid':
      return { bg: 'rgba(58,246,38,0.1)',    color: '#86efac', border: 'rgba(58,246,38,0.3)',    icon: <CheckCircle2 size={12} /> }
    case 'pending':
      return { bg: 'rgba(77,249,237,0.1)',   color: '#4df9ed', border: 'rgba(77,249,237,0.3)',   icon: <Clock size={12} /> }
    case 'under_review':
      return { bg: 'rgba(246,159,38,0.1)',   color: '#fbbf24', border: 'rgba(246,159,38,0.3)',   icon: <Eye size={12} /> }
    case 'overdue':
      return { bg: 'rgba(239,68,68,0.1)',    color: '#f87171', border: 'rgba(239,68,68,0.3)',    icon: <AlertTriangle size={12} /> }
    case 'cancelled':
      return { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', border: 'rgba(107,114,128,0.3)', icon: <XCircle size={12} /> }
    default:
      return { bg: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: 'rgba(255,255,255,0.1)', icon: null }
  }
}

const STATUSES: PaymentStatus[] = ['pending', 'paid', 'overdue', 'under_review', 'cancelled']

function FileChip({ file }: { file: SubmittedFile }) {
  const fi = fileIconConfig(file.name)
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/[0.07] bg-black/20 hover:border-[rgba(77,249,237,0.3)] hover:bg-[rgba(77,249,237,0.05)] transition-all cursor-pointer group"
      title={`Uploaded ${fmtDate(file.uploaded)}`}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: fi.bg, color: fi.color }}
      >
        {fi.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white/85 truncate leading-tight">{file.name}</p>
        <p className="text-[10px] text-white/35 font-mono mt-0.5">{file.size} · {fmtDate(file.uploaded)}</p>
      </div>
      <Download size={12} className="text-white/30 group-hover:text-[#4df9ed] transition-colors shrink-0" />
    </div>
  )
}

function FileStackBadge({ files }: { files: SubmittedFile[] }) {
  if (files.length === 0) {
    return <span className="text-[10px] text-white/25 italic">None</span>
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {files.slice(0, 3).map((f, i) => {
          const fi = fileIconConfig(f.name)
          return (
            <div
              key={i}
              className="w-5 h-5 rounded-md flex items-center justify-center border border-black/50"
              style={{ background: fi.bg, color: fi.color, marginLeft: i > 0 ? '-5px' : 0, zIndex: 3 - i }}
            >
              <span style={{ fontSize: 8, fontWeight: 700, fontFamily: 'monospace' }}>
                {fileExt(f.name).toUpperCase().slice(0, 3)}
              </span>
            </div>
          )
        })}
      </div>
      <span className="text-[11px] text-white/50 font-semibold">
        {files.length} file{files.length > 1 ? 's' : ''}
      </span>
    </div>
  )
}

function BillingDetailPanel({
  record,
  onClose,
  onApprove,
  onReject,
  onGenerate,
}: {
  record: BillingRecord
  onClose: () => void
  onApprove: () => void
  onReject: () => void
  onGenerate: () => void
}) {
  const st = statusStyle(record.status)

  return (
    <motion.div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/65"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 14, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-none rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: 'var(--color-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.07]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                Reverse Billing
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide"
                style={{ color: st.color, borderColor: st.border, background: st.bg }}
              >
                {st.icon}
                {fmtLabel(record.status)}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white mt-1">{record.invoice_number}</h2>
            <p className="text-xs text-white/45 mt-0.5">{record.booking_id} · {record.service_type}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-white/50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-2">Client</p>
            <p className="text-sm font-semibold text-white">{record.client_name}</p>
            <p className="text-xs text-white/45 mt-0.5">{record.client_email}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-1">Total Amount</p>
              <p className="text-xl font-bold text-white tabular-nums">{fmtCurrency(record.amount)}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-1">Trips</p>
              <p className="text-xl font-bold text-white tabular-nums">{record.trips}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-1">Per Trip</p>
              <p className="text-xl font-bold text-white tabular-nums">{fmtCurrency(Math.round(record.amount / record.trips))}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Issued',    value: fmtDate(record.issued_date) },
              { label: 'Due Date',  value: fmtDate(record.due_date) },
              { label: 'Paid Date', value: record.paid_date ? fmtDate(record.paid_date) : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-1">{label}</p>
                <p className="text-sm font-semibold text-white/85">{value}</p>
              </div>
            ))}
          </div>

          {/* Remarks */}
          {record.remarks && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400/70 mb-1.5">Remarks</p>
              <p className="text-sm text-white/70 leading-relaxed">{record.remarks}</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35">Submitted Files</p>
                {record.files.length > 0 && (
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
                    style={{
                      color: '#4df9ed',
                      borderColor: 'rgba(77,249,237,.25)',
                      background: 'rgba(77,249,237,.1)',
                    }}
                  >
                    {record.files.length}
                  </span>
                )}
              </div>
              {record.files.length > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/50 hover:text-white/80 transition-colors"
                >
                  <Download size={11} />
                  Download All
                </button>
              )}
            </div>

            {record.files.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 flex flex-col items-center gap-2 text-center">
                <Paperclip size={22} className="text-white/20" />
                <p className="text-xs text-white/30">No files submitted by client</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {record.files.map((f, i) => (
                  <FileChip key={i} file={f} />
                ))}
              </div>
            )}
          </div>

          {record.status === 'under_review' && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-1.5">
                Rejection Remarks (optional)
              </p>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/80 placeholder:text-white/30 outline-none focus:border-[rgba(77,249,237,0.4)] resize-none"
                placeholder="Enter reason for rejection…"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-white/[0.07]">
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-white/70 hover:bg-white/5 transition-colors"
          >
            <Download size={14} />
            Export Invoice
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/5 transition-colors"
            >
              Close
            </button>
            {record.status === 'under_review' && (
              <>
                <button
                  type="button"
                  onClick={onReject}
                  className="px-4 py-2 rounded-lg border border-red-500/25 text-sm font-bold text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={onApprove}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-black transition-opacity hover:opacity-90"
                  style={{ background: 'var(--color-cyan)' }}
                >
                  Approve & Generate OR
                </button>
              </>
            )}
            {record.status === 'pending' && (
              <button
                type="button"
                onClick={onGenerate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-black transition-opacity hover:opacity-90"
                style={{ background: 'var(--color-cyan)' }}
              >
                <Receipt size={15} />
                Generate Official Receipt
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function SummaryCards({ records }: { records: BillingRecord[] }) {
  const countPaid    = records.filter((r) => r.status === 'paid').length
  const countPending = records.filter((r) => r.status === 'pending').length
  const countOverdue = records.filter((r) => r.status === 'overdue').length
  const countReview  = records.filter((r) => r.status === 'under_review').length

  const cards = [
    { label: 'Paid Invoices',   value: countPaid,    sub: 'payment confirmed',        color: '#86efac', border: 'rgba(58,246,38,0.2)',   bg: 'rgba(58,246,38,0.05)' },
    { label: 'Pending Payment', value: countPending, sub: 'awaiting settlement',      color: '#4df9ed', border: 'rgba(77,249,237,0.2)',  bg: 'rgba(77,249,237,0.05)' },
    { label: 'Overdue',         value: countOverdue, sub: 'past due date',            color: '#f87171', border: 'rgba(239,68,68,0.2)',   bg: 'rgba(239,68,68,0.05)' },
    { label: 'Under Review',    value: countReview,  sub: 'reverse billing requests', color: '#fbbf24', border: 'rgba(246,159,38,0.2)',  bg: 'rgba(246,159,38,0.05)' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border p-3 flex flex-col gap-1"
          style={{ border: `1px solid ${c.border}`, background: c.bg }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">{c.label}</p>
          <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: c.color }}>
            {c.value}
          </p>
          <p className="text-[10px] text-white/35">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

function buildConfirmConfig(
  kind: ConfirmKind,
  record: BillingRecord | null,
  busy: boolean,
): { title: string; description: string; confirmLabel: string; cancelLabel: string } | null {
  if (!kind || !record) return null

  if (kind === 'approve') return {
    title:        'Approve & Generate Official Receipt?',
    description:  `Generate an official receipt for ${record.invoice_number} — ${record.client_name} (${fmtCurrency(record.amount)}). This will mark the billing as Paid.`,
    confirmLabel: busy ? 'Processing…' : 'Approve',
    cancelLabel:  'Cancel',
  }
  if (kind === 'reject') return {
    title:        'Reject this billing request?',
    description:  `Rejection remarks will be sent to ${record.client_name}. The billing will be marked as Cancelled.`,
    confirmLabel: busy ? 'Rejecting…' : 'Reject',
    cancelLabel:  'Cancel',
  }
  if (kind === 'generate') return {
    title:        'Export Invoice?',
    description:  `Download the invoice PDF for ${record.invoice_number}.`,
    confirmLabel: busy ? 'Exporting…' : 'Export',
    cancelLabel:  'Cancel',
  }
  return null
}

export default function BillingManagementView() {
  const [records, setRecords]           = useState<BillingRecord[]>(MOCK_BILLING)
  const [search,  setSearch]            = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage]                 = useState(0)
  const [loading, setLoading]           = useState(false)

  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [confirmKind,    setConfirmKind]    = useState<ConfirmKind>(null)
  const [actionBusy,     setActionBusy]     = useState(false)

  const handleRefresh = useCallback(async () => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 700))
    setLoading(false)
  }, [])

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const q = search.trim().toLowerCase()
      if (q && ![r.client_name, r.invoice_number, r.booking_id, r.service_type].some((s) => s.toLowerCase().includes(q))) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      return true
    })
  }, [records, search, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe  = Math.min(page, pageCount - 1)
  const pageRows  = filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE)

  const handleAction = async () => {
    if (!selectedRecord || !confirmKind) return
    setActionBusy(true)
    await new Promise((r) => setTimeout(r, 800))

    if (confirmKind === 'approve') {
      setRecords((prev) =>
        prev.map((r) =>
          r.billing_id === selectedRecord.billing_id
            ? { ...r, status: 'paid', paid_date: nowDate().toISOString().split('T')[0] }
            : r
        )
      )
    } else if (confirmKind === 'reject') {
      setRecords((prev) =>
        prev.map((r) =>
          r.billing_id === selectedRecord.billing_id ? { ...r, status: 'cancelled' } : r
        )
      )
    }

    setActionBusy(false)
    setConfirmKind(null)
    setSelectedRecord(null)
  }

  const confirmConfig = buildConfirmConfig(confirmKind, selectedRecord, actionBusy)

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-body bg-[var(--color-bg)]">

      <header className="shrink-0 px-3 py-3 lg:px-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Billing & Payment Management</h1>
          <p className="text-xs text-white/45 mt-0.5 max-w-xl">
            Review billing requests, generate official receipts, and manage payment status for all client transactions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 transition-colors"
          >
            <Download size={14} />
            Export All
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 gap-3 overflow-hidden">

        <SummaryCards records={records} />

        <div className="flex flex-col xl:flex-row gap-2 xl:items-center shrink-0">
          <div
            className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-sm"
            style={{ background: '#2a2828' }}
          >
            <Search size={15} className="text-white/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Search client, invoice, booking…"
              className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-white/40 hover:text-white/70">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] uppercase tracking-wider text-white/35 self-center mr-1">Status</span>
            {(['all', ...STATUSES] as const).map((key) => {
              const active = statusFilter === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setStatusFilter(key); setPage(0) }}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                  style={{
                    background:  active ? 'rgba(77,249,237,0.12)' : 'transparent',
                    borderColor: active ? 'rgba(77,249,237,0.35)' : 'rgba(255,255,255,0.08)',
                    color:       active ? '#4df9ed' : '#888',
                  }}
                >
                  {key === 'all' ? 'All' : fmtLabel(key)}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <div
                className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--color-cyan)' }}
              />
              <p className="text-sm text-white/45">Loading billing records…</p>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12 text-center px-4">
              <CreditCard size={40} className="text-white/15" />
              <p className="text-sm text-white/45">No billing records match your filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-left text-sm border-collapse min-w-[900px]">
                  <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                    <tr className="text-[10px] uppercase tracking-wider text-white/40">
                      <th className="px-3 py-2.5 font-bold">Invoice</th>
                      <th className="px-3 py-2.5 font-bold">Client</th>
                      <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Due Date</th>
                      <th className="px-3 py-2.5 font-bold">Amount</th>
                      <th className="px-3 py-2.5 font-bold hidden sm:table-cell">Files</th>
                      <th className="px-3 py-2.5 font-bold">Status</th>
                      <th className="px-3 py-2.5 font-bold text-right w-[110px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => {
                      const st = statusStyle(r.status)
                      const isOverdue = r.status === 'overdue'
                      return (
                        <tr
                          key={r.billing_id}
                          className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors"
                        >
                          <td className="px-3 py-3 align-middle">
                            <p className="font-mono text-xs font-semibold text-white/90">{r.invoice_number}</p>
                            <p className="text-[10px] text-white/40 mt-0.5">{r.booking_id} · {r.service_type}</p>
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <p className="text-sm font-semibold text-white truncate max-w-[160px]">{r.client_name}</p>
                            <p className="text-[10px] text-white/40 truncate max-w-[160px]">{r.client_email}</p>
                          </td>
                          <td className="px-3 py-3 align-middle hidden lg:table-cell">
                            <span className={`text-xs tabular-nums ${isOverdue ? 'text-red-400 font-semibold' : 'text-white/60'}`}>
                              {fmtDate(r.due_date)}
                            </span>
                            {isOverdue && <p className="text-[10px] text-red-400/70 mt-0.5">Past due</p>}
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <span className="font-mono text-sm font-bold text-white tabular-nums">{fmtCurrency(r.amount)}</span>
                            <p className="text-[10px] text-white/40 mt-0.5">{r.trips} trip{r.trips > 1 ? 's' : ''}</p>
                          </td>
                          <td className="px-3 py-3 align-middle hidden sm:table-cell">
                            <button
                              type="button"
                              className="cursor-pointer"
                              onClick={() => setSelectedRecord(r)}
                            >
                              <FileStackBadge files={r.files} />
                            </button>
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                              style={{ color: st.color, borderColor: st.border, background: st.bg }}
                            >
                              {st.icon}
                              {fmtLabel(r.status)}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-middle text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedRecord(r)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-semibold text-white/70 hover:bg-white/5 transition-colors"
                            >
                              <Eye size={13} />
                              View
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-white/[0.07] text-xs text-white/50">
                <span>
                  {filtered.length === 0
                    ? '0'
                    : `${pageSafe * PAGE_SIZE + 1}–${Math.min((pageSafe + 1) * PAGE_SIZE, filtered.length)}`
                  }{' '}
                  of {filtered.length} records
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pageSafe <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="p-1.5 rounded-md border border-white/10 disabled:opacity-30 hover:bg-white/5 transition-colors"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="px-2 tabular-nums">{pageSafe + 1} / {pageCount}</span>
                  <button
                    type="button"
                    disabled={pageSafe >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    className="p-1.5 rounded-md border border-white/10 disabled:opacity-30 hover:bg-white/5 transition-colors"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedRecord && !confirmKind && (
          <BillingDetailPanel
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
            onApprove={() => setConfirmKind('approve')}
            onReject={() => setConfirmKind('reject')}
            onGenerate={() => setConfirmKind('generate')}
          />
        )}
      </AnimatePresence>

      {confirmConfig && (
        <ReusableModal
          open={!!confirmKind}
          title={confirmConfig.title}
          description={confirmConfig.description}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={confirmConfig.cancelLabel}
          onConfirm={handleAction}
          onCancel={() => { if (!actionBusy) setConfirmKind(null) }}
          disableBackdropClose={actionBusy}
        />
      )}
    </div>
  )
}