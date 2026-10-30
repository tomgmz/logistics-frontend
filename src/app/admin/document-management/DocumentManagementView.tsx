'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import Pagination from '@/components/ui/Pagination'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Eye, Download, ExternalLink, CheckCircle2, XCircle, Archive,
  ArchiveRestore, FileSearch, LayoutGrid, List, MapPinOff,
} from 'lucide-react'
import { Folder, Truck01, Upload01 } from '@untitledui/icons'

import {
  archiveDocument,
  downloadDocuments,
  MAX_DOWNLOAD_FILES,
  fetchDocuments,
  fetchFolders,
  fetchFoldersPage,
  restoreDocument,
  reviewDocument,
} from '@/lib/services/admin/documents.service'
import {
  DERIVED_DOCUMENT_TYPES,
  DOCUMENT_SOURCE_LABELS,
  DOCUMENT_TYPE_LABELS,
  STAFF_DOCUMENT_TYPES,
  downloadFile,
  type DocumentCounts,
  type DocumentFilters,
  type DocumentFolder,
  type LibraryDocument,
  type LibraryDocumentType,
  type ReviewStatus,
} from '@/app/types/documents.types'
import DocumentPreviewModal from '@/components/documents/DocumentPreviewModal'
import UploadDocumentModal from '@/components/documents/UploadDocumentModal'
import { DocumentThumb, DocumentTypeBadge, ReviewStatusBadge } from '@/components/documents/DocumentVisuals'
import ReusableModal, { RemarksModal } from '@/components/layout/ReusableModal'
import RowActionMenu, { type RowAction } from '@/components/ui/RowActionMenu'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useSignedLinkRefresh, withFreshLinks } from '@/lib/hooks/useSignedLinkRefresh'
import { useAuthStore } from '@/lib/store/auth.store'
import { formatDate, formatTime } from '@/app/utils/timeFormat'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { getStatusMeta } from '@/components/transactions/TransactionStatus'

import RefreshButton from '@/components/ui/RefreshButton'
import FilterBar, { type FilterOption, type FilterValues } from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { Breadcrumbs } from '@/components/ui/untitled/breadcrumbs'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import { Button } from '@/components/ui/untitled/button'
import type { DateRange } from '@/components/ui/untitled/date-range-picker'
import { useTablePageSize } from '@/lib/hooks/useTablePageSize'
import { useServerTable } from '@/lib/hooks/useServerTable'

/**
 * Document Management — one library over every file the system keeps, shared
 * by the Company Administrator, General Manager and Operations Manager portals,
 * laid out as folders:
 *
 *   Documents ▸ <client> ▸ <booking>   a booking's files
 *   Documents ▸ Fleet ▸ <plate>         a vehicle's odometer photos and service receipts
 *   Documents ▸ Awaiting review         every staff upload still to be reviewed
 *
 * The folder is in the URL (?client= / ?booking= / ?fleet=1 / ?vehicle= /
 * ?review=1), so Back works and a booking's link opens its folder directly.
 * Searching from the top or a client finds bookings by reference; typing a full
 * reference opens that booking, Enter opens the first match.
 *
 * Most files are evidence recorded by another flow (the client's attachments,
 * the driver's proof photos, the fleet's odometer photos and service receipts):
 * viewable and downloadable, never editable. Paperwork staff attach here goes
 * through review: someone other than the uploader approves or rejects it.
 */

// The grid's 24 tiles fill its 2/3/4/6 columns evenly; tables follow the
// app-wide 10 rows on phones / 20 from tablet up.
const GRID_PAGE_SIZE = 24
const POLL_MS   = 60_000
const VIEW_KEY  = 'documents.view'

type ViewMode = 'table' | 'grid'

type Nav =
  | { level: 'root'; only?: 'clients' }
  | { level: 'client';  clientId: string }
  | { level: 'booking'; bookingId: string }
  | { level: 'fleet' }
  | { level: 'vehicle'; truckId: string }
  | { level: 'review' }

const REVIEW_OPTIONS: FilterOption[] = [
  { value: 'pending',  label: 'Awaiting Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]
const SORT_OPTIONS: FilterOption[] = [
  { value: 'desc', label: 'Newest first' },
  { value: 'asc',  label: 'Oldest first' },
]
const ARCHIVED_OPTIONS: FilterOption[] = [{ value: 'only', label: 'Archived only' }]

// A full booking reference, e.g. BK-202610-00035.
const FULL_REF = /^[A-Z]{2,4}-\d{6}-\d{3,}$/i

const TH = 'px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]'
const TD = 'px-4 md:px-6 py-4'
const CHECKBOX = 'h-4 w-4 cursor-pointer accent-[#4df9ed]'

/** A native checkbox that can also show "some selected". */
function SelectBox({ checked, indeterminate = false, onChange, label }: {
  checked: boolean; indeterminate?: boolean; onChange: () => void; label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} className={CHECKBOX} />
}

function navFrom(p: URLSearchParams): Nav {
  const booking = p.get('booking')
  const vehicle = p.get('vehicle')
  const client  = p.get('client')
  if (booking) return { level: 'booking', bookingId: booking }
  if (vehicle) return { level: 'vehicle', truckId: vehicle }
  if (p.get('review') === '1') return { level: 'review' }
  if (client)  return { level: 'client', clientId: client }
  if (p.get('fleet') === '1') return { level: 'fleet' }
  return p.get('show') === 'clients' ? { level: 'root', only: 'clients' } : { level: 'root' }
}

function navQuery(n: Nav): string {
  switch (n.level) {
    case 'root':    return n.only === 'clients' ? '?show=clients' : ''
    case 'client':  return `?client=${encodeURIComponent(n.clientId)}`
    case 'booking': return `?booking=${encodeURIComponent(n.bookingId)}`
    case 'fleet':   return '?fleet=1'
    case 'vehicle': return `?vehicle=${encodeURIComponent(n.truckId)}`
    case 'review':  return '?review=1'
  }
}

const pick = (v: FilterValues, field: string) => v.find((r) => r.field === field && r.op === 'is')?.value

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

/** Untitled UI's pill with a dot, in the booking status colour. */
function StatusPill({ status }: { status: string | null }) {
  if (!status) return null
  const m = getStatusMeta(status)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
      style={{ color: m.color, background: `${m.color}1a`, ['--tw-ring-color' as string]: `${m.color}4d` }}>
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  )
}

function PendingPill({ n }: { n: number }) {
  if (n <= 0) return <span className="text-[#818181]">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#ffea00]/10 px-2 py-0.5 text-xs font-medium text-[#ffea00] ring-1 ring-inset ring-[#ffea00]/30">
      <span aria-hidden className="size-1.5 rounded-full bg-[#ffea00]" />
      {n.toLocaleString()}
    </span>
  )
}

/** The folder icon tile at the start of a folder row. */
function FolderIcon({ fleet = false }: { fleet?: boolean }) {
  const Icon = fleet ? Truck01 : Folder
  return (
    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#262626] text-[#4df9ed] ring-1 ring-inset ring-[#424242]">
      <Icon className="size-5" />
    </span>
  )
}

export default function DocumentManagementView() {
  // useSearchParams needs its own Suspense boundary under the app router.
  return (
    <Suspense fallback={null}>
      <DocumentLibrary />
    </Suspense>
  )
}

function DocumentLibrary() {
  const pathname     = usePathname()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const portal       = pathname?.split('/')[1] ?? 'admin'
  const myId         = useAuthStore((s) => s.user?.user_id)
  const { canCreate, canEdit, canDelete, canExport } = useModuleAccess()

  const nav     = useMemo(() => navFrom(new URLSearchParams(searchParams?.toString() ?? '')), [searchParams])
  const isFiles = nav.level === 'booking' || nav.level === 'vehicle' || nav.level === 'review'
  const go      = useCallback((n: Nav) => router.push(`${pathname}${navQuery(n)}`), [router, pathname])

  // ── The top-level lists: the root's rows, and the names in the breadcrumb ──
  const [clients,  setClients]  = useState<DocumentFolder[]>([])
  const [vehicles, setVehicles] = useState<DocumentFolder[]>([])
  const loadTop = useCallback(async () => {
    try {
      const [c, v] = await Promise.all([fetchFolders('clients'), fetchFolders('vehicles')])
      setClients(c)
      setVehicles(v)
    } catch { /* the folder rows below report their own errors */ }
  }, [])
  useEffect(() => { void loadTop() }, [loadTop])

  // The open booking's own folder row: its reference, status and client.
  const [bookingInfo, setBookingInfo] = useState<DocumentFolder | null>(null)
  const bookingIdOpen = nav.level === 'booking' ? nav.bookingId : null
  useEffect(() => {
    setBookingInfo(null)
    if (!bookingIdOpen) return
    let cancelled = false
    fetchFolders('bookings', { booking_id: bookingIdOpen })
      .then((r) => { if (!cancelled) setBookingInfo(r[0] ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [bookingIdOpen])

  // ── Search (one box at every level) ───────────────────────────────────────
  const [searchInput, setSearchInput] = useState('')
  const [search,      setSearch]      = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])
  // A new folder starts with an empty box.
  const navKey = navQuery(nav)
  useEffect(() => { setSearchInput(''); setSearch('') }, [navKey])

  // ── Folder rows (root / client / fleet) ───────────────────────────────────
  const tablePageSize = useTablePageSize()
  // One server page of folders (10 rows on phones, 20 from tablet up). From
  // the top, searching finds clients and, across every client, bookings; the
  // Fleet folder comes last when not searching.
  const folderTable = useServerTable(
    (q) => nav.level === 'root'
      ? fetchFoldersPage('root', { ...q, search, fleet: !nav.only })
      : nav.level === 'client'
      ? fetchFoldersPage('bookings', { ...q, client_id: nav.clientId, search })
      : fetchFoldersPage('vehicles', { ...q, search }),
    `${navKey}|${search}`,
    { enabled: !isFiles, errorMessage: 'Could not load folders. Please try again.' },
  )
  const folders       = folderTable.rows
  const folderLoading = folderTable.loading
  const folderError   = folderTable.error
  const loadFolders   = folderTable.reload

  // Typing a full booking reference opens that booking.
  const bookingMatches = useMemo(
    () => (nav.level === 'root' ? folders.filter((f) => f.kind === 'booking') : nav.level === 'client' ? folders : []),
    [nav.level, folders],
  )
  useEffect(() => {
    if (!search || !FULL_REF.test(search)) return
    const hit = bookingMatches.find((b) => (b.name ?? '').toLowerCase() === search.toLowerCase())
    if (hit?.id) go({ level: 'booking', bookingId: hit.id })
  }, [search, bookingMatches, go])

  // ── File rows (a booking, a vehicle, or the review list) ──────────────────
  const [docs,    setDocs]    = useState<LibraryDocument[]>([])
  const [total,   setTotal]   = useState(0)
  const [counts,  setCounts]  = useState<DocumentCounts>({ total: 0, pending_review: 0, by_type: {} })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [types,     setTypes]     = useState<LibraryDocumentType[]>([])
  const [review,    setReview]    = useState<ReviewStatus | ''>('')
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [archived,  setArchived]  = useState(false)
  const [sort,      setSort]      = useState<'desc' | 'asc'>('desc')
  const [page,      setPage]      = useState(1)
  const [view,      setView]      = useState<ViewMode>('table')
  const PAGE_SIZE = view === 'grid' ? GRID_PAGE_SIZE : tablePageSize

  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [approveOf,  setApproveOf]  = useState<LibraryDocument | null>(null)
  const [rejectOf,   setRejectOf]   = useState<LibraryDocument | null>(null)
  const [archiveOf,  setArchiveOf]  = useState<LibraryDocument | null>(null)
  const [busy,       setBusy]       = useState(false)
  const [exporting,  setExporting]  = useState(false)
  // Ticked documents, kept across pages and filters of one folder; the
  // Download button exports exactly these.
  const [selected,   setSelected]   = useState<Map<string, LibraryDocument>>(() => new Map())

  // A new folder starts with no file filters.
  useEffect(() => {
    setTypes([]); setReview(''); setDateRange(null); setArchived(false); setSort('desc')
    setSelected(new Map())
  }, [navKey])

  // Remembered per browser; storage can be unavailable, which is fine.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VIEW_KEY)
      if (v === 'grid' || v === 'table') setView(v)
    } catch { /* no storage */ }
  }, [])
  function changeView(v: ViewMode) {
    setView(v)
    // The page size changes with the view, so the current page number would point elsewhere.
    setPage(1)
    try { window.localStorage.setItem(VIEW_KEY, v) } catch { /* no storage */ }
  }

  const filters: DocumentFilters = useMemo(() => ({
    search:        search || undefined,
    types:         types.length ? types : undefined,
    review_status: nav.level === 'review' ? 'pending' : (review || undefined),
    booking_id:    nav.level === 'booking' ? nav.bookingId : undefined,
    truck_id:      nav.level === 'vehicle' ? nav.truckId : undefined,
    group:         nav.level === 'vehicle' ? 'fleet' : undefined,
    date_from:     dateRange?.from,
    date_to:       dateRange?.to,
    archived:      archived ? 'only' : 'hide',
    sort,
  }), [search, types, review, nav, dateRange, archived, sort])

  // Any filter change goes back to the first page.
  const filterKey = JSON.stringify(filters)
  useEffect(() => { setPage(1) }, [filterKey])

  const reqId = useRef(0)
  const load = useCallback(async (quiet = false) => {
    if (!isFiles) return
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
  }, [isFiles, filters, page, PAGE_SIZE])

  useEffect(() => { void load() }, [load])

  // Document links expire after 10–15 minutes: fresh links for the same page,
  // swapped in place so the rows someone is reading never move.
  useSignedLinkRefresh(docs, () => {
    fetchDocuments(filters, page, PAGE_SIZE)
      .then((res) => setDocs((prev) => withFreshLinks(prev, res.data)))
      .catch(() => {})
  }, isFiles)

  const reloadAll = useCallback((quiet = false) => {
    void loadTop()
    if (isFiles) void load(quiet); else void loadFolders(quiet)
  }, [loadTop, load, loadFolders, isFiles])

  // Real time: every file source signals live:documents (staff uploads, the
  // client's attachments, pickup and stop proof photos, odometer photos and
  // service receipts; migrations 20260930010000 + 20261025040000), so a new or
  // changed file re-reads the folders and the open folder in place. Signals are
  // id-only and debounced by useLiveTable; the 60 s re-check below is only a
  // backstop for a dropped connection.
  useLiveTable(['live:documents'], () => reloadAll(true))

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') reloadAll(true)
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [reloadAll])

  const previewDoc = useMemo(() => docs.find((d) => d.doc_key === previewKey) ?? null, [docs, previewKey])

  // A re-read (review, archive, fresh links) updates the ticked copies too, so
  // the download never carries a stale status.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Map(prev)
      for (const d of docs) if (next.has(d.doc_key) && next.get(d.doc_key) !== d) { next.set(d.doc_key, d); changed = true }
      return changed ? next : prev
    })
  }, [docs])

  function toggleDoc(d: LibraryDocument) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(d.doc_key)) next.delete(d.doc_key); else next.set(d.doc_key, d)
      return next
    })
  }
  const pageSelected = docs.filter((d) => selected.has(d.doc_key)).length
  const allPageSelected = docs.length > 0 && pageSelected === docs.length
  function togglePage() {
    setSelected((prev) => {
      const next = new Map(prev)
      if (allPageSelected) docs.forEach((d) => next.delete(d.doc_key))
      else docs.forEach((d) => next.set(d.doc_key, d))
      return next
    })
  }

  // The Company Administrator and the General Manager open the booking in
  // Transaction History; the Operations Manager has no such page, so theirs is
  // Booking Management.
  const bookingHref = (d: LibraryDocument | null) =>
    !d?.booking_id ? null
      : portal === 'admin' || portal === 'general_manager' ? `/${portal}/transaction-history?booking=${d.booking_id}`
      : `/${portal}/booking-management?booking=${d.booking_id}`

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFileFilters = !!(search || types.length || review || dateRange || archived || sort !== 'desc')

  function resetFilters() {
    setSearchInput(''); setSearch('')
    setTypes([]); setReview(''); setDateRange(null); setArchived(false); setSort('desc')
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
      reloadAll(true)
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: `document-${label}`, entityId: d.document_id ?? undefined })
      // Someone else may have acted first; show the current state.
      reloadAll(true)
    } finally {
      setBusy(false)
    }
  }

  // Nothing ticked: everything this folder and its filters show. Ticked: just those.
  async function handleExport() {
    const all = selected.size === 0
    if (all && total === 0) return
    if (!all && selected.size > MAX_DOWNLOAD_FILES) {
      appToast.error(`You can download up to ${MAX_DOWNLOAD_FILES} files at once. Untick ${selected.size - MAX_DOWNLOAD_FILES} and try again.`)
      return
    }
    if (all && total > MAX_DOWNLOAD_FILES) {
      appToast.error(`There are ${total.toLocaleString()} documents here. Download All takes up to ${MAX_DOWNLOAD_FILES} at a time; narrow the filters or tick the files you need.`)
      return
    }
    setExporting(true)
    try {
      const { included, failed } = await downloadDocuments(all ? { filters } : { keys: [...selected.keys()] })
      if (failed > 0) {
        appToast.error(`Downloaded ${included} of ${included + failed} files. ${failed} could not be fetched; the list inside the ZIP marks which.`)
      } else {
        appToast.success(included === 1 ? 'Downloaded 1 file.' : `Downloaded ${included} files as one ZIP.`)
      }
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Download failed. Please try again.'))
    } finally {
      setExporting(false)
    }
  }

  function rowActions(d: LibraryDocument): RowAction[] {
    const actions: RowAction[] = [
      { label: 'Preview', icon: <Eye size={13} />, onSelect: () => setPreviewKey(d.doc_key) },
      { label: 'Download', icon: <Download size={13} />, onSelect: () => { void downloadFile(d.file_url, d.file_name) } },
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

  // ── Where we are ───────────────────────────────────────────────────────

  const clientName = (id: string | null | undefined) =>
    id === 'none' ? 'No client on record' : clients.find((c) => c.id === id)?.name ?? 'Client'
  const plateOf = (id: string) => vehicles.find((v) => v.id === id)?.name ?? 'Vehicle'
  const pendingTotal = clients.reduce((n, c) => n + c.pending_review, 0)

  const crumbs: { label: string; to?: Nav }[] = [{ label: 'Documents', to: { level: 'root' } }]
  let title = 'Documents'
  if (nav.level === 'client') {
    title = clientName(nav.clientId)
    crumbs.push({ label: title })
  } else if (nav.level === 'booking') {
    const cid = bookingInfo ? (bookingInfo.client_id ?? 'none') : null
    if (cid) crumbs.push({ label: clientName(cid), to: { level: 'client', clientId: cid } })
    title = bookingInfo?.name ?? 'Booking'
    crumbs.push({ label: title })
  } else if (nav.level === 'fleet') {
    title = 'Fleet'
    crumbs.push({ label: 'Fleet' })
  } else if (nav.level === 'vehicle') {
    title = plateOf(nav.truckId)
    crumbs.push({ label: 'Fleet', to: { level: 'fleet' } }, { label: title })
  } else if (nav.level === 'review') {
    title = 'Awaiting review'
    crumbs.push({ label: title })
  }

  // ── Folder rows for the current level ──────────────────────────────────

  type FolderRow = { key: string; to: Nav; fleet?: boolean; name: string; sub: React.ReactNode; detail: React.ReactNode; files: number; pending: number; last: string | null }

  const folderRows: FolderRow[] = useMemo(() => {
    if (nav.level === 'root') {
      // The server sends clients, then (while searching) the bookings that
      // matched across every client, then the Fleet folder.
      return folders.map((r): FolderRow => r.kind === 'fleet'
        ? {
            key: 'fleet', to: { level: 'fleet' }, fleet: true,
            name: 'Fleet', sub: 'Odometer photos and service receipts',
            detail: plural(r.booking_count, 'vehicle'), files: r.file_count, pending: 0, last: r.last_upload,
          }
        : r.kind === 'booking'
        ? {
            key: `b:${r.id}`, to: { level: 'booking', bookingId: r.id ?? '' },
            name: r.name ?? 'Booking', sub: r.company_name ?? 'No client on record',
            detail: <StatusPill status={r.booking_status} />, files: r.file_count, pending: r.pending_review, last: r.last_upload,
          }
        : {
            key: `c:${r.id}`, to: { level: 'client', clientId: r.id ?? 'none' },
            name: r.name ?? 'No client on record', sub: 'Client',
            detail: plural(r.booking_count, 'booking'), files: r.file_count, pending: r.pending_review, last: r.last_upload,
          })
    }
    if (nav.level === 'client') {
      return folders.map((b) => ({
        key: `b:${b.id}`, to: { level: 'booking', bookingId: b.id ?? '' },
        name: b.name ?? 'Booking', sub: b.schedule_date ? `Scheduled ${formatDate(b.schedule_date)}` : 'Booking',
        detail: <StatusPill status={b.booking_status} />, files: b.file_count, pending: b.pending_review, last: b.last_upload,
      }))
    }
    return folders.map((v) => ({
      key: `v:${v.id}`, to: { level: 'vehicle', truckId: v.id ?? '' }, fleet: true,
      name: v.name ?? 'Vehicle', sub: 'Vehicle',
      detail: v.booking_count > 0 ? plural(v.booking_count, 'booking') : '—', files: v.file_count, pending: v.pending_review, last: v.last_upload,
    }))
  }, [nav, folders])

  // Already the current page's rows — the server paginated them.
  const folderSlice = folderRows

  // Enter in the search box opens the first matching booking (or folder).
  const openFirst = () => {
    const firstBooking = bookingMatches[0]
    if (firstBooking?.id) return go({ level: 'booking', bookingId: firstBooking.id })
    if (folderRows[0]) go(folderRows[0].to)
  }

  const typeOptions: FilterOption[] = [...DERIVED_DOCUMENT_TYPES, ...STAFF_DOCUMENT_TYPES]
    .filter((t) => (counts.by_type[t] ?? 0) > 0 || types.includes(t))
    .map((t) => ({ value: t, label: `${DOCUMENT_TYPE_LABELS[t]} (${counts.by_type[t] ?? 0})` }))

  const showRefColumn = nav.level !== 'booking'

  const topTab: 'all' | 'clients' | 'fleet' | null =
    nav.level === 'fleet' ? 'fleet'
      : nav.level === 'root' ? (nav.only === 'clients' ? 'clients' : 'all')
      : null

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden ff-sc bg-[var(--color-bg)]">
      <div className="flex flex-[1_0_auto] lg:flex-1 lg:min-h-0 flex-col p-3 lg:p-4 gap-3 lg:overflow-hidden">
        {/* Where you are: Untitled UI's text breadcrumbs. */}
        <Breadcrumbs
          className="shrink-0"
          homeLabel="Documents"
          onHome={nav.level === 'root' ? undefined : () => go({ level: 'root' })}
          items={crumbs.map((c, i) => ({
            label:   c.label,
            onClick: c.to && i < crumbs.length - 1 ? () => go(c.to!) : undefined,
          }))}
        />

        {/* Untitled UI's table card: the filter row, then folders or files. */}
        <TableCard.Root untitled className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">
          <TableCard.Header
            className="shrink-0"
            title={title}
            contentTrailing={
              <div className="flex flex-wrap gap-3 max-md:w-full">
                {nav.level === 'root' && pendingTotal > 0 && (
                  <Button color="secondary" onClick={() => go({ level: 'review' })} className="max-md:flex-1">
                    Awaiting review ({pendingTotal})
                  </Button>
                )}
                {isFiles && canExport && selected.size > 0 && (
                  <span className="ff-regular self-center text-sm text-[#c4c4c4] max-md:w-full">
                    {selected.size.toLocaleString()} selected ·{' '}
                    <button type="button" onClick={() => setSelected(new Map())} className="text-[#4df9ed] underline-offset-2 [@media(hover:hover)]:hover:underline">
                      Clear
                    </button>
                  </span>
                )}
                {isFiles && canExport && (
                  <Button color="secondary" iconLeading={Download} onClick={() => void handleExport()} disabled={exporting || (selected.size === 0 && total === 0)}
                    title={selected.size === 0
                      ? 'Download every document shown here (all pages) as one ZIP, with a list of them'
                      : 'Download the ticked documents as one ZIP, with a list of them'}
                    className="max-md:flex-1">
                    {exporting ? 'Downloading…' : selected.size === 0 ? 'Download All' : 'Download Selected Files'}
                  </Button>
                )}
                {canCreate && (
                  <Button iconLeading={Upload01} onClick={() => setUploadOpen(true)} className="max-md:flex-1">
                    Upload Document
                  </Button>
                )}
              </div>
            }
          />

          <FilterBar
            layout="untitled"
            // All / Clients / Fleet on the top-level views (a dropdown on phones).
            leading={topTab && (
              <TabsMinimal
                  untitled
                label="Show"
                items={[
                  { id: 'all' as const,     label: 'All' },
                  { id: 'clients' as const, label: `Clients (${clients.length})` },
                  { id: 'fleet' as const,   label: `Fleet (${vehicles.length})` },
                ]}
                selectedKey={topTab}
                onSelectionChange={(k) => go(
                  k === 'fleet' ? { level: 'fleet' } : k === 'clients' ? { level: 'root', only: 'clients' } : { level: 'root' },
                )}
              />
            )}
            search={{
              value: searchInput,
              onChange: setSearchInput,
              placeholder: nav.level === 'root' ? 'Search client or booking' : nav.level === 'client' ? 'Search booking' : nav.level === 'fleet' ? 'Search plate' : 'Search',
              onEnter: isFiles ? undefined : openFirst,
            }}
            dateRange={isFiles ? { value: dateRange, onChange: setDateRange } : undefined}
            fields={isFiles ? [
              { key: 'type',     label: 'Type',     options: typeOptions },
              ...(nav.level === 'review' ? [] : [{ key: 'review', label: 'Review', single: true, options: REVIEW_OPTIONS }]),
              { key: 'archived', label: 'Archived', single: true, options: ARCHIVED_OPTIONS },
              { key: 'sort',     label: 'Order',    single: true, options: SORT_OPTIONS },
            ] : []}
            values={[
              ...types.map((t) => ({ field: 'type', op: 'is' as const, value: t })),
              ...(review ? [{ field: 'review', op: 'is' as const, value: review }] : []),
              ...(archived ? [{ field: 'archived', op: 'is' as const, value: 'only' }] : []),
              ...(sort !== 'desc' ? [{ field: 'sort', op: 'is' as const, value: sort }] : []),
            ]}
            onChange={(v) => {
              setTypes(v.filter((r) => r.field === 'type' && r.op === 'is').map((r) => r.value as LibraryDocumentType))
              setReview((pick(v, 'review') ?? '') as ReviewStatus | '')
              setArchived(pick(v, 'archived') === 'only')
              setSort(pick(v, 'sort') === 'asc' ? 'asc' : 'desc')
            }}
            actions={
              <>
                {isFiles && (
                  <div className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-inset ring-[#424242]" role="group" aria-label="Layout">
                    <button type="button" onClick={() => changeView('table')} aria-label="List view" aria-pressed={view === 'table'}
                      className={`p-2 ${view === 'table' ? 'bg-[#262626] text-white' : 'text-[#818181] [@media(hover:hover)]:hover:text-white'}`}>
                      <List size={16} />
                    </button>
                    <button type="button" onClick={() => changeView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}
                      className={`p-2 ${view === 'grid' ? 'bg-[#262626] text-white' : 'text-[#818181] [@media(hover:hover)]:hover:text-white'}`}>
                      <LayoutGrid size={16} />
                    </button>
                  </div>
                )}
                <RefreshButton iconOnly onClick={() => reloadAll()} loading={isFiles ? loading : folderLoading} disabled={isFiles ? loading : folderLoading} />
              </>
            }
          />

          {isFiles ? (
            <>
              {loading ? (
                <Spinner label="Loading documents…" />
              ) : error ? (
                <ErrorState message={error} onRetry={() => void load()} />
              ) : docs.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                  <FileSearch size={40} className="text-white/20" />
                  <p className="text-sm text-white/45">
                    {hasFileFilters ? 'No documents match your filters.'
                      : nav.level === 'review' ? 'Nothing is waiting for review.'
                      : 'No documents in this folder yet.'}
                  </p>
                  <ClearFiltersLink show={hasFileFilters} onClear={resetFilters} className="mt-0" />
                </div>
              ) : view === 'grid' ? (
                <div className="overflow-x-auto lg:overflow-auto flex-[1_0_auto] lg:flex-1 lg:min-h-0 p-4 md:p-6">
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                    {docs.map((d) => (
                      <div
                        key={d.doc_key}
                        className={`group relative cursor-pointer rounded-xl bg-[#1b1b1b] p-2 ring-1 ring-inset transition-colors [@media(hover:hover)]:hover:bg-[#222222] ${selected.has(d.doc_key) ? 'ring-[#4df9ed]' : 'ring-[#424242]'}`}
                        onClick={() => setPreviewKey(d.doc_key)}
                      >
                        {canExport && (
                          <label
                            className="absolute left-2 top-2 z-[1] flex cursor-pointer rounded-md bg-black/70 p-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectBox checked={selected.has(d.doc_key)} onChange={() => toggleDoc(d)} label={`Select ${d.file_name}`} />
                          </label>
                        )}
                        <DocumentThumb doc={d} big />
                        <div className="mt-2 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-1">
                            <DocumentTypeBadge type={d.doc_type} />
                            <div onClick={(e) => e.stopPropagation()}>
                              <RowActionMenu label={`Actions for ${d.file_name}`} heading={d.file_name} actions={rowActions(d)} />
                            </div>
                          </div>
                          <p className="ff-regular truncate text-sm text-white" title={d.file_name}>{d.file_name}</p>
                          <p className="ff-regular truncate text-xs text-[#818181]">
                            {showRefColumn ? (d.reference_number ?? d.plate_number ?? '—') : (d.detail ?? DOCUMENT_SOURCE_LABELS[d.source])}
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
                <div className="overflow-x-auto lg:overflow-auto flex-[1_0_auto] lg:flex-1 lg:min-h-0">
                  <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-[1] bg-[#222222] font-[family-name:var(--font-alegreya-sc)]">
                      <tr className="h-11 border-b border-[#424242]">
                        {canExport && (
                          <th className="w-12 pl-4 md:pl-6 pr-0 py-2">
                            <SelectBox
                              checked={allPageSelected}
                              indeterminate={pageSelected > 0 && !allPageSelected}
                              onChange={togglePage}
                              label={allPageSelected ? 'Clear this page' : 'Select every document on this page'}
                            />
                          </th>
                        )}
                        <th className={TH}>Document</th>
                        <th className={TH}>Type</th>
                        {showRefColumn && <th className={TH}>Booking / Vehicle</th>}
                        <th className={`${TH} hidden xl:table-cell`}>Details</th>
                        <th className={TH}>Uploaded</th>
                        <th className={TH}>Status</th>
                        <th className={`${TH} w-[70px]`}><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="ff-regular">
                      {docs.map((d) => (
                        <tr
                          key={d.doc_key}
                          className={`cursor-pointer border-b border-[#424242] transition-colors last:border-b-0 [@media(hover:hover)]:hover:bg-[#222222] ${selected.has(d.doc_key) ? 'bg-[#4df9ed]/[0.06]' : ''}`}
                          onClick={() => setPreviewKey(d.doc_key)}
                        >
                          {canExport && (
                            <td className="w-12 pl-4 md:pl-6 pr-0" onClick={(e) => e.stopPropagation()}>
                              <label className="-m-2 flex cursor-pointer p-2">
                                <SelectBox checked={selected.has(d.doc_key)} onChange={() => toggleDoc(d)} label={`Select ${d.file_name}`} />
                              </label>
                            </td>
                          )}
                          <td className={TD}>
                            <div className="flex min-w-0 max-w-[300px] items-center gap-3">
                              <DocumentThumb doc={d} />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-white" title={d.file_name}>{d.file_name}</p>
                                <p className="text-[#818181]">{DOCUMENT_SOURCE_LABELS[d.source]}</p>
                              </div>
                            </div>
                          </td>
                          <td className={TD}><DocumentTypeBadge type={d.doc_type} /></td>
                          {showRefColumn && (
                            <td className={TD}>
                              {d.reference_number ? (
                                <>
                                  <p className="font-medium text-[#4df9ed]">{d.reference_number}</p>
                                  <p className="max-w-[200px] truncate text-[#818181]">{d.company_name ?? '—'}</p>
                                </>
                              ) : null}
                              {d.plate_number && <p className={`font-mono ${d.reference_number ? 'text-xs text-[#818181]' : 'text-[#c4c4c4]'}`}>{d.plate_number}</p>}
                              {!d.reference_number && !d.plate_number && <span className="text-[#818181]">—</span>}
                            </td>
                          )}
                          <td className={`${TD} hidden xl:table-cell`}>
                            <p className="max-w-[260px] truncate text-[#c4c4c4]" title={d.detail ?? undefined}>{d.detail ?? d.notes ?? '—'}</p>
                            {d.override_reason && (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-300" title={d.override_reason}>
                                <MapPinOff size={11} /> Taken away from the stop
                              </p>
                            )}
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>
                            <p className="tabular-nums text-white">{formatDate(d.uploaded_at)}</p>
                            <p className="tabular-nums text-[#818181]">
                              {d.uploaded_at ? formatTime(d.uploaded_at) : ''}
                              {d.uploaded_by_name && ` · ${d.uploaded_by_name}`}
                            </p>
                          </td>
                          <td className={TD}><ReviewStatusBadge doc={d} /></td>
                          <td className={TD} onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end">
                              <RowActionMenu label={`Actions for ${d.file_name}`} heading={d.file_name} actions={rowActions(d)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!loading && !error && total > 0 && (
                <Pagination page={page} totalPages={pages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
              )}
            </>
          ) : (
            <>
              {folderLoading ? (
                <Spinner label="Loading folders…" />
              ) : folderError ? (
                <ErrorState message={folderError} onRetry={() => void loadFolders()} />
              ) : folderRows.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                  <FileSearch size={40} className="text-white/20" />
                  <p className="text-sm text-white/45">
                    {search ? 'Nothing matches your search.' : 'No documents have been recorded yet.'}
                  </p>
                  <ClearFiltersLink show={!!search} onClear={resetFilters} className="mt-0" />
                </div>
              ) : (
                <div className="overflow-x-auto lg:overflow-auto flex-[1_0_auto] lg:flex-1 lg:min-h-0">
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-[1] bg-[#222222] font-[family-name:var(--font-alegreya-sc)]">
                      <tr className="h-11 border-b border-[#424242]">
                        <th className={TH}>Name</th>
                        <th className={TH}>{nav.level === 'root' ? 'Contents' : nav.level === 'client' ? 'Status' : 'Bookings'}</th>
                        <th className={TH}>Files</th>
                        <th className={TH}>Awaiting review</th>
                        <th className={TH}>Last upload</th>
                      </tr>
                    </thead>
                    <tbody className="ff-regular">
                      {folderSlice.map((r) => (
                        <tr
                          key={r.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => go(r.to)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(r.to) } }}
                          className="cursor-pointer border-b border-[#424242] transition-colors last:border-b-0 [@media(hover:hover)]:hover:bg-[#222222]"
                        >
                          <td className={TD}>
                            <div className="flex min-w-0 items-center gap-3">
                              <FolderIcon fleet={r.fleet} />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-white">{r.name}</p>
                                <p className="truncate text-[#818181]">{r.sub}</p>
                              </div>
                            </div>
                          </td>
                          <td className={`${TD} text-[#c4c4c4]`}>{r.detail}</td>
                          <td className={`${TD} tabular-nums text-[#c4c4c4]`}>{r.files.toLocaleString()}</td>
                          <td className={TD}><PendingPill n={r.pending} /></td>
                          <td className={`${TD} whitespace-nowrap text-[#c4c4c4]`}>{r.last ? formatDate(r.last) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!folderLoading && !folderError && folderRows.length > 0 && (
                <Pagination page={folderTable.page} totalPages={folderTable.totalPages} total={folderTable.total} pageSize={folderTable.pageSize} onPageChange={folderTable.setPage} disabled={folderTable.fetching} />
              )}
            </>
          )}
        </TableCard.Root>
      </div>

      <DocumentPreviewModal
        doc={previewDoc}
        bookingHref={bookingHref(previewDoc)}
        onClose={() => setPreviewKey(null)}
        actions={previewActions}
      />

      <UploadDocumentModal
        open={uploadOpen}
        // Inside a booking's folder the upload goes to that booking.
        initialBooking={nav.level === 'booking' && bookingInfo?.id ? {
          booking_id:       bookingInfo.id,
          reference_number: bookingInfo.name,
          status:           bookingInfo.booking_status ?? '',
          schedule_date:    bookingInfo.schedule_date,
          company_name:     bookingInfo.company_name,
        } : null}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => reloadAll(true)}
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

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--color-cyan)' }} />
      <p className="text-sm text-white/45">{label}</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <p className="text-center text-sm text-red-400">{message}</p>
      <button type="button" onClick={onRetry} className="text-sm font-semibold text-[var(--color-cyan)]">Try again</button>
    </div>
  )
}
