'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Search, RefreshCw, Eye, Download, ExternalLink, CheckCircle2, XCircle, Archive,
  ArchiveRestore, Upload, FileSearch, LayoutGrid, List, ChevronLeft, ChevronRight,
  MapPinOff, X, FileSpreadsheet,
} from 'lucide-react'

import {
  archiveDocument,
  exportDocumentsXlsx,
  fetchDocuments,
  restoreDocument,
  reviewDocument,
  DOCUMENT_EXPORT_ROW_CAP,
} from '@/lib/services/admin/documents.service'
import {
  DERIVED_DOCUMENT_TYPES,
  DOCUMENT_SOURCE_LABELS,
  DOCUMENT_TYPE_LABELS,
  STAFF_DOCUMENT_TYPES,
  downloadUrl,
  type DocumentCounts,
  type DocumentFilters,
  type LibraryDocument,
  type LibraryDocumentType,
  type ReviewStatus,
} from '@/app/types/documents.types'
import { DATE_PRESETS, resolvePreset, type DatePreset } from '@/components/transactions/date-presets'
import DocumentPreviewModal from '@/components/documents/DocumentPreviewModal'
import UploadDocumentModal from '@/components/documents/UploadDocumentModal'
import { DocumentThumb, DocumentTypeBadge, ReviewStatusBadge } from '@/components/documents/DocumentVisuals'
import ReusableModal, { RemarksModal } from '@/components/layout/ReusableModal'
import RowActionMenu, { type RowAction } from '@/components/ui/RowActionMenu'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useAuthStore } from '@/lib/store/auth.store'
import { formatDate, formatTime } from '@/app/utils/timeFormat'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'

/**
 * Document Management — one library over every file the system keeps, shared
 * by the Company Administrator, General Manager and Operations Manager portals.
 *
 * Most rows are evidence recorded by another flow (the client's booking
 * attachments, the driver's pickup and delivery photos, the fleet's odometer
 * photos and service receipts): viewable and downloadable, never editable.
 * Paperwork staff attach here (signed receipts that came back on paper, trip
 * tickets, purchase orders) goes through review: someone other than the
 * uploader approves or rejects it. What each viewer may do follows the
 * document-management tier — upload needs Manage, review Manage, archive All.
 */

const PAGE_SIZE = 24
const POLL_MS   = 60_000
const VIEW_KEY  = 'documents.view'

type GroupFilter  = 'all' | 'booking' | 'fleet'
type ReviewFilter = 'all' | ReviewStatus
type ViewMode     = 'table' | 'grid'

const GROUP_FILTERS: { key: GroupFilter; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'booking', label: 'Bookings' },
  { key: 'fleet',   label: 'Fleet' },
]

const REVIEW_FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: 'all',      label: 'Any' },
  { key: 'pending',  label: 'Awaiting Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

function chipStyle(active: boolean) {
  return {
    background:  active ? 'rgba(77,249,237,0.12)' : 'transparent',
    borderColor: active ? 'rgba(77,249,237,0.35)' : 'rgba(255,255,255,0.08)',
    color:       active ? 'var(--color-cyan)' : '#888',
  }
}

// Reads ?booking=<id> once (a link from a booking). Isolated so
// useSearchParams sits under its own Suspense boundary.
function BookingDeepLink({ onBooking }: { onBooking: (id: string | null) => void }) {
  const searchParams = useSearchParams()
  const id = searchParams.get('booking')
  const seen = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (seen.current !== id) {
      seen.current = id
      onBooking(id)
    }
  }, [id, onBooking])
  return null
}

export default function DocumentManagementView() {
  const pathname = usePathname()
  const router   = useRouter()
  const portal   = pathname?.split('/')[1] ?? 'admin'
  const myId     = useAuthStore((s) => s.user?.user_id)
  const { canCreate, canEdit, canDelete, canExport } = useModuleAccess()

  const [docs,    setDocs]    = useState<LibraryDocument[]>([])
  const [total,   setTotal]   = useState(0)
  const [counts,  setCounts]  = useState<DocumentCounts>({ total: 0, pending_review: 0, by_type: {} })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search,      setSearch]      = useState('')
  const [types,       setTypes]       = useState<LibraryDocumentType[]>([])
  const [group,       setGroup]       = useState<GroupFilter>('all')
  const [review,      setReview]      = useState<ReviewFilter>('all')
  const [preset,      setPreset]      = useState<DatePreset>('all')
  const [customFrom,  setCustomFrom]  = useState('')
  const [customTo,    setCustomTo]    = useState('')
  const [archived,    setArchived]    = useState(false)
  const [sort,        setSort]        = useState<'desc' | 'asc'>('desc')
  const [bookingId,   setBookingId]   = useState<string | null>(null)
  const [page,        setPage]        = useState(1)
  const [view,        setView]        = useState<ViewMode>('table')

  const [previewKey,  setPreviewKey]  = useState<string | null>(null)
  const [uploadOpen,  setUploadOpen]  = useState(false)
  const [approveOf,   setApproveOf]   = useState<LibraryDocument | null>(null)
  const [rejectOf,    setRejectOf]    = useState<LibraryDocument | null>(null)
  const [archiveOf,   setArchiveOf]   = useState<LibraryDocument | null>(null)
  const [busy,        setBusy]        = useState(false)
  const [exporting,   setExporting]   = useState(false)

  // Remembered per browser; storage can be unavailable, which is fine.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VIEW_KEY)
      if (v === 'grid' || v === 'table') setView(v)
    } catch { /* no storage */ }
  }, [])
  function changeView(v: ViewMode) {
    setView(v)
    try { window.localStorage.setItem(VIEW_KEY, v) } catch { /* no storage */ }
  }

  // Typing should not fire a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const filters: DocumentFilters = useMemo(() => {
    const range = preset === 'custom'
      ? { from: customFrom || null, to: customTo || null }
      : resolvePreset(preset)
    return {
      search:        search || undefined,
      types:         types.length ? types : undefined,
      group:         group === 'all' ? undefined : group,
      review_status: review === 'all' ? undefined : review,
      booking_id:    bookingId ?? undefined,
      date_from:     range.from ?? undefined,
      date_to:       range.to ?? undefined,
      archived:      archived ? 'only' : 'hide',
      sort,
    }
  }, [search, types, group, review, preset, customFrom, customTo, archived, sort, bookingId])

  // Any filter change goes back to the first page.
  const filterKey = JSON.stringify(filters)
  useEffect(() => { setPage(1) }, [filterKey])

  const reqId = useRef(0)
  const load = useCallback(async (quiet = false) => {
    const id = ++reqId.current
    try {
      if (!quiet) setLoading(true)
      setError(null)
      const res = await fetchDocuments(filters, page, PAGE_SIZE)
      // A slower, older request must not overwrite a newer one.
      if (id !== reqId.current) return
      setDocs(res.data)
      setTotal(res.total)
      setCounts(res.counts)
    } catch (e) {
      if (id === reqId.current && !quiet) setError(getApiErrorMessage(e, 'Could not load documents. Please try again.'))
    } finally {
      if (id === reqId.current && !quiet) setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { void load() }, [load])

  // Proof photos arrive from the driver app, receipts from the fleet side.
  useLiveTable(['live:documents', 'live:bookings', 'live:trucks'], () => { void load(true) })

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  const previewDoc = useMemo(() => docs.find((d) => d.doc_key === previewKey) ?? null, [docs, previewKey])
  const focusedBooking = useMemo(
    () => (bookingId ? docs.find((d) => d.booking_id === bookingId) ?? null : null),
    [docs, bookingId],
  )

  const bookingHref = (d: LibraryDocument | null) =>
    d?.booking_id ? `/${portal}/booking-management?booking=${d.booking_id}` : null

  function clearBookingFocus() {
    setBookingId(null)
    router.replace(pathname ?? `/${portal}/document-management`)
  }

  function toggleType(t: LibraryDocumentType) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = !!(search || types.length || group !== 'all' || review !== 'all' || preset !== 'all' || archived || bookingId)

  function resetFilters() {
    setSearchInput('')
    setSearch('')
    setTypes([])
    setGroup('all')
    setReview('all')
    setPreset('all')
    setCustomFrom('')
    setCustomTo('')
    setArchived(false)
    if (bookingId) clearBookingFocus()
  }

  // ── Actions ────────────────────────────────────────────────────────────

  const isOwn = (d: LibraryDocument) => !!myId && d.uploaded_by === myId
  const canReview = (d: LibraryDocument) =>
    canEdit && !!d.document_id && d.review_status === 'pending' && !d.archived_at

  async function run(label: string, d: LibraryDocument, fn: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await fn()
      appToast.success(done, { action: `document-${label}`, entityId: d.document_id ?? undefined })
      setApproveOf(null)
      setRejectOf(null)
      setArchiveOf(null)
      await load(true)
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: `document-${label}`, entityId: d.document_id ?? undefined })
      // Someone else may have acted first; show the current state.
      await load(true)
    } finally {
      setBusy(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const { count, truncated } = await exportDocumentsXlsx(filters)
      if (count === 0) {
        appToast.error('Nothing to export for these filters.')
        return
      }
      appToast.success(`Exported ${count.toLocaleString()} documents.`)
      if (truncated) {
        appToast.error(`Export was capped at ${DOCUMENT_EXPORT_ROW_CAP.toLocaleString()} rows — narrow the filters for the rest.`)
      }
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Export failed. Please try again.'))
    } finally {
      setExporting(false)
    }
  }

  function rowActions(d: LibraryDocument): RowAction[] {
    const actions: RowAction[] = [
      { label: 'Preview', icon: <Eye size={13} />, onSelect: () => setPreviewKey(d.doc_key) },
      { label: 'Download', icon: <Download size={13} />, onSelect: () => window.open(downloadUrl(d.file_url), '_blank', 'noopener') },
    ]
    const href = bookingHref(d)
    if (href) actions.push({ label: 'Open Booking', icon: <ExternalLink size={13} />, onSelect: () => router.push(href) })

    if (canReview(d)) {
      const own = isOwn(d)
      const title = own ? 'You uploaded this — another reviewer has to approve it' : undefined
      actions.push(
        { label: 'Approve', icon: <CheckCircle2 size={13} />, tone: 'accent', separated: true, disabled: own, title, onSelect: () => setApproveOf(d) },
        { label: 'Reject', icon: <XCircle size={13} />, disabled: own, title, onSelect: () => setRejectOf(d) },
      )
    }
    if (canDelete && d.document_id) {
      actions.push(d.archived_at
        ? { label: 'Restore', icon: <ArchiveRestore size={13} />, separated: true, onSelect: () => void run('restore', d, () => restoreDocument(d.document_id!), 'Document restored.') }
        : { label: 'Archive', icon: <Archive size={13} />, tone: 'warning', separated: true, onSelect: () => setArchiveOf(d) })
    }
    return actions
  }

  const previewActions = previewDoc && (canReview(previewDoc) || (canDelete && previewDoc.document_id)) ? (
    <>
      {canDelete && previewDoc.document_id && (
        previewDoc.archived_at ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('restore', previewDoc, () => restoreDocument(previewDoc.document_id!), 'Document restored.')}
            className="px-3 py-2 rounded-lg border border-white/15 text-sm font-semibold text-white/80 hover:bg-white/5 disabled:opacity-40"
          >
            Restore
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setArchiveOf(previewDoc)}
            className="px-3 py-2 rounded-lg border border-yellow-400/30 text-sm font-semibold text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-40"
          >
            Archive
          </button>
        )
      )}
      {canReview(previewDoc) && (
        <>
          <button
            type="button"
            disabled={busy || isOwn(previewDoc)}
            title={isOwn(previewDoc) ? 'You uploaded this — another reviewer has to approve it' : undefined}
            onClick={() => setRejectOf(previewDoc)}
            className="px-3 py-2 rounded-lg border border-red-400/35 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy || isOwn(previewDoc)}
            title={isOwn(previewDoc) ? 'You uploaded this — another reviewer has to approve it' : undefined}
            onClick={() => setApproveOf(previewDoc)}
            className="px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-40"
            style={{ background: 'var(--color-cyan)' }}
          >
            Approve
          </button>
        </>
      )}
    </>
  ) : null

  // ── Render ─────────────────────────────────────────────────────────────

  const typeChips = [...DERIVED_DOCUMENT_TYPES, ...STAFF_DOCUMENT_TYPES]
    .filter((t) => (counts.by_type[t] ?? 0) > 0 || types.includes(t))

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-sc bg-[var(--color-bg)]">
      <Suspense fallback={null}>
        <BookingDeepLink onBooking={setBookingId} />
      </Suspense>

      <header className="shrink-0 px-3 py-3 lg:px-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Document Management</h1>
          <p className="text-xs text-white/40 mt-0.5">
            {counts.total.toLocaleString()} document{counts.total === 1 ? '' : 's'}
            {counts.pending_review > 0 && (
              <button type="button" onClick={() => setReview('pending')} className="text-amber-300 hover:underline">
                {' '}· {counts.pending_review} awaiting review
              </button>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {canExport && (
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleExport()}
              title="Download every document matching the current filters as an Excel file"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors disabled:opacity-40"
            >
              <FileSpreadsheet size={14} /> {exporting ? 'Exporting…' : 'Export'}
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-black"
              style={{ background: 'var(--color-cyan)' }}
            >
              <Upload size={14} /> Upload Document
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 gap-3 overflow-hidden">
        {/* Filters */}
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex flex-col xl:flex-row gap-2 xl:items-center">
            <div className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-md" style={{ background: '#2a2828' }}>
              <Search size={16} className="text-white/40 shrink-0" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search booking, client, plate, file name…"
                className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
              />
              {searchInput && (
                <button type="button" onClick={() => setSearchInput('')} className="text-white/35 hover:text-white/70" aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 items-center">
              {GROUP_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGroup(key)}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                  style={chipStyle(group === key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
              <select
                value={review}
                onChange={(e) => setReview(e.target.value as ReviewFilter)}
                className="rounded-lg border border-white/10 bg-[#111] px-3 py-1.5 text-xs text-white/80 outline-none"
                aria-label="Review status"
              >
                {REVIEW_FILTERS.map(({ key, label }) => (
                  <option key={key} value={key}>{key === 'all' ? 'Any review status' : label}</option>
                ))}
              </select>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as DatePreset)}
                className="rounded-lg border border-white/10 bg-[#111] px-3 py-1.5 text-xs text-white/80 outline-none"
                aria-label="Uploaded"
              >
                {DATE_PRESETS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
              </select>
              {preset === 'custom' && (
                <span className="flex items-center gap-1.5 text-xs text-white/50">
                  <input type="date" aria-label="From" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[#111] px-2 py-1 text-xs text-white/80 outline-none [color-scheme:dark]" />
                  to
                  <input type="date" aria-label="To" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[#111] px-2 py-1 text-xs text-white/80 outline-none [color-scheme:dark]" />
                </span>
              )}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as 'asc' | 'desc')}
                className="rounded-lg border border-white/10 bg-[#111] px-3 py-1.5 text-xs text-white/80 outline-none"
                aria-label="Sort"
              >
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
              <button
                type="button"
                onClick={() => setArchived((a) => !a)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                style={chipStyle(archived)}
                title="Show archived staff documents instead of the active ones"
              >
                <Archive size={12} /> Archived
              </button>
              <div className="flex rounded-lg border border-white/10 overflow-hidden" role="group" aria-label="Layout">
                <button type="button" onClick={() => changeView('table')} aria-label="List view" aria-pressed={view === 'table'}
                  className={`p-1.5 ${view === 'table' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
                  <List size={14} />
                </button>
                <button type="button" onClick={() => changeView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}
                  className={`p-1.5 ${view === 'grid' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>
          </div>

          {(typeChips.length > 0 || bookingId) && (
            <div className="flex flex-wrap gap-1.5 items-center">
              {bookingId && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold border border-[var(--color-cyan)]/35 bg-[rgba(77,249,237,0.08)] text-[var(--color-cyan)]">
                  Booking {focusedBooking?.reference_number ?? bookingId.slice(0, 8)}
                  <button type="button" onClick={clearBookingFocus} aria-label="Show all bookings"><X size={12} /></button>
                </span>
              )}
              <span className="text-[10px] uppercase tracking-wider text-white/35 mr-1">Type</span>
              {typeChips.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                  style={chipStyle(types.includes(t))}
                >
                  {DOCUMENT_TYPE_LABELS[t]} <span className="opacity-60 tabular-nums">{counts.by_type[t] ?? 0}</span>
                </button>
              ))}
              {hasFilters && (
                <button type="button" onClick={resetFilters} className="text-[11px] font-semibold text-white/45 hover:text-white/80 ml-1">
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
              <p className="text-sm text-white/45">Loading documents…</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <p className="text-red-400 text-sm text-center">{error}</p>
              <button type="button" onClick={() => void load()} className="text-[var(--color-cyan)] text-sm font-semibold">Try again</button>
            </div>
          ) : docs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
              <FileSearch size={40} className="text-white/20" />
              <p className="text-sm text-white/45">
                {hasFilters ? 'No documents match your filters.' : archived ? 'Nothing has been archived.' : 'No documents have been recorded yet.'}
              </p>
              {hasFilters && (
                <button type="button" onClick={resetFilters} className="text-[var(--color-cyan)] text-sm font-semibold">Clear filters</button>
              )}
            </div>
          ) : view === 'grid' ? (
            <div className="overflow-auto flex-1 min-h-0 p-3">
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {docs.map((d) => (
                  <div
                    key={d.doc_key}
                    className="group relative rounded-xl border border-white/[0.08] bg-black/30 p-2 hover:border-white/20 transition-colors cursor-pointer"
                    onClick={() => setPreviewKey(d.doc_key)}
                  >
                    <DocumentThumb doc={d} big />
                    <div className="mt-2 space-y-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <DocumentTypeBadge type={d.doc_type} />
                        <div onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu label={`Actions for ${d.file_name}`} actions={rowActions(d)} />
                        </div>
                      </div>
                      <p className="text-xs text-white/80 truncate" title={d.file_name}>{d.file_name}</p>
                      <p className="text-[11px] text-white/40 truncate">
                        {d.reference_number ?? d.plate_number ?? '—'}
                        {d.uploaded_at && ` · ${formatDate(d.uploaded_at)}`}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <ReviewStatusBadge doc={d} />
                        {d.override_reason && <span title="Taken away from the stop"><MapPinOff size={12} className="text-amber-300" /></span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-left text-sm border-collapse min-w-[900px]">
                <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                  <tr className="text-[11px] uppercase tracking-wider text-white/40">
                    <th className="px-3 py-2.5 font-bold">Document</th>
                    <th className="px-3 py-2.5 font-bold">Type</th>
                    <th className="px-3 py-2.5 font-bold">Booking / Vehicle</th>
                    <th className="px-3 py-2.5 font-bold hidden xl:table-cell">Details</th>
                    <th className="px-3 py-2.5 font-bold">Uploaded</th>
                    <th className="px-3 py-2.5 font-bold">Status</th>
                    <th className="px-3 py-2.5 font-bold text-right w-[70px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr
                      key={d.doc_key}
                      className="border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors cursor-pointer"
                      onClick={() => setPreviewKey(d.doc_key)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5 min-w-0 max-w-[280px]">
                          <DocumentThumb doc={d} />
                          <div className="min-w-0">
                            <p className="text-white/85 truncate" title={d.file_name}>{d.file_name}</p>
                            <p className="text-[11px] text-white/35">{DOCUMENT_SOURCE_LABELS[d.source]}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2"><DocumentTypeBadge type={d.doc_type} /></td>
                      <td className="px-3 py-2">
                        {d.reference_number ? (
                          <>
                            <p className="text-white/80">{d.reference_number}</p>
                            <p className="text-[11px] text-white/40 truncate max-w-[200px]">{d.company_name ?? '—'}</p>
                          </>
                        ) : null}
                        {d.plate_number && <p className={`font-mono ${d.reference_number ? 'text-[11px] text-white/45' : 'text-white/75'}`}>{d.plate_number}</p>}
                        {!d.reference_number && !d.plate_number && <span className="text-white/25">—</span>}
                      </td>
                      <td className="px-3 py-2 hidden xl:table-cell">
                        <p className="text-xs text-white/55 max-w-[260px] truncate" title={d.detail ?? undefined}>{d.detail ?? d.notes ?? '—'}</p>
                        {d.override_reason && (
                          <p className="flex items-center gap-1 text-[11px] text-amber-300 mt-0.5" title={d.override_reason}>
                            <MapPinOff size={11} /> Taken away from the stop
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <p className="text-xs text-white/65 tabular-nums">{formatDate(d.uploaded_at)}</p>
                        <p className="text-[11px] text-white/35 tabular-nums">
                          {d.uploaded_at ? formatTime(d.uploaded_at) : ''}
                          {d.uploaded_by_name && ` · ${d.uploaded_by_name}`}
                        </p>
                      </td>
                      <td className="px-3 py-2"><ReviewStatusBadge doc={d} /></td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <RowActionMenu label={`Actions for ${d.file_name}`} actions={rowActions(d)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && total > 0 && (
            <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-t border-white/[0.07] text-xs text-white/45">
              <span className="tabular-nums">
                {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30" aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                <span className="tabular-nums px-1">Page {page} of {pages}</span>
                <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30" aria-label="Next page">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <DocumentPreviewModal
        doc={previewDoc}
        bookingHref={bookingHref(previewDoc)}
        onClose={() => setPreviewKey(null)}
        actions={previewActions}
      />

      <UploadDocumentModal
        open={uploadOpen}
        initialBooking={focusedBooking?.booking_id ? {
          booking_id:       focusedBooking.booking_id,
          reference_number: focusedBooking.reference_number,
          status:           focusedBooking.booking_status ?? '',
          schedule_date:    null,
          company_name:     focusedBooking.company_name,
        } : null}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => void load(true)}
      />

      <ReusableModal
        open={!!approveOf}
        title="Approve document?"
        description={approveOf
          ? `Approve "${approveOf.file_name}" as the ${DOCUMENT_TYPE_LABELS[approveOf.doc_type].toLowerCase()} for ${approveOf.reference_number ?? 'this booking'}.`
          : undefined}
        confirmLabel={busy ? 'Saving…' : 'Approve'}
        cancelLabel="Cancel"
        disableBackdropClose={busy}
        onCancel={() => { if (!busy) setApproveOf(null) }}
        onConfirm={() => { if (approveOf) void run('approve', approveOf, () => reviewDocument(approveOf.document_id!, 'approved'), 'Document approved.') }}
      />

      <RemarksModal
        open={!!rejectOf}
        title="Reject document?"
        description="Say what is wrong so the uploader can replace it. The reason stays on the document."
        remarksLabel="Reason"
        remarksPlaceholder="e.g. Receipt is not stamped by the receiving bay; stop 2 quantities are unreadable."
        confirmLabel={busy ? 'Saving…' : 'Reject'}
        cancelLabel="Cancel"
        busy={busy}
        disableBackdropClose={busy}
        onCancel={() => { if (!busy) setRejectOf(null) }}
        onConfirm={(reason) => { if (rejectOf) void run('reject', rejectOf, () => reviewDocument(rejectOf.document_id!, 'rejected', reason), 'Document rejected.') }}
      />

      <ReusableModal
        open={!!archiveOf}
        title="Archive document?"
        description={archiveOf
          ? `"${archiveOf.file_name}" will be hidden from the library. The file is kept and can be restored from the Archived view.`
          : undefined}
        confirmLabel={busy ? 'Archiving…' : 'Archive'}
        cancelLabel="Cancel"
        disableBackdropClose={busy}
        onCancel={() => { if (!busy) setArchiveOf(null) }}
        onConfirm={() => { if (archiveOf) void run('archive', archiveOf, () => archiveDocument(archiveOf.document_id!), 'Document archived.') }}
      />
    </div>
  )
}
