'use client'

import TableEmptyState from '@/components/ui/TableEmptyState'
import Pagination from '@/components/ui/Pagination'
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Eye, Download, ExternalLink, CheckCircle2, XCircle, Archive,
  ArchiveRestore, FileSearch, LayoutGrid, List, MapPinOff, ChevronRight,
  FolderOpen, File as FileIcon,
} from 'lucide-react'
import { Truck01, Upload01 } from '@untitledui/icons'

import {
  archiveDocument,
  downloadDocuments,
  MAX_DOWNLOAD_FILES,
  fetchDocuments,
  fetchFolders,
  fetchFoldersPage,
  restoreDocument,
  reviewDocument,
  type DocumentFolderRow,
} from '@/lib/services/admin/documents.service'
import {
  DERIVED_DOCUMENT_TYPES,
  DOCUMENT_SOURCE_LABELS,
  DOCUMENT_TYPE_LABELS,
  STAFF_DOCUMENT_TYPES,
  documentTypeLabel,
  downloadFile,
  previewKind,
  type DocumentCounts,
  type DocumentFilters,
  type DocumentFolder,
  type LibraryDocument,
  type LibraryDocumentType,
  type ReviewStatus,
  type UploadTarget,
} from '@/app/types/documents.types'
import DocumentPreviewModal, { PREVIEW_ACTION_CLASS, PREVIEW_TONE } from '@/components/documents/DocumentPreviewModal'
import UploadDocumentModal from '@/components/documents/UploadDocumentModal'
import { DocStatusText, RowIconTile } from '@/components/documents/DocumentVisuals'
import ReusableModal, { RemarksModal } from '@/components/layout/ReusableModal'
import RowActionMenu, { type RowAction } from '@/components/ui/RowActionMenu'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useSignedLinkRefresh, withFreshLinks } from '@/lib/hooks/useSignedLinkRefresh'
import { useAuthStore } from '@/lib/store/auth.store'
import { formatDate, formatTime } from '@/app/utils/timeFormat'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { roleLabel } from '@/lib/roles'
import BookingStatusTag from '@/components/transactions/BookingStatusTag'
import { ModelThumb, TABLE_TAG, fmtLabel, resolveModelImageUrl, statusStyle } from '@/app/admin/vehicle-management/vehicle-ui'
import { ProtectedImg } from '@/components/ui/FileViewer'

import FilterBar, { type FilterOption, type FilterValues } from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import { Button } from '@/components/ui/untitled/button'
import type { DateRange } from '@/components/ui/untitled/date-range-picker'
import { useTablePageSize } from '@/lib/hooks/useTablePageSize'
import { useServerTable } from '@/lib/hooks/useServerTable'
import { bookingQuery } from '@/lib/booking-url'
import { TruncatedText } from '@/components/ui/TruncatedText'
import { Tip } from '@/components/ui/tooltip'

/**
 * Document Management — one library over every file the system keeps, shared
 * by the Company Administrator, General Manager, Operations Manager and Fleet
 * Manager portals, laid out as folders (Figma docs/figma/document_management,
 * 2026-11-25):
 *
 *   Documents ▸ <client>                       two folders: Bookings, Documents
 *   Documents ▸ <client> ▸ Bookings ▸ <booking> a booking's files
 *   Documents ▸ <client> ▸ Documents           the client's own paperwork (contracts)
 *   Documents ▸ Fleet ▸ <plate>                 a vehicle's papers, odometer photos, service receipts
 *   Documents ▸ Awaiting review                 every staff upload still to be reviewed
 *
 * The folder is in the URL (?client= [&section=bookings|documents] /
 * ?booking= / ?fleet=1 / ?vehicle= / ?review=1), so Back works and a booking's
 * link opens its folder directly. Searching from the top or a client finds
 * bookings by reference; typing a full reference opens that booking, Enter
 * opens the first match.
 *
 * Most files are evidence recorded by another flow (the client's attachments,
 * the driver's proof photos, the fleet's odometer photos and service receipts):
 * viewable and downloadable, never editable. Paperwork staff attach here goes
 * through review when it is a Contract or Proof of Delivery: someone other than
 * the uploader approves or rejects it. Vehicle papers and Other count at once.
 *
 * `fleetOnly` (the Fleet Manager's portal, 2026-11-08) starts at Fleet and
 * never shows clients or bookings. The server enforces the same scope on
 * every endpoint (documents.controller scopeOf); this is only its view.
 */

// The grid's 24 tiles fill its 2/3/4/6 columns evenly; tables follow the
// app-wide 10 rows on phones / 20 from tablet up.
const GRID_PAGE_SIZE = 24
const POLL_MS   = 60_000
const VIEW_KEY  = 'documents.view'

type ViewMode = 'table' | 'grid'

/** Inside a client: its two folders (no section), or one of them. */
type ClientSection = 'bookings' | 'documents'

type Nav =
  | { level: 'root'; only?: 'clients' }
  | { level: 'client';  clientId: string; section?: ClientSection }
  | { level: 'booking'; bookingId: string }
  | { level: 'fleet' }
  | { level: 'vehicle'; truckId: string }
  | { level: 'review' }
  /** Every archived document, across all folders: the only place they are listed (2026-11-08). */
  | { level: 'archived' }

const REVIEW_OPTIONS: FilterOption[] = [
  { value: 'pending',  label: 'Awaiting Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]
const SORT_OPTIONS: FilterOption[] = [
  { value: 'desc', label: 'Newest first' },
  { value: 'asc',  label: 'Oldest first' },
]

// A full booking reference, e.g. BK-202610-00035.
const FULL_REF = /^[A-Z]{2,4}-\d{6}-\d{3,}$/i

const CHECKBOX = 'h-4 w-4 cursor-pointer accent-[#4df9ed]'
/** The orange second line under a row's name (Figma: "Client", "Scheduled [date]", "[uploader] · [name]"). */
const SUB = 'mt-0.5 font-[family-name:var(--font-darker)] text-xs 3xl:text-sm font-bold leading-tight text-[#ff7a30]'
/** The cyan chevron at the end of a folder row. */
const CHEVRON_TD = 'w-12 text-right'
/** "---" in a column with nothing to show. */
const NONE = <span className="text-[#818181]">---</span>

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
  // The Contract folder was removed 2026-11-18: an old ?contract= link opens
  // the client's Documents folder, where its contracts are listed.
  const contract = p.get('contract')
  const section  = p.get('section')
  if (booking) return { level: 'booking', bookingId: booking }
  if (contract) return { level: 'client', clientId: contract, section: 'documents' }
  if (vehicle) return { level: 'vehicle', truckId: vehicle }
  if (p.get('review') === '1') return { level: 'review' }
  if (p.get('archived') === '1') return { level: 'archived' }
  if (client) {
    return {
      level: 'client', clientId: client,
      // "No client on record" has bookings only.
      section: section === 'bookings' ? 'bookings' : section === 'documents' && client !== 'none' ? 'documents' : undefined,
    }
  }
  if (p.get('fleet') === '1') return { level: 'fleet' }
  return p.get('show') === 'clients' ? { level: 'root', only: 'clients' } : { level: 'root' }
}

function navQuery(n: Nav): string {
  switch (n.level) {
    case 'root':    return n.only === 'clients' ? '?show=clients' : ''
    case 'client':  return `?client=${encodeURIComponent(n.clientId)}${n.section ? `&section=${n.section}` : ''}`
    case 'booking': return `?booking=${encodeURIComponent(n.bookingId)}`
    case 'fleet':   return '?fleet=1'
    case 'vehicle': return `?vehicle=${encodeURIComponent(n.truckId)}`
    case 'review':  return '?review=1'
    case 'archived': return '?archived=1'
  }
}

const pick = (v: FilterValues, field: string) => v.find((r) => r.field === field && r.op === 'is')?.value

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

/** Awaiting review: the count in yellow, or "---". */
function PendingCount({ n }: { n: number }) {
  if (n <= 0) return NONE
  return <span className="tabular-nums text-[#ffea00]">{n.toLocaleString()}</span>
}

/** A file's icon tile: the photo itself when it is one, else a grey file icon. */
function FileTile({ doc }: { doc: LibraryDocument }) {
  const image = previewKind(doc.file_url) === 'image'
  return (
    <RowIconTile>
      {image
        ? <ProtectedImg src={doc.file_url} alt="" loading="lazy" className="size-full object-cover" />
        : <FileIcon className="size-5" strokeWidth={1.5} />}
    </RowIconTile>
  )
}

/** "[uploader's role] · [uploader's name]" under a file's name. */
function uploaderLine(d: LibraryDocument): string {
  const who = roleLabel(d.uploaded_by_role) || DOCUMENT_SOURCE_LABELS[d.source]
  return d.uploaded_by_name ? `${who} · ${d.uploaded_by_name}` : who
}

/** A booking folder row as BookingStatusTag reads it (main tag + sub-tags). */
function bookingOfFolder(f: DocumentFolder): Record<string, unknown> {
  return { ...f, status: f.booking_status }
}

export default function DocumentManagementView({ fleetOnly = false, archive }: {
  fleetOnly?: boolean
  /**
   * The Archive module's tab switcher. When given, this is the archived
   * documents list only (every folder): that switcher in place of the All /
   * Clients / Fleet tabs, no breadcrumbs, no upload. A folder link opens
   * Document Management itself.
   */
  archive?:   React.ReactNode
} = {}) {
  // useSearchParams needs its own Suspense boundary under the app router.
  return (
    <Suspense fallback={null}>
      <DocumentLibrary fleetOnly={fleetOnly} archive={archive} />
    </Suspense>
  )
}

function DocumentLibrary({ fleetOnly, archive }: { fleetOnly: boolean; archive?: React.ReactNode }) {
  const pathname     = usePathname()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const portal       = pathname?.split('/')[1] ?? 'admin'
  const myId         = useAuthStore((s) => s.user?.user_id)
  const { canCreate, canEdit, canDelete, canExport } = useModuleAccess()

  // The top of the library: Fleet for the Fleet Manager, else every folder.
  const home: Nav = useMemo(() => (fleetOnly ? { level: 'fleet' } : { level: 'root' }), [fleetOnly])
  const nav     = useMemo((): Nav => {
    if (archive) return { level: 'archived' }
    const n = navFrom(new URLSearchParams(searchParams?.toString() ?? ''))
    // Archived documents are listed only in the Archive module (2026-11-11);
    // an old ?archived=1 link opens the top of the library.
    if (n.level === 'archived') return home
    // A client/booking link opened by the Fleet Manager lands on Fleet instead.
    return fleetOnly && n.level !== 'fleet' && n.level !== 'vehicle' && n.level !== 'review' ? home : n
  }, [searchParams, fleetOnly, home, archive])
  const clientDocs     = nav.level === 'client' && nav.section === 'documents'
  const clientSections = nav.level === 'client' && !nav.section
  const isFiles = nav.level === 'booking' || nav.level === 'vehicle' || nav.level === 'review' || nav.level === 'archived' || clientDocs
  // From the Archive module, a folder opens in Document Management itself.
  const libraryPath = archive ? `/${portal}/document-management` : pathname
  const go      = useCallback((n: Nav) => router.push(`${libraryPath}${navQuery(n)}`), [router, libraryPath])

  // ── The top-level lists: the root's rows, and the names in the breadcrumb ──
  const [clients,  setClients]  = useState<DocumentFolder[]>([])
  const [vehicles, setVehicles] = useState<DocumentFolder[]>([])
  const loadTop = useCallback(async () => {
    try {
      const [c, v] = await Promise.all([fleetOnly ? Promise.resolve([]) : fetchFolders('clients'), fetchFolders('vehicles')])
      setClients(c)
      setVehicles(v)
    } catch { /* the folder rows below report their own errors */ }
  }, [fleetOnly])
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

  // ── Folder rows (root / a client's bookings / fleet) ─────────────────────
  const tablePageSize = useTablePageSize()
  // A client's two folders are fixed rows; searching there lists its matching
  // bookings instead.
  const showSections = clientSections && !search
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
    { enabled: !isFiles && !showSections, errorMessage: 'Could not load folders. Please try again.', cacheKey: 'document-folders' },
  )
  const folders       = folderTable.rows as DocumentFolderRow[]
  const folderLoading = folderTable.loading
  const folderError   = folderTable.error
  const loadFolders   = folderTable.reload

  // ── A client's two folders: Bookings (its bookings' files) and Documents
  // (its own paperwork, e.g. contracts), each with its own counts.
  type SectionTotals = { files: number; pending: number; last: string | null }
  const [sections, setSections] = useState<{ bookings: SectionTotals; documents: SectionTotals } | null>(null)
  const [sectionsError, setSectionsError] = useState<string | null>(null)
  const sectionClient = clientSections ? nav.clientId : null
  const sectionReq = useRef(0)
  const loadSections = useCallback(async (quiet = false) => {
    const id = ++sectionReq.current
    if (!sectionClient) return
    if (!quiet) { setSections(null); setSectionsError(null) }
    try {
      const [bookings, docs] = await Promise.all([
        fetchFolders('bookings', { client_id: sectionClient }),
        sectionClient === 'none'
          ? Promise.resolve(null)
          : fetchDocuments({ group: 'client', client_id: sectionClient, archived: 'hide', sort: 'desc' }, 1, 1),
      ])
      if (id !== sectionReq.current) return
      setSections({
        bookings: {
          files:   bookings.reduce((n, b) => n + b.file_count, 0),
          pending: bookings.reduce((n, b) => n + b.pending_review, 0),
          last:    bookings.reduce<string | null>((m, b) => (b.last_upload && (!m || b.last_upload > m) ? b.last_upload : m), null),
        },
        documents: {
          files:   docs?.counts.total ?? 0,
          pending: docs?.counts.pending_review ?? 0,
          last:    docs?.data[0]?.uploaded_at ?? null,
        },
      })
      setSectionsError(null)
    } catch (e) {
      if (id === sectionReq.current && !quiet) setSectionsError(getApiErrorMessage(e, 'Could not load folders. Please try again.'))
    }
  }, [sectionClient])
  useEffect(() => { void loadSections() }, [loadSections])

  // Typing a full booking reference opens that booking.
  const bookingMatches = useMemo(
    () => (nav.level === 'root' || nav.level === 'client' ? folders.filter((f) => f.kind === 'booking' || nav.level === 'client') : []),
    [nav.level, folders],
  )
  useEffect(() => {
    if (!search || !FULL_REF.test(search)) return
    const hit = bookingMatches.find((b) => (b.name ?? '').toLowerCase() === search.toLowerCase())
    if (hit?.id) go({ level: 'booking', bookingId: hit.id })
  }, [search, bookingMatches, go])

  // ── File rows (a booking, a vehicle, a client's documents, or the review list) ──
  const [docs,    setDocs]    = useState<LibraryDocument[]>([])
  const [total,   setTotal]   = useState(0)
  const [counts,  setCounts]  = useState<DocumentCounts>({ total: 0, pending_review: 0, by_type: {} })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [types,     setTypes]     = useState<LibraryDocumentType[]>([])
  const [review,    setReview]    = useState<ReviewStatus | ''>('')
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
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
    setTypes([]); setReview(''); setDateRange(null); setSort('desc')
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
    client_id:     nav.level === 'client' && nav.section === 'documents' ? nav.clientId : undefined,
    group:         nav.level === 'vehicle' ? 'fleet' : nav.level === 'client' && nav.section === 'documents' ? 'client' : undefined,
    date_from:     dateRange?.from,
    date_to:       dateRange?.to,
    // Archived documents are listed in the Archive module only.
    archived:      nav.level === 'archived' ? 'only' : 'hide',
    sort,
  }), [search, types, review, nav, dateRange, sort])

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
    if (isFiles) void load(quiet)
    else if (showSections) void loadSections(quiet)
    else void loadFolders(quiet)
  }, [loadTop, load, loadFolders, loadSections, isFiles, showSections])

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
  // The Fleet Manager has no booking page (2026-11-11), so no Open Booking there.
  const bookingHref = (d: LibraryDocument | null) =>
    !d?.booking_id || portal === 'fleet_admin' ? null
      : portal === 'admin' || portal === 'general_manager' ? `/${portal}/transaction-history${bookingQuery({ booking_id: d.booking_id, reference_number: d.reference_number })}`
      : `/${portal}/booking-management${bookingQuery({ booking_id: d.booking_id, reference_number: d.reference_number })}`

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFileFilters = !!(search || types.length || review || dateRange || sort !== 'desc')

  function resetFilters() {
    setSearchInput(''); setSearch('')
    setTypes([]); setReview(''); setDateRange(null); setSort('desc')
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

  // The preview's buttons (Figma): Archive (yellow), Reject (red), Approve
  // (cyan), outlined, equal width in one row; Archive alone fills the row.
  const ownHint = 'You uploaded this — another reviewer has to approve it'
  const previewActions = previewDoc && (canReview(previewDoc) || (canDelete && previewDoc.document_id)) ? (
    <>
      {canDelete && previewDoc.document_id && (
        previewDoc.archived_at ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('restore', previewDoc, () => restoreDocument(previewDoc.document_id!), 'Document restored.')}
            className={PREVIEW_ACTION_CLASS}
            style={PREVIEW_TONE.neutral}
          >
            Restore
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => setArchiveOf(previewDoc)} className={PREVIEW_ACTION_CLASS} style={PREVIEW_TONE.archive}>
            Archive
          </button>
        )
      )}
      {canReview(previewDoc) && (
        <>
          <Tip label={isOwn(previewDoc) ? ownHint : undefined}><button
            type="button"
            disabled={busy || isOwn(previewDoc)}
            onClick={() => setRejectOf(previewDoc)}
            className={PREVIEW_ACTION_CLASS}
            style={PREVIEW_TONE.reject}
          >
            Reject
          </button></Tip>
          <Tip label={isOwn(previewDoc) ? ownHint : undefined}><button
            type="button"
            disabled={busy || isOwn(previewDoc)}
            onClick={() => setApproveOf(previewDoc)}
            className={PREVIEW_ACTION_CLASS}
            style={PREVIEW_TONE.approve}
          >
            Approve
          </button></Tip>
        </>
      )}
    </>
  ) : null

  // ── Where we are ───────────────────────────────────────────────────────

  const clientName = (id: string | null | undefined) =>
    id === 'none' ? 'No client on record' : clients.find((c) => c.id === id)?.name ?? 'Client'
  const plateOf = (id: string) => vehicles.find((v) => v.id === id)?.name ?? 'Vehicle'
  const pendingTotal = [...clients, ...vehicles].reduce((n, c) => n + c.pending_review, 0)
  const atHome = nav.level === home.level && (nav.level !== 'root' || !('only' in nav && nav.only))

  // Clients and Fleet each get their own crumb (user 2026-11-25: the Clients
  // tab reads "Documents › Clients", like "Documents › Fleet").
  const CLIENTS_NAV: Nav = { level: 'root', only: 'clients' }
  const crumbs: { label: string; to?: Nav }[] = [{ label: 'Documents', to: home }]
  if (nav.level === 'root' && nav.only === 'clients') {
    crumbs.push({ label: 'Clients' })
  } else if (nav.level === 'client') {
    crumbs.push({ label: 'Clients', to: CLIENTS_NAV })
    crumbs.push({ label: clientName(nav.clientId), to: { level: 'client', clientId: nav.clientId } })
    if (nav.section === 'bookings')  crumbs.push({ label: 'Bookings' })
    if (nav.section === 'documents') crumbs.push({ label: 'Documents' })
  } else if (nav.level === 'booking') {
    const cid = bookingInfo ? (bookingInfo.client_id ?? 'none') : null
    if (cid) {
      crumbs.push({ label: 'Clients', to: CLIENTS_NAV })
      crumbs.push({ label: clientName(cid), to: { level: 'client', clientId: cid } })
      crumbs.push({ label: 'Bookings', to: { level: 'client', clientId: cid, section: 'bookings' } })
    }
    crumbs.push({ label: bookingInfo?.name ?? 'Booking' })
  } else if (nav.level === 'fleet') {
    // For the Fleet Manager, Fleet is the top ("Documents").
    if (!fleetOnly) crumbs.push({ label: 'Fleet' })
  } else if (nav.level === 'vehicle') {
    if (!fleetOnly) crumbs.push({ label: 'Fleet', to: { level: 'fleet' } })
    crumbs.push({ label: plateOf(nav.truckId) })
  } else if (nav.level === 'review') {
    crumbs.push({ label: 'Awaiting review' })
  } else if (nav.level === 'archived') {
    crumbs.push({ label: 'Archived' })
  }

  // Enter in the search box opens the first matching booking (or folder).
  const openFirst = () => {
    const firstBooking = bookingMatches[0]
    if (firstBooking?.id) return go({ level: 'booking', bookingId: firstBooking.id })
    const r = folders[0]
    if (!r) return
    if (nav.level === 'fleet') { if (r.id) go({ level: 'vehicle', truckId: r.id }); return }
    if (r.kind === 'fleet') return go({ level: 'fleet' })
    if (r.kind === 'client') return go({ level: 'client', clientId: r.id ?? 'none' })
  }

  const typeOptions: FilterOption[] = [...DERIVED_DOCUMENT_TYPES, ...STAFF_DOCUMENT_TYPES]
    .filter((t) => (counts.by_type[t] ?? 0) > 0 || types.includes(t))
    .map((t) => ({ value: t, label: `${DOCUMENT_TYPE_LABELS[t]} (${counts.by_type[t] ?? 0})` }))

  // The file table's third column: the booking a vehicle's file belongs to,
  // or (across folders) the booking or plate. Not inside one booking or a
  // client's own documents.
  const refColumn: 'booking' | 'both' | null =
    nav.level === 'vehicle' ? 'booking'
      : nav.level === 'review' || nav.level === 'archived' ? 'both'
      : null

  const topTab: 'all' | 'clients' | 'fleet' | 'archived' | null =
    nav.level === 'fleet' ? 'fleet'
      : nav.level === 'archived' ? 'archived'
      : nav.level === 'root' ? (nav.only === 'clients' ? 'clients' : 'all')
      : null
  const archivedView = nav.level === 'archived'

  // Where an upload goes from here: this booking, vehicle or client's
  // documents; anywhere else the form first asks what the document is for.
  const uploadTarget: UploadTarget | null =
    fleetOnly || nav.level === 'fleet' || nav.level === 'vehicle' ? 'vehicle'
      : nav.level === 'booking' ? 'booking'
      : clientDocs ? 'client'
      : nav.level === 'client' && nav.section === 'bookings' ? 'booking'
      : null

  const searchPlaceholder =
    nav.level === 'root' ? 'Search client or booking'
      : nav.level === 'client' && !clientDocs ? 'Search booking'
      : nav.level === 'fleet' ? 'Search plate'
      : nav.level === 'vehicle' ? 'Search file, booking or uploader'
      : clientDocs ? 'Search file or uploader'
      : 'Search file, booking, client, plate or uploader'

  // ── Render ─────────────────────────────────────────────────────────────

  const emptyTitle = hasFileFilters ? undefined
    : nav.level === 'review' ? 'Nothing waiting for review'
    : archivedView ? 'No archived documents'
    : 'No documents in this folder yet'
  const emptyMessage = hasFileFilters ? 'No documents match your search or filters.'
    : nav.level === 'review' ? 'Uploads waiting for another reviewer appear here.'
    : archivedView ? 'Archived documents appear here.'
    : clientDocs ? 'Contracts and other paperwork for this client appear here.'
    : 'Files uploaded or recorded for this folder appear here.'

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden ff-sc bg-[var(--color-bg)]">
      {/* The same page frame as User Management, Vehicle Management and the other
          Archive tabs, so the table card is the same size when switching tabs. */}
      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 sm:px-4 lg:px-5 3xl:px-6 lg:pt-3 lg:pb-4 3xl:pb-5 gap-3 3xl:gap-4 lg:overflow-hidden">
        {/* Where you are (Figma): small-caps crumbs, grey with chevrons, the
            current one cyan. Not in the Archive module. */}
        {!archive && (
          <nav aria-label="Breadcrumb" className="shrink-0">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base 3xl:text-lg">
              {crumbs.map((c, i) => {
                const current = i === crumbs.length - 1
                return (
                  <Fragment key={i}>
                    {i > 0 && (
                      <li aria-hidden className="flex items-center text-[#c4c4c4]">
                        <ChevronRight size={16} />
                      </li>
                    )}
                    <li className="flex min-w-0 items-center">
                      {current || !c.to ? (
                        <span aria-current={current ? 'page' : undefined} className={`truncate ${current ? 'text-[#4df9ed]' : 'text-[#c4c4c4]'}`}>
                          {c.label}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => go(c.to!)}
                          className="truncate rounded-md text-[#c4c4c4] outline-[#4df9ed] focus-visible:outline-2 focus-visible:outline-offset-2 [@media(hover:hover)]:hover:text-white"
                        >
                          {c.label}
                        </button>
                      )}
                    </li>
                  </Fragment>
                )
              })}
            </ol>
          </nav>
        )}

        {/* The table format (Figma 3234:790): the filter row with the card's
            buttons at its far right, then folders or files. */}
        <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">
          <FilterBar
            layout="split"
            trailing={(atHome && pendingTotal > 0) || (isFiles && canExport) || (canCreate && !archivedView) ? (
              <>
                {atHome && pendingTotal > 0 && (
                  <Button size="toolbar" color="tool" onClick={() => go({ level: 'review' })}>
                    Awaiting review ({pendingTotal})
                  </Button>
                )}
                {isFiles && canExport && selected.size > 0 && (
                  <span className="ff-regular self-center whitespace-nowrap text-sm text-[#c4c4c4]">
                    {selected.size.toLocaleString()} selected ·{' '}
                    <button type="button" onClick={() => setSelected(new Map())} className="text-[#4df9ed] underline-offset-2 [@media(hover:hover)]:hover:underline">
                      Clear
                    </button>
                  </span>
                )}
                {isFiles && canExport && (
                  <Tip label={selected.size === 0
                      ? 'Download every document shown here (all pages) as one ZIP, with a list of them'
                      : 'Download the ticked documents as one ZIP, with a list of them'}><Button size="toolbar" color="tool" iconLeading={Download} onClick={() => void handleExport()} disabled={exporting || (selected.size === 0 && total === 0)}>
                    {exporting ? 'Downloading…' : selected.size === 0 ? 'Download All' : 'Download Selected Files'}
                  </Button></Tip>
                )}
                {canCreate && !archivedView && (
                  <Button size="toolbar" color="accent" iconLeading={Upload01} onClick={() => setUploadOpen(true)}>
                    Upload Document
                  </Button>
                )}
              </>
            ) : undefined}
            // All / Clients / Fleet on the top-level views (a dropdown on phones);
            // the Archive module's own switcher on its archived list.
            leading={archive ?? (topTab && (
              <TabsMinimal
                label="Show"
                // The Fleet Manager: Fleet only.
                items={[
                  ...(fleetOnly ? [] : [
                    { id: 'all' as const,      label: 'All' },
                    { id: 'clients' as const,  label: `Clients (${clients.length})` },
                  ]),
                  { id: 'fleet' as const,    label: `Fleet (${vehicles.length})` },
                ]}
                selectedKey={topTab === 'archived' ? 'all' : topTab}
                onSelectionChange={(k) => go(
                  k === 'fleet' ? { level: 'fleet' }
                    : k === 'clients' ? { level: 'root', only: 'clients' } : { level: 'root' },
                )}
              />
            ))}
            search={{
              value: searchInput,
              onChange: setSearchInput,
              placeholder: searchPlaceholder,
              onEnter: isFiles ? undefined : openFirst,
            }}
            dateRange={isFiles ? { value: dateRange, onChange: setDateRange } : undefined}
            fields={isFiles ? [
              { key: 'type',     label: 'Type',     options: typeOptions },
              ...(nav.level === 'review' ? [] : [{ key: 'review', label: 'Review', single: true, options: REVIEW_OPTIONS }]),
              { key: 'sort',     label: 'Order',    single: true, options: SORT_OPTIONS },
            ] : []}
            values={[
              ...types.map((t) => ({ field: 'type', op: 'is' as const, value: t })),
              ...(review ? [{ field: 'review', op: 'is' as const, value: review }] : []),
              ...(sort !== 'desc' ? [{ field: 'sort', op: 'is' as const, value: sort }] : []),
            ]}
            onChange={(v) => {
              setTypes(v.filter((r) => r.field === 'type' && r.op === 'is').map((r) => r.value as LibraryDocumentType))
              setReview((pick(v, 'review') ?? '') as ReviewStatus | '')
              setSort(pick(v, 'sort') === 'asc' ? 'asc' : 'desc')
            }}
            actions={
              <>
                {isFiles && (
                  // The table format's switch: a #181717 well, the picked view a #2a2828 block.
                  <div className="flex h-[38px] 3xl:h-[44px] shrink-0 rounded-[10px] border border-[#343434] bg-[#181717]" role="group" aria-label="Layout">
                    <button type="button" onClick={() => changeView('table')} aria-label="List view" aria-pressed={view === 'table'}
                      className={`-m-px flex w-[38px] 3xl:w-[44px] items-center justify-center rounded-[10px] border ${view === 'table' ? 'border-[#343434] bg-[#2a2828] text-white' : 'border-transparent text-[#818181] [@media(hover:hover)]:hover:text-white'}`}>
                      <List size={18} />
                    </button>
                    <button type="button" onClick={() => changeView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}
                      className={`-m-px flex w-[38px] 3xl:w-[44px] items-center justify-center rounded-[10px] border ${view === 'grid' ? 'border-[#343434] bg-[#2a2828] text-white' : 'border-transparent text-[#818181] [@media(hover:hover)]:hover:text-white'}`}>
                      <LayoutGrid size={18} />
                    </button>
                  </div>
                )}
                {/* No Refresh: the page is live (live:documents, below). */}
              </>
            }
          />

          {isFiles ? (
            <>
              {loading ? (
                <Spinner label="Loading documents…" />
              ) : error ? (
                <ErrorState message={error} onRetry={() => void load()} />
              ) : docs.length === 0 && view === 'grid' ? (
                <TableEmptyState icon={FileSearch} filtered={hasFileFilters} title={emptyTitle} message={emptyMessage} onClear={resetFilters} />
              ) : view === 'grid' ? (
                <div className="overflow-x-auto lg:overflow-auto flex-[1_0_auto] lg:flex-1 lg:min-h-0 p-4 md:p-6">
                  {/* Figma grid card: the file on top, then its type (cyan) with
                      the menu, its booking or plate and date, its name and who
                      uploaded it. */}
                  <div className="grid gap-4 grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5">
                    {docs.map((d) => (
                      <div
                        key={d.doc_key}
                        className={`group relative cursor-pointer rounded-[14px] border bg-[#1b1b1b] p-2.5 transition-colors [@media(hover:hover)]:hover:bg-[#222222] ${selected.has(d.doc_key) ? 'border-[#4df9ed]' : 'border-[#424242]'}`}
                        onClick={() => setPreviewKey(d.doc_key)}
                      >
                        {canExport && (
                          <label
                            className="absolute left-4 top-4 z-[1] flex cursor-pointer rounded-md bg-black/70 p-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectBox checked={selected.has(d.doc_key)} onChange={() => toggleDoc(d)} label={`Select ${d.file_name}`} />
                          </label>
                        )}
                        <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[10px] bg-[#151515]">
                          {previewKind(d.file_url) === 'image' ? (
                            <ProtectedImg src={d.file_url} alt="" loading="lazy" className="size-full object-cover" />
                          ) : (
                            <span className="flex flex-col items-center gap-1.5 text-[#818181]">
                              <FileIcon size={26} strokeWidth={1.5} />
                              <span className="max-w-[90%] truncate text-[10px] font-bold uppercase">{d.file_name.split('.').pop()}</span>
                            </span>
                          )}
                        </div>
                        <div className="mt-2.5 min-w-0 px-1 pb-1">
                          <div className="flex items-start justify-between gap-1">
                            <p className="min-w-0 truncate font-[family-name:var(--font-darker)] text-base font-bold uppercase leading-tight text-[#4df9ed]">
                              {documentTypeLabel(d)}
                            </p>
                            <div onClick={(e) => e.stopPropagation()} className="-mr-1 -mt-1 shrink-0">
                              <RowActionMenu label={`Actions for ${d.file_name}`} heading={d.file_name} actions={rowActions(d)} />
                            </div>
                          </div>
                          <p className="truncate font-[family-name:var(--font-darker)] text-xs font-bold text-white">
                            {[d.reference_number ?? d.plate_number, d.uploaded_at && formatDate(d.uploaded_at)].filter(Boolean).join(' · ') || '—'}
                          </p>
                          <Tip label={d.file_name}>
                            <p className="mt-3 truncate font-[family-name:var(--font-darker)] text-base font-bold text-white">{d.file_name}</p>
                          </Tip>
                          <p className={`${SUB} truncate`}>{uploaderLine(d)}</p>
                          <div className="mt-2 flex items-center gap-1.5 text-xs">
                            <DocStatusText doc={d} />
                            {d.override_reason && <Tip label="Taken away from the stop"><span><MapPinOff size={12} className="text-[#ff7a30]" /></span></Tip>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col overflow-x-auto lg:overflow-auto flex-[1_0_auto] lg:flex-1 lg:min-h-0">
                  <table className="data-table min-w-[860px]">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {canExport && (
                          <th className="w-12">
                            <SelectBox
                              checked={allPageSelected}
                              indeterminate={pageSelected > 0 && !allPageSelected}
                              onChange={togglePage}
                              label={allPageSelected ? 'Clear this page' : 'Select every document on this page'}
                            />
                          </th>
                        )}
                        <th>Document</th>
                        <th>Type</th>
                        {refColumn === 'booking' && <th>Booking Assigned</th>}
                        {refColumn === 'both' && <th>Booking / Vehicle</th>}
                        <th className="hidden xl:table-cell">Details</th>
                        <th>Uploaded</th>
                        <th>Status</th>
                        <th className="w-[60px]"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((d) => (
                        <tr
                          key={d.doc_key}
                          className={`cursor-pointer transition-colors [@media(hover:hover)]:hover:bg-[#2a2a2a]/40 ${selected.has(d.doc_key) ? 'bg-[#4df9ed]/[0.06]' : ''}`}
                          onClick={() => setPreviewKey(d.doc_key)}
                        >
                          {canExport && (
                            <td className="w-12" onClick={(e) => e.stopPropagation()}>
                              <label className="-m-2 flex cursor-pointer p-2">
                                <SelectBox checked={selected.has(d.doc_key)} onChange={() => toggleDoc(d)} label={`Select ${d.file_name}`} />
                              </label>
                            </td>
                          )}
                          <td>
                            <div className="flex min-w-0 max-w-[320px] items-center gap-3">
                              <FileTile doc={d} />
                              <div className="min-w-0">
                                <TruncatedText as="p" className="t-name">{d.file_name}</TruncatedText>
                                <TruncatedText as="p" className={SUB}>{uploaderLine(d)}</TruncatedText>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap uppercase">{documentTypeLabel(d)}</td>
                          {refColumn === 'booking' && <td className="whitespace-nowrap">{d.reference_number ?? NONE}</td>}
                          {refColumn === 'both' && (
                            <td>
                              {d.reference_number ? (
                                <>
                                  <p className="whitespace-nowrap">{d.reference_number}</p>
                                  <TruncatedText as="p" className="max-w-[200px] text-xs text-[#818181]">{d.company_name ?? '—'}</TruncatedText>
                                </>
                              ) : null}
                              {d.plate_number && <p className={d.reference_number ? 'text-xs text-[#818181]' : ''}>{d.plate_number}</p>}
                              {!d.reference_number && !d.plate_number && NONE}
                            </td>
                          )}
                          <td className="hidden xl:table-cell">
                            <TruncatedText as="p" className="max-w-[260px] font-normal text-[#c4c4c4]">{d.detail ?? d.notes ?? '—'}</TruncatedText>
                            {d.override_reason && (
                              <Tip label={d.override_reason}><p className="mt-0.5 flex items-center gap-1 text-xs text-[#ff7a30]">
                                <MapPinOff size={11} /> Taken away from the stop
                              </p></Tip>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            <p className="tabular-nums">{formatDate(d.uploaded_at)}</p>
                            <p className="tabular-nums text-xs text-[#818181]">{d.uploaded_at ? formatTime(d.uploaded_at) : ''}</p>
                          </td>
                          <td><DocStatusText doc={d} /></td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end">
                              <RowActionMenu label={`Actions for ${d.file_name}`} heading={d.file_name} actions={rowActions(d)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {docs.length === 0 && (
                    <TableEmptyState icon={FileSearch} filtered={hasFileFilters} title={emptyTitle} message={emptyMessage} onClear={resetFilters} />
                  )}
                </div>
              )}
              {!loading && !error && total > 0 && (
                <Pagination page={page} totalPages={pages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
              )}
            </>
          ) : showSections ? (
            // A client's two folders (Figma "client [files]").
            !sections && !sectionsError ? (
              <Spinner label="Loading folders…" />
            ) : sectionsError ? (
              <ErrorState message={sectionsError} onRetry={() => void loadSections()} />
            ) : (
              <div className="flex flex-col overflow-x-auto lg:overflow-auto flex-[1_0_auto] lg:flex-1 lg:min-h-0">
                <table className="data-table min-w-[620px]">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th>Name</th>
                      <th>Files</th>
                      <th>Awaiting Review</th>
                      <th>Last Upload</th>
                      <th className={CHEVRON_TD}><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(nav.level === 'client' ? (['bookings', 'documents'] as const).filter((s) => s === 'bookings' || nav.clientId !== 'none') : []).map((s) => {
                      const t = sections![s]
                      const to: Nav = { level: 'client', clientId: nav.level === 'client' ? nav.clientId : 'none', section: s }
                      return (
                        <FolderTr key={s} onOpen={() => go(to)}>
                          <td>
                            <div className="flex min-w-0 items-center gap-3">
                              <RowIconTile><FolderOpen className="size-5" strokeWidth={1.5} /></RowIconTile>
                              <p className="t-name uppercase">{s === 'bookings' ? 'Bookings' : 'Documents'}</p>
                            </div>
                          </td>
                          <td className="tabular-nums font-normal">{plural(t.files, 'file')}</td>
                          <td><PendingCount n={t.pending} /></td>
                          <td className="whitespace-nowrap font-normal">{t.last ? formatDate(t.last) : NONE}</td>
                          <td className={CHEVRON_TD}><ChevronRight size={20} className="ml-auto text-[#4df9ed]" /></td>
                        </FolderTr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <>
              {folderLoading ? (
                <Spinner label="Loading folders…" />
              ) : folderError ? (
                <ErrorState message={folderError} onRetry={() => void loadFolders()} />
              ) : (
                <div className="flex flex-col overflow-x-auto lg:overflow-auto flex-[1_0_auto] lg:flex-1 lg:min-h-0">
                  {nav.level === 'fleet' ? (
                    // Fleet (Figma "fleet"): each vehicle with its photo, regular
                    // driver, type, model and status.
                    <table className="data-table min-w-[980px]">
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <th>Name</th>
                          <th>Assigned Driver</th>
                          <th>Vehicle Type</th>
                          <th>Model</th>
                          <th>Status</th>
                          <th>Files</th>
                          <th>Last Upload</th>
                          <th className={CHEVRON_TD}><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {folders.map((v) => {
                          const st = v.vehicle_status ? statusStyle(v.vehicle_status) : null
                          return (
                            <FolderTr key={v.id ?? 'none'} onOpen={() => v.id && go({ level: 'vehicle', truckId: v.id })}>
                              <td>
                                <div className="flex min-w-0 items-center gap-3">
                                  <ModelThumb imageUrl={resolveModelImageUrl(v.model_image_url ?? null)} label={v.model_name ?? 'Vehicle'} size={44} />
                                  <div className="min-w-0">
                                    <TruncatedText as="p" className="t-name">{v.name ?? 'No plate on record'}</TruncatedText>
                                    <p className={SUB}>Vehicle</p>
                                  </div>
                                </div>
                              </td>
                              <td className="font-normal"><TruncatedText as="p" className="max-w-[220px]">{v.driver_name ?? '—'}</TruncatedText></td>
                              <td className="whitespace-nowrap font-normal">{v.vehicle_type ?? '—'}</td>
                              <td className="font-normal"><TruncatedText as="p" className="max-w-[220px]">{v.model_name ?? '—'}</TruncatedText></td>
                              <td>
                                {st && v.vehicle_status ? (
                                  <span className={TABLE_TAG} style={{ color: st.color, borderColor: st.border, background: st.bg }}>{fmtLabel(v.vehicle_status)}</span>
                                ) : '—'}
                              </td>
                              <td className="tabular-nums font-normal">{plural(v.file_count, 'file')}</td>
                              <td className="whitespace-nowrap font-normal">{v.last_upload ? formatDate(v.last_upload) : NONE}</td>
                              <td className={CHEVRON_TD}><ChevronRight size={20} className="ml-auto text-[#4df9ed]" /></td>
                            </FolderTr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : (
                    // The top level (Figma "documents table") and a client's
                    // bookings (Figma "client [bookings]").
                    <table className="data-table min-w-[760px]">
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <th>Name</th>
                          <th>{nav.level === 'root' ? 'Contents' : 'Status'}</th>
                          <th>Files</th>
                          <th>Awaiting Review</th>
                          <th>Last Upload</th>
                          <th className={CHEVRON_TD}><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {folders.map((r) => {
                          const isBooking = nav.level === 'client' || r.kind === 'booking'
                          const isFleet   = r.kind === 'fleet'
                          const to: Nav = isFleet ? { level: 'fleet' }
                            : isBooking ? { level: 'booking', bookingId: r.id ?? '' }
                            : { level: 'client', clientId: r.id ?? 'none' }
                          const name = isFleet ? 'Fleet' : r.name ?? (isBooking ? 'Booking' : 'No client on record')
                          const sub  = isFleet ? 'Fleet'
                            : isBooking ? (nav.level === 'root' ? (r.company_name ?? 'No client on record') : r.schedule_date ? `Scheduled ${formatDate(r.schedule_date)}` : 'Booking')
                            : 'Client'
                          return (
                            <FolderTr key={`${r.kind ?? 'b'}:${r.id ?? 'none'}`} onOpen={() => go(to)}>
                              <td>
                                <div className="flex min-w-0 items-center gap-3">
                                  <RowIconTile>
                                    {isFleet ? <Truck01 className="size-5" /> : <FolderOpen className="size-5" strokeWidth={1.5} />}
                                  </RowIconTile>
                                  <div className="min-w-0">
                                    <TruncatedText as="p" className="t-name">{name}</TruncatedText>
                                    <TruncatedText as="p" className={SUB}>{sub}</TruncatedText>
                                  </div>
                                </div>
                              </td>
                              <td className="font-normal">
                                {isBooking ? <BookingStatusTag booking={bookingOfFolder(r)} staff />
                                  : isFleet ? plural(r.booking_count, 'vehicle')
                                  : plural(r.booking_count, 'booking')}
                              </td>
                              <td className="tabular-nums font-normal">{plural(r.file_count, 'file')}</td>
                              <td><PendingCount n={r.pending_review} /></td>
                              <td className="whitespace-nowrap font-normal">{r.last_upload ? formatDate(r.last_upload) : NONE}</td>
                              <td className={CHEVRON_TD}><ChevronRight size={20} className="ml-auto text-[#4df9ed]" /></td>
                            </FolderTr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  {folders.length === 0 && (
                    <TableEmptyState
                      icon={FileSearch}
                      filtered={!!search}
                      title={search ? undefined : 'No documents yet'}
                      message={search ? 'Nothing matches your search.' : 'Folders appear once a file is recorded or uploaded.'}
                      onClear={resetFilters}
                    />
                  )}
                </div>
              )}
              {!folderLoading && !folderError && folders.length > 0 && (
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
        initialTarget={uploadTarget}
        // Inside a booking's folder the upload goes to that booking.
        initialBooking={nav.level === 'booking' && bookingInfo?.id ? {
          booking_id:       bookingInfo.id,
          reference_number: bookingInfo.name,
          status:           bookingInfo.booking_status ?? '',
          schedule_date:    bookingInfo.schedule_date,
          company_name:     bookingInfo.company_name,
        } : null}
        // Inside a client's folder, its paperwork goes to that client.
        initialClient={nav.level === 'client' && nav.clientId !== 'none'
          ? { client_id: nav.clientId, company_name: clientName(nav.clientId) }
          : null}
        // Inside a vehicle's folder the upload goes to that vehicle.
        initialTruck={nav.level === 'vehicle'
          ? { truck_id: nav.truckId, plate_number: plateOf(nav.truckId), description: null }
          : null}
        vehicleOnly={fleetOnly}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => reloadAll(true)}
      />

      <ReusableModal
        open={!!approveOf}
        title="Approve document?"
        description={approveOf
          ? `Approve "${approveOf.file_name}" as the ${documentTypeLabel(approveOf).toLowerCase()} for ${approveOf.reference_number ?? approveOf.company_name ?? approveOf.plate_number ?? 'this booking'}.`
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
          ? `"${archiveOf.file_name}" will be hidden from the library. The file is kept and can be restored from Archive.`
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

/** A folder row: the whole row opens it (click, Enter or Space). */
function FolderTr({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }) {
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="cursor-pointer transition-colors [@media(hover:hover)]:hover:bg-[#2a2a2a]/40"
    >
      {children}
    </tr>
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
