'use client'

import { useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Wallet,
  TrendingUp,
  TrendingDown,
  Fuel,
  Wrench,
  Users,
  Package,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Paperclip,
} from 'lucide-react'
import ReusableModal from '@/components/layout/ReusableModal'

type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'under_review'
type ExpenseCategory = 'fuel' | 'maintenance' | 'salary' | 'supplies' | 'toll' | 'insurance' | 'other'

interface ExpenseFile {
  name: string
  size: string
  uploaded: string
}

interface ExpenseRecord {
  expense_id: string
  title: string
  category: ExpenseCategory
  amount: number
  status: ExpenseStatus
  submitted_by: string
  department: string
  date: string
  approved_by?: string
  approved_date?: string
  description?: string
  reference_no: string
  files: ExpenseFile[]
}

type ConfirmKind = 'approve' | 'reject' | null

const MOCK_EXPENSES: ExpenseRecord[] = [
  {
    expense_id: 'EXP-001',
    title: 'Diesel Fuel — Fleet Batch Apr 28',
    category: 'fuel',
    amount: 14800,
    status: 'under_review',
    submitted_by: 'Juan dela Cruz',
    department: 'Fleet Operations',
    date: '2026-04-28',
    description: 'Full tank refill for 4 trucks assigned to FMCG deliveries.',
    reference_no: 'REF-EXP-2026-001',
    files: [
      { name: 'Fuel_Receipt_Apr28.pdf', size: '184 KB', uploaded: '2026-04-28' },
      { name: 'Gas_Station_Invoice.jpg', size: '980 KB', uploaded: '2026-04-28' },
    ],
  },
  {
    expense_id: 'EXP-002',
    title: 'Preventive Maintenance — Truck TRK-007',
    category: 'maintenance',
    amount: 9200,
    status: 'approved',
    submitted_by: 'Mark Santos',
    department: 'Fleet Maintenance',
    date: '2026-04-20',
    approved_by: 'Admin',
    approved_date: '2026-04-22',
    description: 'PMS including oil change, brake check, and tire rotation.',
    reference_no: 'REF-EXP-2026-002',
    files: [
      { name: 'PMS_Work_Order.pdf', size: '256 KB', uploaded: '2026-04-20' },
      { name: 'Parts_Receipt.pdf', size: '120 KB', uploaded: '2026-04-20' },
    ],
  },
  {
    expense_id: 'EXP-003',
    title: 'Driver Overtime Pay — April',
    category: 'salary',
    amount: 32400,
    status: 'approved',
    submitted_by: 'HR Department',
    department: 'Human Resources',
    date: '2026-04-30',
    approved_by: 'Admin',
    approved_date: '2026-05-02',
    reference_no: 'REF-EXP-2026-003',
    files: [
      { name: 'OT_Payroll_Apr.xlsx', size: '340 KB', uploaded: '2026-04-30' },
    ],
  },
  {
    expense_id: 'EXP-004',
    title: 'Packaging Supplies — Bubble Wrap & Straps',
    category: 'supplies',
    amount: 4600,
    status: 'pending',
    submitted_by: 'Maria Reyes',
    department: 'Warehouse',
    date: '2026-05-01',
    reference_no: 'REF-EXP-2026-004',
    files: [],
  },
  {
    expense_id: 'EXP-005',
    title: 'SLEX Toll Fees — Q1 Reimbursement',
    category: 'toll',
    amount: 3750,
    status: 'rejected',
    submitted_by: 'Pedro Lim',
    department: 'Fleet Operations',
    date: '2026-04-15',
    description: 'Receipts incomplete — missing April 10 & 11 toll slips.',
    reference_no: 'REF-EXP-2026-005',
    files: [
      { name: 'Toll_Receipts_Q1.pdf', size: '88 KB', uploaded: '2026-04-15' },
    ],
  },
  {
    expense_id: 'EXP-006',
    title: 'Fleet Insurance Renewal — 6 Units',
    category: 'insurance',
    amount: 58000,
    status: 'under_review',
    submitted_by: 'Finance Team',
    department: 'Finance',
    date: '2026-05-05',
    reference_no: 'REF-EXP-2026-006',
    files: [
      { name: 'Insurance_Quote.pdf', size: '420 KB', uploaded: '2026-05-05' },
      { name: 'Coverage_Schedule.xlsx', size: '96 KB', uploaded: '2026-05-05' },
    ],
  },
]

const PAGE_SIZE = 8

const CATEGORY_META: Record<ExpenseCategory, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  fuel: { label: 'Fuel', icon: <Fuel size={12} />, color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  maintenance: { label: 'Maintenance', icon: <Wrench size={12} />, color: '#f87171', bg: 'rgba(239,68,68,0.12)' },
  salary: { label: 'Salary', icon: <Users size={12} />, color: '#c084fc', bg: 'rgba(147,51,234,0.12)' },
  supplies: { label: 'Supplies', icon: <Package size={12} />, color: '#4df9ed', bg: 'rgba(77,249,237,0.12)' },
  toll: { label: 'Toll', icon: <Receipt size={12} />, color: '#86efac', bg: 'rgba(58,246,38,0.12)' },
  insurance: { label: 'Insurance', icon: <Wallet size={12} />, color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  other: { label: 'Other', icon: <File size={12} />, color: '#9ca3af', bg: 'rgba(107,114,128,0.12)' },
}

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
    default:
      return { icon: <File size={13} />, bg: 'rgba(255,255,255,.08)', color: '#9ca3af' }
  }
}

function statusStyle(status: ExpenseStatus) {
  switch (status) {
    case 'approved':
      return { bg: 'rgba(58,246,38,0.1)', color: '#86efac', border: 'rgba(58,246,38,0.3)', icon: <CheckCircle2 size={12} /> }
    case 'pending':
      return { bg: 'rgba(77,249,237,0.1)', color: '#4df9ed', border: 'rgba(77,249,237,0.3)', icon: <Clock size={12} /> }
    case 'under_review':
      return { bg: 'rgba(246,159,38,0.1)', color: '#fbbf24', border: 'rgba(246,159,38,0.3)', icon: <Eye size={12} /> }
    case 'rejected':
      return { bg: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'rgba(239,68,68,0.3)', icon: <XCircle size={12} /> }
    default:
      return { bg: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: 'rgba(255,255,255,0.1)', icon: null }
  }
}

const STATUSES: ExpenseStatus[] = ['pending', 'approved', 'rejected', 'under_review']
const CATEGORIES: ExpenseCategory[] = ['fuel', 'maintenance', 'salary', 'supplies', 'toll', 'insurance', 'other']

function FileChip({ file }: { file: ExpenseFile }) {
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

function FileStackBadge({ files }: { files: ExpenseFile[] }) {
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

function CategoryBadge({ category }: { category: ExpenseCategory }) {
  const meta = CATEGORY_META[category]
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide"
      style={{ color: meta.color, background: meta.bg, borderColor: meta.color + '40' }}
    >
      {meta.icon}
      {meta.label}
    </span>
  )
}

function ExpenseDetailPanel({
  record,
  onClose,
  onApprove,
  onReject,
}: {
  record: ExpenseRecord
  onClose: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const st = statusStyle(record.status)
  const meta = CATEGORY_META[record.category]

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
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.07]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Expense</span>
              <CategoryBadge category={record.category} />
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide"
                style={{ color: st.color, borderColor: st.border, background: st.bg }}
              >
                {st.icon}
                {fmtLabel(record.status)}
              </span>
            </div>
            <h2 className="text-base font-bold text-white mt-1 leading-snug">{record.title}</h2>
            <p className="text-xs text-white/45 mt-0.5">{record.reference_no} · {record.department}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-white/50 transition-colors ml-2 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Submitter */}
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-2">Submitted By</p>
            <p className="text-sm font-semibold text-white">{record.submitted_by}</p>
            <p className="text-xs text-white/45 mt-0.5">{record.department} · {fmtDate(record.date)}</p>
          </div>

          {/* Amount + Approver */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-1">Amount</p>
              <p className="text-xl font-bold text-white tabular-nums">{fmtCurrency(record.amount)}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-1">
                {record.approved_by ? 'Approved By' : 'Reviewed By'}
              </p>
              <p className="text-sm font-semibold text-white/85">
                {record.approved_by ?? '—'}
              </p>
              {record.approved_date && (
                <p className="text-xs text-white/40 mt-0.5">{fmtDate(record.approved_date)}</p>
              )}
            </div>
          </div>

          {/* Description */}
          {record.description && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400/70 mb-1.5">Notes / Remarks</p>
              <p className="text-sm text-white/70 leading-relaxed">{record.description}</p>
            </div>
          )}

          {/* Files */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35">Attached Receipts</p>
                {record.files.length > 0 && (
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ color: '#4df9ed', borderColor: 'rgba(77,249,237,.25)', background: 'rgba(77,249,237,.1)' }}
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
                <p className="text-xs text-white/30">No receipts attached</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {record.files.map((f, i) => (
                  <FileChip key={i} file={f} />
                ))}
              </div>
            )}
          </div>

          {/* Rejection input for under_review */}
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

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-white/[0.07]">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-white/70 hover:bg-white/5 transition-colors"
          >
            <Download size={14} />
            Export
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
                  Approve
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function SummaryCards({ records }: { records: ExpenseRecord[] }) {
  const totalAmount = records.reduce((s, r) => s + r.amount, 0)
  const approvedAmount = records.filter((r) => r.status === 'approved').reduce((s, r) => s + r.amount, 0)
  const pendingCount = records.filter((r) => r.status === 'pending' || r.status === 'under_review').length
  const rejectedCount = records.filter((r) => r.status === 'rejected').length

  const cards = [
    { label: 'Total Submitted', value: fmtCurrency(totalAmount), sub: `${records.length} records`, color: '#4df9ed', border: '#2a2a2a', bg: '#1b1b1b', icon: <Wallet size={14} /> },
    { label: 'Approved Amount', value: fmtCurrency(approvedAmount), sub: 'disbursed expenses', color: '#86efac', border: '#2a2a2a', bg: '#1b1b1b', icon: <TrendingUp size={14} /> },
    { label: 'Pending / Review', value: String(pendingCount), sub: 'awaiting action', color: '#fbbf24', border: '#2a2a2a', bg: '#1b1b1b', icon: <Clock size={14} /> },
    { label: 'Rejected', value: String(rejectedCount), sub: 'returned to submitter', color: '#f87171', border: '#2a2a2a', bg: '#1b1b1b', icon: <TrendingDown size={14} /> },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border p-3 flex flex-col gap-1"
          style={{ border: `1px solid ${c.border}`, background: c.bg }}
        >
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">{c.label}</p>
            <span style={{ color: c.color }} className="opacity-50">{c.icon}</span>
          </div>
          <p className="text-xl font-bold tabular-nums leading-none" style={{ color: c.color }}>{c.value}</p>
          <p className="text-[10px] text-white/35">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

export default function ExpensesView() {
  const [records, setRecords] = useState<ExpenseRecord[]>(MOCK_EXPENSES)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)

  const [selectedRecord, setSelectedRecord] = useState<ExpenseRecord | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const handleRefresh = useCallback(async () => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 700))
    setLoading(false)
  }, [])

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const q = search.trim().toLowerCase()
      if (q && ![r.title, r.reference_no, r.submitted_by, r.department].some((s) => s.toLowerCase().includes(q))) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false
      return true
    })
  }, [records, search, statusFilter, categoryFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE)

  const handleAction = async () => {
    if (!selectedRecord || !confirmKind) return
    setActionBusy(true)
    await new Promise((r) => setTimeout(r, 800))

    if (confirmKind === 'approve') {
      setRecords((prev) =>
        prev.map((r) =>
          r.expense_id === selectedRecord.expense_id
            ? { ...r, status: 'approved', approved_by: 'Admin', approved_date: new Date().toISOString().split('T')[0] }
            : r
        )
      )
    } else if (confirmKind === 'reject') {
      setRecords((prev) =>
        prev.map((r) =>
          r.expense_id === selectedRecord.expense_id ? { ...r, status: 'rejected' } : r
        )
      )
    }

    setActionBusy(false)
    setConfirmKind(null)
    setSelectedRecord(null)
  }

  const confirmConfig = (() => {
    if (!confirmKind || !selectedRecord) return null
    if (confirmKind === 'approve') return {
      title: 'Approve Expense?',
      description: `Approve ${selectedRecord.reference_no} — ${selectedRecord.title} (${fmtCurrency(selectedRecord.amount)}).`,
      confirmLabel: actionBusy ? 'Approving…' : 'Approve',
      cancelLabel: 'Cancel',
    }
    return {
      title: 'Reject Expense?',
      description: `Reject ${selectedRecord.reference_no}. The expense will be returned to the submitter.`,
      confirmLabel: actionBusy ? 'Rejecting…' : 'Reject',
      cancelLabel: 'Cancel',
    }
  })()

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">

      <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 gap-3 overflow-hidden">

        <SummaryCards records={records} />

        {/* Filters */}
        <div className="flex flex-col xl:flex-row gap-2 xl:items-center shrink-0">
          <div
            className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-sm"
            style={{ background: '#2a2828' }}
          >
            <Search size={15} className="text-white/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Search title, reference, submitter…"
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
                    background: active ? 'rgba(77,249,237,0.12)' : 'transparent',
                    borderColor: active ? 'rgba(77,249,237,0.35)' : 'rgba(255,255,255,0.08)',
                    color: active ? '#4df9ed' : '#888',
                  }}
                >
                  {key === 'all' ? 'All' : fmtLabel(key)}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] uppercase tracking-wider text-white/35 self-center mr-1">Category</span>
            {(['all', ...CATEGORIES] as const).map((key) => {
              const active = categoryFilter === key
              const meta = key !== 'all' ? CATEGORY_META[key] : null
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setCategoryFilter(key); setPage(0) }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                  style={{
                    background: active ? (meta ? meta.bg : 'rgba(77,249,237,0.12)') : 'transparent',
                    borderColor: active ? (meta ? meta.color + '55' : 'rgba(77,249,237,0.35)') : 'rgba(255,255,255,0.08)',
                    color: active ? (meta ? meta.color : '#4df9ed') : '#888',
                  }}
                >
                  {meta && meta.icon}
                  {key === 'all' ? 'All' : meta!.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <div
                className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--color-cyan)' }}
              />
              <p className="text-sm text-white/45">Loading expenses…</p>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12 text-center px-4">
              <Receipt size={40} className="text-white/15" />
              <p className="text-sm text-white/45">No expenses match your filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-left text-sm border-collapse min-w-[900px]">
                  <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                    <tr className="text-[10px] uppercase tracking-wider text-white/40">
                      <th className="px-3 py-2.5 font-bold">Reference</th>
                      <th className="px-3 py-2.5 font-bold">Title</th>
                      <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Category</th>
                      <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Submitted By</th>
                      <th className="px-3 py-2.5 font-bold">Amount</th>
                      <th className="px-3 py-2.5 font-bold hidden sm:table-cell">Receipts</th>
                      <th className="px-3 py-2.5 font-bold">Status</th>
                      <th className="px-3 py-2.5 font-bold text-right w-[110px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => {
                      const st = statusStyle(r.status)
                      return (
                        <tr
                          key={r.expense_id}
                          className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors"
                        >
                          <td className="px-3 py-3 align-middle">
                            <p className="font-mono text-xs font-semibold text-white/90">{r.reference_no}</p>
                            <p className="text-[10px] text-white/40 mt-0.5">{fmtDate(r.date)}</p>
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <p className="text-sm font-semibold text-white truncate max-w-[200px]">{r.title}</p>
                            <p className="text-[10px] text-white/40 truncate max-w-[200px]">{r.department}</p>
                          </td>
                          <td className="px-3 py-3 align-middle hidden lg:table-cell">
                            <CategoryBadge category={r.category} />
                          </td>
                          <td className="px-3 py-3 align-middle hidden lg:table-cell">
                            <p className="text-xs text-white/70">{r.submitted_by}</p>
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <span className="font-mono text-sm font-bold text-white tabular-nums">{fmtCurrency(r.amount)}</span>
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

              {/* Pagination */}
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

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedRecord && !confirmKind && (
          <ExpenseDetailPanel
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
            onApprove={() => setConfirmKind('approve')}
            onReject={() => setConfirmKind('reject')}
          />
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
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
