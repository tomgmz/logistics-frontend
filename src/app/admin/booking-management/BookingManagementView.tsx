'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Calendar,
  Clock,
  Truck,
  Building2,
  User,
  UserCheck,
  Package,
  Weight,
  Layers,
  Ruler,
} from 'lucide-react'

import { statusColor } from '@/components/map/status.colors'
import type { BookingDetail } from '@/app/types/maps/routemap.types'
import {
  bookingService,
  type AdminBookingLifecycleStatus,
  type DestinationDeliveryStatus,
} from '@/lib/services/client/booking.service'
import {
  assignmentService,
  type AssignmentRecord,
} from '@/lib/services/admin/assignment.service'
import { driverService } from '@/lib/services/admin/user-management.service'
import { adminFetchTrucks } from '@/lib/services/admin/trucks.service'
import type { DriverUser } from '@/app/types/admin/user-management.types'
import type { Truck as TruckType } from '@/app/types/truck.types'
import { nowDate } from '@/app/utils/serverTime'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import ReusableModal, { RemarksModal } from '@/components/layout/ReusableModal'

const PAGE_SIZE = 12

const BOOKING_STATUSES: AdminBookingLifecycleStatus[] = [
  'pending',
  'approved',
  'assigned',
  'in_transit',
  'completed',
  'cancelled',
]

const DEST_STATUSES: DestinationDeliveryStatus[] = ['pending', 'delivered', 'failed']

type DetailWithExtra = BookingDetail & {
  transaction_documents?: string[] | null
  required_weight_kg?: number | null
  required_volume_cbm?: number | null
  required_length_cm?: number | null
  stackable_required?: boolean | null
}

type CargoItem = NonNullable<BookingDetail['booking_cargo_items']>[number]

function fileNameFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/')
    const raw = decodeURIComponent(parts[parts.length - 1] || url)
    return raw.replace(/(\.[a-zA-Z0-9]+)\1+$/i, '$1')
  } catch {
    return url.split('/').pop() ?? url
  }
}

function fmtStatus(s: string) {
  return (s ?? '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function normalizeBookingStatus(raw: string): AdminBookingLifecycleStatus {
  const s = (raw ?? '').toLowerCase().replace(/\s+/g, '_') as AdminBookingLifecycleStatus
  return BOOKING_STATUSES.includes(s) ? s : 'pending'
}

function getAssignedTruckId(detail: BookingDetail, trucks: TruckType[]): string {
  const assignedPlate = detail.driver?.truck?.plate_number
  if (!assignedPlate) return ''
  const truck = trucks.find((t) => t.plate_number === assignedPlate)
  return truck?.truck_id ?? ''
}

function getPrefillFromBookingDetail(detail: BookingDetail, trucks: TruckType[]) {
  return {
    driverId: detail.driver?.driver_id ?? '',
    truckId:  getAssignedTruckId(detail, trucks),
  }
}

interface ListRow {
  booking_id: string
  display_id: string
  origin?: string
  status: string
  schedule_date?: string
  truck_type_needed?: string
  company?: string | null
  stops: number
}

function toRows(raw: Record<string, unknown>[]): ListRow[] {
  return raw.map((b) => {
    const clients = b.clients as { company_name?: string | null } | undefined
    const dests   = b.booking_destinations as unknown[] | undefined
    const referenceNumber = typeof b.reference_number === 'string' && b.reference_number.trim()
      ? b.reference_number
      : undefined

    return {
      booking_id:        String(b.booking_id ?? ''),
      display_id:        referenceNumber ?? String(b.booking_id ?? '').slice(0, 8).toUpperCase(),
      origin:            typeof b.origin === 'string' ? b.origin : undefined,
      status:            typeof b.status === 'string' ? b.status : 'pending',
      schedule_date:     typeof b.schedule_date === 'string' ? b.schedule_date : undefined,
      truck_type_needed: typeof b.truck_type_needed === 'string' ? b.truck_type_needed : undefined,
      company:           clients?.company_name ?? null,
      stops:             Array.isArray(dests) ? dests.length : 0,
    }
  })
}

function resolveLabel(
  id: string | null | undefined,
  text: string | null | undefined,
  joined: { name: string } | null | undefined,
): string | null {
  if (joined?.name) return joined.name
  if (text)         return text
  if (id)           return id
  return null
}

function fmtNum(n: number | null | undefined, unit: string, decimals = 2): string | null {
  if (n == null || n === 0) return null
  return `${n.toFixed(decimals)} ${unit}`
}

// ── AssignmentPanel ───────────────────────────────────────────────────────────

function AssignmentPanel({
  detail,
  drivers,
  trucks,
  assignDriverId,
  assignTruckId,
  assignBusy,
  assignEditMode,
  selectClass,
  onDriverChange,
  onTruckChange,
  onAssign,
  onEditClick,
  onCancelEdit,
}: {
  detail:          BookingDetail
  drivers:         DriverUser[]
  trucks:          TruckType[]
  assignDriverId:  string
  assignTruckId:   string
  assignBusy:      boolean
  assignEditMode:  boolean
  selectClass:     string
  onDriverChange:  (id: string) => void
  onTruckChange:   (id: string) => void
  onAssign:        () => void
  onEditClick:     () => void
  onCancelEdit:    () => void
}) {
  const isAssigned = normalizeBookingStatus(detail.status) === 'assigned'
  const locked     = isAssigned && !assignEditMode

  const driverLabel = (() => {
    const dr = drivers.find((d) => (d.drivers?.driver_id ?? d.user_id) === assignDriverId)
    if (!dr) return assignDriverId || '—'
    return `${dr.first_name} ${dr.last_name}${dr.drivers?.license_number ? ` · ${dr.drivers.license_number}` : ''}`
  })()

  const truckLabel = (() => {
    const t = trucks.find((t) => t.truck_id === assignTruckId)
    if (!t) return assignTruckId || '—'
    return `${t.plate_number}${t.vehicle_type ? ` · ${t.vehicle_type}` : ''}`
  })()

  return (
    <div className="rounded-xl border border-white/[0.08] p-3 space-y-3 bg-black/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCheck size={14} className="text-[var(--color-cyan)]" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">
            Driver and vehicle assignment
          </h3>
        </div>
        {locked && (
          <button
            type="button"
            onClick={onEditClick}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-white/10
                       text-white/50 hover:text-white hover:border-white/25 transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {locked ? (
        <div className="space-y-2 text-sm text-white/70">
          <div className="flex items-center gap-2">
            <User size={13} className="text-white/35 shrink-0" />
            <span>{driverLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <Truck size={13} className="text-white/35 shrink-0" />
            <span>{truckLabel}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Driver</label>
              <select
                value={assignDriverId}
                disabled={assignBusy}
                onChange={(e) => onDriverChange(e.target.value)}
                className={selectClass}
              >
                <option value="">Select driver</option>
                {drivers.map((dr) => (
                  <option key={dr.user_id} value={dr.drivers?.driver_id ?? dr.user_id}>
                    {dr.first_name} {dr.last_name}
                    {dr.drivers?.license_number ? ` · ${dr.drivers.license_number}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Vehicle</label>
              <select
                value={assignTruckId}
                disabled={assignBusy}
                onChange={(e) => onTruckChange(e.target.value)}
                className={selectClass}
              >
                <option value="">Select vehicle</option>
                {trucks.map((t) => (
                  <option key={t.truck_id} value={t.truck_id}>
                    {t.plate_number}
                    {t.vehicle_type ? ` · ${t.vehicle_type}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            {assignEditMode && (
              <button
                type="button"
                disabled={assignBusy}
                onClick={onCancelEdit}
                className="flex-1 py-2 rounded-lg text-sm font-bold border border-white/10
                           text-white/50 hover:text-white transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={assignBusy || !assignDriverId || !assignTruckId}
              onClick={onAssign}
              className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
              style={{
                background: 'rgba(77,249,237,0.12)',
                border:     '1px solid rgba(77,249,237,0.30)',
                color:      'var(--color-cyan)',
              }}
            >
              {assignBusy ? 'Assigning…' : assignEditMode ? 'Update' : 'Assign'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── TransactionDocs ───────────────────────────────────────────────────────────

function TransactionDocs({ docs }: { docs: string[] }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
        Transaction Documents
      </h3>
      <ul className="space-y-1.5">
        {docs.map((url, i) => {
          const filename  = fileNameFromUrl(url) || `Document ${i + 1}`
          const ext       = filename.split('.').pop()?.toLowerCase() ?? ''
          const fileLabel = ext === 'pdf'  ? 'PDF'
                          : ext === 'xlsx' ? 'XLSX'
                          : ext === 'docx' ? 'DOCX'
                          : ext === 'doc'  ? 'DOC'
                          : ext.toUpperCase() || 'FILE'
          return (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-lg border border-white/[0.08]
                           bg-black/20 px-3 py-2 text-sm text-white/80
                           hover:border-[var(--color-cyan)]/40 hover:text-white
                           transition-colors group"
              >
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide
                                 px-1.5 py-0.5 rounded border
                                 border-[var(--color-cyan)]/30 text-[var(--color-cyan)]">
                  {fileLabel}
                </span>
                <span className="flex-1 truncate font-mono text-xs">{filename}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13" height="13" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0 opacity-40 group-hover:opacity-80 transition-opacity"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BookingManagementView() {
  const [rawBookings, setRawBookings] = useState<Record<string, unknown>[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError]     = useState<string | null>(null)
  const [listMeta, setListMeta]       = useState<{
    total: number
    totalPages: number
    statusCounts: Record<string, number>
  } | null>(null)

  const [search, setSearch]               = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter]   = useState<string>('all')
  const [page, setPage]                   = useState(0)

  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [detail, setDetail]               = useState<BookingDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError]     = useState<string | null>(null)

  const [pendingStatus, setPendingStatus] = useState(false)
  const [destBusyId, setDestBusyId]       = useState<string | null>(null)

  const [deleteAskId, setDeleteAskId]     = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy]       = useState(false)
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [rejectModalOpen, setRejectModalOpen]   = useState(false)
  const [pendingReject, setPendingReject]       = useState(false)

  const [drivers, setDrivers]             = useState<DriverUser[]>([])
  const [trucks, setTrucks]               = useState<TruckType[]>([])
  const [allAssignments, setAllAssignments] = useState<AssignmentRecord[]>([])
  const [assignDriverId, setAssignDriverId] = useState<string>('')
  const [assignTruckId, setAssignTruckId]   = useState<string>('')
  const [assignBusy, setAssignBusy]         = useState(false)
  const [assignEditMode, setAssignEditMode] = useState(false)

  const [committedAssignment, setCommittedAssignment] = useState<{
    driverId: string
    truckId: string
  }>({ driverId: '', truckId: '' })

  useEffect(() => {
    void Promise.all([
      driverService.getAll().then(setDrivers).catch(() => setDrivers([])),
      adminFetchTrucks().then(setTrucks).catch(() => setTrucks([])),
      assignmentService.getAll().then(setAllAssignments).catch(() => setAllAssignments([])),
    ])
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(t)
  }, [search])

  const loadPage = useCallback(async () => {
    try {
      setListLoading(true)
      setListError(null)
      const res = await bookingService.fetchBookingsAdminPaginated({
        page:   page + 1,
        limit:  PAGE_SIZE,
        status: statusFilter,
        search: debouncedSearch,
      })
      setRawBookings(res.rows)
      setListMeta({
        total:        res.meta.total,
        totalPages:   res.meta.totalPages,
        statusCounts: res.meta.statusCounts,
      })
      if (res.meta.totalPages >= 1 && page > res.meta.totalPages - 1) {
        setPage(res.meta.totalPages - 1)
      }
    } catch (e) {
      setListError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    } finally {
      setListLoading(false)
    }
  }, [page, statusFilter, debouncedSearch])

  useEffect(() => { void loadPage() }, [loadPage])

  const listRows  = useMemo(() => toRows(rawBookings), [rawBookings])
  const pageCount = Math.max(1, listMeta?.totalPages ?? 1)
  const pageSafe  = Math.min(page, pageCount - 1)
  const totalRows = listMeta?.total ?? 0

  // Assignments active on a different booking
  const busyElsewhere = useMemo(
    () =>
      allAssignments.filter(
        (a) =>
          a.booking_id !== selectedId &&
          (a.status === 'pending' || a.status === 'in_transit'),
      ),
    [allAssignments, selectedId],
  )

  const busyDriverIds = useMemo(
    () => new Set(busyElsewhere.map((a) => a.driver_id).filter(Boolean) as string[]),
    [busyElsewhere],
  )

  const busyTruckIds = useMemo(
    () => new Set(busyElsewhere.map((a) => a.truck_id).filter(Boolean) as string[]),
    [busyElsewhere],
  )

  // Keep the currently-selected option visible even if it belongs to this booking
  const availableDrivers = useMemo(
    () =>
      drivers.filter((dr) => {
        const id = dr.drivers?.driver_id ?? dr.user_id
        return !busyDriverIds.has(id) || id === assignDriverId
      }),
    [drivers, busyDriverIds, assignDriverId],
  )

  const availableTrucks = useMemo(
    () =>
      trucks.filter(
        (t) => !busyTruckIds.has(t.truck_id) || t.truck_id === assignTruckId,
      ),
    [trucks, busyTruckIds, assignTruckId],
  )

  const restoreAssignment = useCallback((detail: BookingDetail, assignment?: { driver_id?: string | null; truck_id?: string | null }) => {
    const fallback = getPrefillFromBookingDetail(detail, trucks)
    const ids = {
      driverId: assignment?.driver_id ?? fallback.driverId,
      truckId:  assignment?.truck_id  ?? fallback.truckId,
    }
    setAssignDriverId(ids.driverId)
    setAssignTruckId(ids.truckId)
    setCommittedAssignment(ids)
  }, [trucks])

  const openDetail = useCallback(async (bookingId: string) => {
    setSelectedId(bookingId)
    setDetail(null)
    setDetailError(null)
    setDeleteAskId(null)
    setApproveModalOpen(false)
    setRejectModalOpen(false)
    setAssignDriverId('')
    setAssignTruckId('')
    setAssignEditMode(false)
    try {
      setDetailLoading(true)
      const [bookingResp, assignmentResp] = await Promise.allSettled([
        bookingService.getBookingById(bookingId),
        assignmentService.getByBookingId(bookingId),
      ])

      if (bookingResp.status !== 'fulfilled') throw bookingResp.reason

      const d = bookingResp.value as BookingDetail
      setDetail(d)

      if (assignmentResp.status === 'fulfilled') {
        restoreAssignment(d, assignmentResp.value)
      } else {
        restoreAssignment(d)
      }
    } catch (e) {
      setDetailError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    } finally {
      setDetailLoading(false)
    }
  }, [restoreAssignment])

  const closeDetail = useCallback(() => {
    setSelectedId(null)
    setDetail(null)
    setDetailError(null)
    setDeleteAskId(null)
    setApproveModalOpen(false)
    setRejectModalOpen(false)
    setAssignDriverId('')
    setAssignTruckId('')
    setAssignEditMode(false)
    setCommittedAssignment({ driverId: '', truckId: '' })
  }, [])

  const mergeListRow = useCallback((bookingId: string, patch: Partial<ListRow>) => {
    setRawBookings((prev) =>
      prev.map((b) => String(b.booking_id) !== bookingId ? b : { ...b, ...patch }),
    )
  }, [])

  const handleDestStatus = async (destinationId: string, status: DestinationDeliveryStatus) => {
    setDestBusyId(destinationId)
    try {
      const deliveredAt = status === 'delivered' ? nowDate().toISOString() : undefined
      await bookingService.updateDestinationStatus(destinationId, status, deliveredAt)
      if (selectedId) await openDetail(selectedId)
      await loadPage()
      appToast.success('Stop updated.', { action: 'dest-status', entityId: destinationId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'dest-status', entityId: destinationId })
    } finally {
      setDestBusyId(null)
    }
  }

  const handleDeleteDest = async () => {
    if (!deleteAskId) return
    setDeleteBusy(true)
    try {
      await bookingService.deleteDestinationAdmin(deleteAskId)
      setDeleteAskId(null)
      if (selectedId) await openDetail(selectedId)
      await loadPage()
      appToast.success('Stop removed.', { action: 'dest-delete', entityId: deleteAskId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'dest-delete', entityId: deleteAskId ?? '' })
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedId || !assignDriverId || !assignTruckId) return
    setAssignBusy(true)
    try {
      await assignmentService.assignBooking(selectedId, {
        driver_id: assignDriverId,
        truck_id:  assignTruckId,
      })
      setCommittedAssignment({ driverId: assignDriverId, truckId: assignTruckId })
      setAssignEditMode(false)
      await openDetail(selectedId)
      await loadPage()
      // Refresh the global busy-set so subsequent opens reflect the new assignment
      assignmentService.getAll().then(setAllAssignments).catch(() => null)
      appToast.success('Driver and vehicle assigned.', { action: 'assign', entityId: selectedId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'assign', entityId: selectedId })
    } finally {
      setAssignBusy(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedId || !detail) return
    setApproveModalOpen(false)
    setPendingStatus(true)
    try {
      await bookingService.updateBookingStatusAdmin(selectedId, 'approved')
      setDetail({ ...detail, status: 'approved' })
      mergeListRow(selectedId, { status: 'approved' })
      appToast.success('Booking approved.', { action: 'booking-status', entityId: selectedId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'booking-status', entityId: selectedId })
    } finally {
      setPendingStatus(false)
    }
  }

  const handleReject = async (remarks: string) => {
    if (!selectedId || !detail) return
    setRejectModalOpen(false)
    setPendingReject(true)
    try {
      await bookingService.updateBookingStatusAdmin(selectedId, 'cancelled')
      void remarks
      setDetail({ ...detail, status: 'cancelled' })
      mergeListRow(selectedId, { status: 'cancelled' })
      appToast.success('Booking rejected.', { action: 'booking-status', entityId: selectedId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'booking-status', entityId: selectedId })
    } finally {
      setPendingReject(false)
    }
  }

  const statusCounts = listMeta?.statusCounts ?? { all: 0 }

  const selectClass =
    'w-full rounded-lg border border-white/10 bg-[#1a1a1a] text-sm text-white px-3 py-2.5 outline-none focus:border-[var(--color-cyan)]/50 disabled:opacity-50'

  const deleteAskAddress = useMemo(() => {
    if (!deleteAskId || !detail) return ''
    return detail.booking_destinations?.find((d) => d.destination_id === deleteAskId)?.address ?? ''
  }, [deleteAskId, detail])

  const docCount = ((detail as DetailWithExtra | null)?.transaction_documents?.length) ?? 0
  const d        = detail as DetailWithExtra | null
  const cargoItems: CargoItem[] = d?.booking_cargo_items ?? []

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-body bg-[var(--color-bg)]">

      <ReusableModal
        open={approveModalOpen}
        title="Approve this booking?"
        description={
          docCount > 0
            ? `Please confirm you have reviewed all ${docCount} transaction document${docCount > 1 ? 's' : ''} submitted by the client before proceeding. Approving cannot be undone.`
            : 'Please confirm you have reviewed all client-submitted documents and details before proceeding. Approving cannot be undone.'
        }
        confirmLabel="Approve"
        cancelLabel="Go back"
        onConfirm={() => void handleApprove()}
        onCancel={() => setApproveModalOpen(false)}
        disableBackdropClose={pendingStatus}
      />

      <RemarksModal
        open={rejectModalOpen}
        title="Reject this booking?"
        description="This booking will be marked as cancelled. Please provide a reason before proceeding."
        remarksLabel="Reason for rejection"
        remarksPlaceholder="e.g. Incomplete documents, route not serviceable…"
        confirmLabel="Reject"
        cancelLabel="Go back"
        onConfirm={(remarks) => void handleReject(remarks)}
        onCancel={() => setRejectModalOpen(false)}
        disableBackdropClose={pendingReject}
        busy={pendingReject}
      />

      <ReusableModal
        open={!!deleteAskId}
        title="Remove this stop?"
        description={
          deleteAskAddress
            ? `"${deleteAskAddress}" will be permanently removed from the booking. This cannot be undone.`
            : 'This stop will be permanently removed from the booking. This cannot be undone.'
        }
        confirmLabel={deleteBusy ? 'Removing…' : 'Remove'}
        cancelLabel="Cancel"
        onConfirm={() => void handleDeleteDest()}
        onCancel={() => !deleteBusy && setDeleteAskId(null)}
        disableBackdropClose={deleteBusy}
      />

      <header className="shrink-0 px-3 py-3 lg:px-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <h1 className="text-lg font-bold text-white tracking-tight">Booking management</h1>
        <button
          type="button"
          onClick={() => void loadPage()}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 p-3 lg:p-4 gap-3">

          {/* ── Filters ── */}
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between shrink-0">
            <div
              className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-md"
              style={{ background: '#2a2828' }}
            >
              <Search size={16} className="text-white/40 shrink-0" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                placeholder="Search ID, client, origin, truck type…"
                className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'pending', 'approved', 'assigned', 'in_transit', 'completed', 'cancelled'] as const).map((key) => {
                const label  = key === 'all' ? 'All' : fmtStatus(key)
                const count  = key === 'all' ? statusCounts.all : statusCounts[key] ?? 0
                const active = statusFilter === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setStatusFilter(key); setPage(0) }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                    style={{
                      background:  active ? 'rgba(77,249,237,0.12)' : 'transparent',
                      borderColor: active ? 'rgba(77,249,237,0.35)' : 'rgba(255,255,255,0.08)',
                      color:       active ? 'var(--color-cyan)' : '#888',
                    }}
                  >
                    {label}
                    <span className="ml-1 opacity-70">({count})</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Table ── */}
          <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
            {listLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
                <div className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
                <p className="text-sm text-white/45">Loading bookings…</p>
              </div>
            ) : listError ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-red-400 text-sm">{listError}</p>
                <button type="button" onClick={() => void loadPage()} className="text-[var(--color-cyan)] text-sm font-semibold">Try again</button>
              </div>
            ) : listRows.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-white/45 py-12">
                No bookings match your filters.
              </div>
            ) : (
              <>
                <div className="overflow-auto flex-1 min-h-0">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                      <tr className="text-[11px] uppercase tracking-wider text-white/40">
                        <th className="px-3 py-2.5 font-bold">Booking</th>
                        <th className="px-3 py-2.5 font-bold">Status</th>
                        <th className="px-3 py-2.5 font-bold">Schedule</th>
                        <th className="px-3 py-2.5 font-bold hidden md:table-cell">Client</th>
                        <th className="px-3 py-2.5 font-bold">Origin</th>
                        <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Vehicle</th>
                        <th className="px-3 py-2.5 font-bold text-right">Stops</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listRows.map((r) => {
                        const active = selectedId === r.booking_id
                        const c      = statusColor(r.status)
                        return (
                          <tr
                            key={r.booking_id}
                            role="button"
                            tabIndex={0}
                            onClick={() => void openDetail(r.booking_id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openDetail(r.booking_id) }
                            }}
                            className="border-b border-white/[0.05] cursor-pointer transition-colors hover:bg-white/[0.04]"
                            style={{ background: active ? 'rgba(77,249,237,0.06)' : undefined }}
                          >
                            <td className="px-3 py-2.5 text-white/85 max-w-[160px] truncate">{r.display_id}</td>
                            <td className="px-3 py-2.5">
                              <span
                                className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                                style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}
                              >
                                {fmtStatus(r.status)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-white/75 whitespace-nowrap">{r.schedule_date ?? '—'}</td>
                            <td className="px-3 py-2.5 text-white/70 max-w-[180px] truncate hidden md:table-cell">{r.company ?? '—'}</td>
                            <td className="px-3 py-2.5 text-white/85 max-w-[220px] truncate">{r.origin ?? '—'}</td>
                            <td className="px-3 py-2.5 text-white/55 text-xs hidden lg:table-cell">{r.truck_type_needed ?? '—'}</td>
                            <td className="px-3 py-2.5 text-right text-white/60">{r.stops}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-white/[0.07] text-xs text-white/50">
                  <span>
                    Showing{' '}
                    {totalRows === 0 ? '0' : `${pageSafe * PAGE_SIZE + 1}–${Math.min((pageSafe + 1) * PAGE_SIZE, totalRows)}`}
                    {' '}of {totalRows}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={pageSafe <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="p-1.5 rounded-md border border-white/10 disabled:opacity-30 hover:bg-white/5">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="px-2 tabular-nums">{pageSafe + 1} / {pageCount}</span>
                    <button type="button" disabled={pageSafe >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="p-1.5 rounded-md border border-white/10 disabled:opacity-30 hover:bg-white/5">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Detail panel ── */}
        <AnimatePresence>
          {selectedId && (
            <>
              <motion.button
                type="button"
                aria-label="Close panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[40] bg-black/60 lg:hidden"
                onClick={closeDetail}
              />
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                className="fixed lg:relative z-[50] inset-y-0 right-0 w-full max-w-md lg:max-w-[420px] shrink-0 border-l border-white/[0.08] bg-[var(--color-surface)] flex flex-col shadow-2xl lg:shadow-none"
              >
                <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-white/[0.07]">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/45">Booking</span>
                  <button type="button" onClick={closeDetail} className="p-2 rounded-lg hover:bg-white/5 text-white/60" aria-label="Close">
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
                  {detailLoading && (
                    <div className="flex flex-col items-center justify-center py-16 gap-2">
                      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
                      <p className="text-sm text-white/45">Loading…</p>
                    </div>
                  )}
                  {detailError && !detailLoading && (
                    <p className="text-sm text-red-400 text-center py-8">{detailError}</p>
                  )}
                  {detail && !detailLoading && (
                    <>
                      {/* ── Booking info ── */}
                      <div className="rounded-xl border border-white/[0.08] p-3 space-y-2 bg-black/20">
                        <p className="text-[10px] font-mono text-white/35 break-all">
                          {detail.reference_number ?? detail.booking_id}
                        </p>
                        <div className="flex items-start gap-2 text-white/90 text-sm">
                          <MapPin size={16} className="text-[var(--color-cyan)] shrink-0 mt-0.5" />
                          <span>{detail.origin}</span>
                        </div>
                        <div className="grid gap-2 text-sm text-white/70">
                          <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-white/35" />
                            {detail.clients?.company_name ?? '—'}
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-white/35" />
                            {detail.schedule_date}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-white/35" />
                            {detail.call_time}
                          </div>
                          <div className="flex items-center gap-2">
                            <Truck size={14} className="text-white/35" />
                            {detail.truck_type_needed}
                          </div>
                          {detail.driver?.name && (
                            <div className="flex items-center gap-2">
                              <User size={14} className="text-white/35" />
                              Driver: {detail.driver.name}
                              {detail.driver.truck?.plate_number ? ` · ${detail.driver.truck.plate_number}` : ''}
                            </div>
                          )}
                          {detail.payment_terms && (
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-white/35" />
                              Payment terms: {detail.payment_terms} days
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Transaction documents ── */}
                      {(d?.transaction_documents?.length ?? 0) > 0 && (
                        <TransactionDocs docs={d!.transaction_documents!} />
                      )}

                      {/* ── Cargo summary ── */}
                      {(d?.required_weight_kg || d?.required_volume_cbm || d?.required_length_cm) && (
                        <div>
                          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
                            <Layers size={12} className="text-white/35" />
                            Cargo Summary
                          </h3>
                          <div className="grid grid-cols-3 gap-1.5">
                            {d.required_weight_kg != null && d.required_weight_kg > 0 && (
                              <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2 flex flex-col gap-0.5">
                                <span className="text-[9px] uppercase tracking-widest text-white/35 flex items-center gap-1"><Weight size={9} />Gross Wt.</span>
                                <span className="text-white text-sm font-bold tabular-nums">{d.required_weight_kg.toFixed(2)}</span>
                                <span className="text-[9px] text-white/35">kg</span>
                              </div>
                            )}
                            {d.required_volume_cbm != null && d.required_volume_cbm > 0 && (
                              <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2 flex flex-col gap-0.5">
                                <span className="text-[9px] uppercase tracking-widest text-white/35 flex items-center gap-1"><Package size={9} />Volume</span>
                                <span className="text-white text-sm font-bold tabular-nums">{d.required_volume_cbm.toFixed(4)}</span>
                                <span className="text-[9px] text-white/35">CBM</span>
                              </div>
                            )}
                            {d.required_length_cm != null && d.required_length_cm > 0 && (
                              <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2 flex flex-col gap-0.5">
                                <span className="text-[9px] uppercase tracking-widest text-white/35 flex items-center gap-1"><Ruler size={9} />Max Len.</span>
                                <span className="text-white text-sm font-bold tabular-nums">{d.required_length_cm.toFixed(0)}</span>
                                <span className="text-[9px] text-white/35">cm</span>
                              </div>
                            )}
                          </div>
                          {d.stackable_required && (
                            <p className="text-[11px] text-[var(--color-cyan)] mt-1.5 flex items-center gap-1.5">
                              <Layers size={11} />Stackable pallets included
                            </p>
                          )}
                        </div>
                      )}

                      {/* ── Cargo items ── */}
                      {cargoItems.length > 0 && (
                        <div>
                          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
                            <Package size={12} className="text-white/35" />
                            Cargo Items
                            <span className="ml-auto text-white/25 font-normal normal-case tracking-normal">
                              {cargoItems.length} item{cargoItems.length !== 1 ? 's' : ''}
                            </span>
                          </h3>
                          <div className="space-y-2">
                            {cargoItems.map((item, idx) => {
                              const commodity = resolveLabel(item.commodity_id, item.commodity_text, item.commodities)
                              const product   = resolveLabel(item.product_id,   item.product_text,   item.products)
                              const shc       = item.shc?.code  ?? item.shc_text  ?? null
                              const ashc      = item.ashc?.code ?? item.ashc_text ?? null
                              const weightStr = fmtNum(item.weight_kg,  'kg')
                              const volumeStr = fmtNum(item.volume_cbm, 'CBM', 4)
                              const hasDims   = item.length_cm && item.width_cm && item.height_cm
                              const dimsStr   = hasDims ? `${item.length_cm} × ${item.width_cm} × ${item.height_cm} cm` : null

                              return (
                                <div key={item.item_id ?? idx} className="rounded-lg border border-white/[0.07] bg-black/20 overflow-hidden">
                                  <div className="px-2.5 py-1.5 border-b border-white/[0.05] flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-cyan)]">Item {idx + 1}</span>
                                    {item.quantity != null && item.quantity > 0 && (
                                      <span className="text-[10px] text-white/40 tabular-nums">×{item.quantity}</span>
                                    )}
                                  </div>
                                  <div className="divide-y divide-white/[0.04]">
                                    {commodity  && <CargoRow label="Commodity" value={commodity} />}
                                    {product    && <CargoRow label="Product"   value={product} />}
                                    {shc        && <CargoRow label="SHC"       value={shc}  mono />}
                                    {ashc       && <CargoRow label="Add. SHC"  value={ashc} mono />}
                                    {weightStr  && <CargoRow label="Weight"    value={weightStr} accent />}
                                    {volumeStr  && <CargoRow label="Volume"    value={volumeStr} accent />}
                                    {dimsStr    && <CargoRow label="L × W × H" value={dimsStr} />}
                                    {item.notes && <CargoRow label="Notes"     value={item.notes} />}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* ── Booking status ── */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                            Booking status
                          </label>
                          <span
                            className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                            style={{
                              color:       statusColor(detail.status),
                              borderColor: `${statusColor(detail.status)}55`,
                              background:  `${statusColor(detail.status)}14`,
                            }}
                          >
                            {fmtStatus(detail.status)}
                          </span>
                        </div>

                        {normalizeBookingStatus(detail.status) === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={pendingStatus || pendingReject}
                              onClick={() => setApproveModalOpen(true)}
                              className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
                              style={{ background: 'rgba(77,249,237,0.12)', border: '1px solid rgba(77,249,237,0.30)', color: 'var(--color-cyan)' }}
                            >
                              {pendingStatus ? 'Approving…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              disabled={pendingStatus || pendingReject}
                              onClick={() => setRejectModalOpen(true)}
                              className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
                              style={{ background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', color: '#fca5a5' }}
                            >
                              {pendingReject ? 'Rejecting…' : 'Reject'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* ── Driver / vehicle assignment ── */}
                      {(normalizeBookingStatus(detail.status) === 'approved' ||
                        normalizeBookingStatus(detail.status) === 'assigned') && (
                        <AssignmentPanel
                          detail={detail}
                          drivers={availableDrivers}
                          trucks={availableTrucks}
                          assignDriverId={assignDriverId}
                          assignTruckId={assignTruckId}
                          assignBusy={assignBusy}
                          assignEditMode={assignEditMode}
                          selectClass={selectClass}
                          onDriverChange={setAssignDriverId}
                          onTruckChange={setAssignTruckId}
                          onAssign={() => void handleAssign()}
                          onEditClick={() => setAssignEditMode(true)}
                          onCancelEdit={() => {
                            setAssignEditMode(false)
                            const restore = committedAssignment.driverId || committedAssignment.truckId
                              ? committedAssignment
                              : getPrefillFromBookingDetail(detail, trucks)
                            setAssignDriverId(restore.driverId)
                            setAssignTruckId(restore.truckId)
                          }}
                        />
                      )}

                      {/* ── Delivery stops ── */}
                      <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
                          Delivery stops
                        </h3>
                        <ul className="space-y-2">
                          {(detail.booking_destinations ?? [])
                            .slice()
                            .sort((a, b) => a.sequence_order - b.sequence_order)
                            .map((dest) => (
                              <li key={dest.destination_id} className="rounded-lg border border-white/[0.08] p-2.5 space-y-2 bg-black/20">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm text-white/85 leading-snug min-w-0">{dest.address}</p>
                                  <span
                                    className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border"
                                    style={{ color: statusColor(dest.status), borderColor: `${statusColor(dest.status)}44` }}
                                  >
                                    {fmtStatus(dest.status)}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {DEST_STATUSES.map((st) => (
                                    <span
                                      key={st}
                                      className="text-[11px] font-semibold px-2 py-1 rounded-md border border-white/10"
                                      style={
                                        dest.status === st
                                          ? { borderColor: 'var(--color-cyan)', color: 'var(--color-cyan)' }
                                          : { color: 'rgba(255,255,255,0.3)' }
                                      }
                                    >
                                      {fmtStatus(st)}
                                    </span>
                                  ))}
                                </div>
                              </li>
                            ))}
                        </ul>
                        {(detail.booking_destinations?.length ?? 0) === 0 && (
                          <p className="text-sm text-white/40">No stops on this booking.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function CargoRow({
  label,
  value,
  accent = false,
  mono   = false,
}: {
  label:   string
  value:   string
  accent?: boolean
  mono?:   boolean
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 gap-3">
      <span className="text-[10px] uppercase tracking-wider text-white/30 shrink-0">{label}</span>
      <span
        className={`text-xs text-right truncate ${mono ? 'font-mono' : ''}`}
        style={{ color: accent ? 'var(--color-cyan)' : 'rgba(255,255,255,0.75)' }}
      >
        {value}
      </span>
    </div>
  )
}