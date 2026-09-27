'use client'

import { useCallback, useEffect, useMemo, useState, memo, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  RefreshCw,
  Plus,
  Pencil,
  Archive,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  Truck as TruckIcon,
  Settings2,
  ClipboardCheck,
} from 'lucide-react'

import { assignedDriverName, isRoadworthy, needsReinspection, type Truck, type TruckInspection, type CreateTruckInput, type UpdateTruckInput } from '@/app/types/truck.types'
import type { TruckModel } from '@/app/types/truck-model'
import {
  adminFetchTrucksPaginated,
  adminCreateTruck,
  adminUpdateTruck,
  adminArchiveTruck,
  adminFetchTruckModels,
} from '@/lib/services/admin/trucks.service'
import { driverService } from '@/lib/services/admin/user-management.service'
import type { DriverUser } from '@/app/types/admin/user-management.types'
import ReusableModal from '@/components/layout/ReusableModal'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import TruckModelFormModal from './TruckModelFormModal'
import BlowbagetsInspectionModal from './BlowbagetsInspectionModal'
import { useRecordLock, useRecordLocks } from '@/lib/hooks/useRecordLock'
import RecordLockBanner, { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import RowActionMenu, { type RowAction } from '@/components/ui/RowActionMenu'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'

const PAGE_SIZE = 10

function formatPlateNumber(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-ZÑ0-9]/g, '')
  if (cleaned.length > 3 && /^[A-ZÑ]{3}/.test(cleaned)) {
    return cleaned.slice(0, 3) + ' ' + cleaned.slice(3, 7)
  }
  return cleaned.slice(0, 7)
}

function resolveModelImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  const u = url.trim()
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  if (u.startsWith('/')) {
    const base   = process.env.NEXT_PUBLIC_API_URL ?? ''
    const origin = base.replace(/\/api\/?$/i, '')
    return origin ? `${origin}${u}` : u
  }
  return u
}

const ModelThumb = memo(function ModelThumb({
  imageUrl,
  label,
  size = 44,
}: {
  imageUrl: string | null
  label: string
  size?: number
}) {
  const [broken, setBroken] = useState(false)
  const dim = `${size}px`
  if (!imageUrl || broken) {
    return (
      <div
        className="rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center shrink-0"
        style={{ width: dim, height: dim }}
        title={label}
      >
        <TruckIcon size={Math.round(size * 0.42)} className="text-white/25" aria-hidden />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={label}
      width={size}
      height={size}
      className="rounded-lg object-cover border border-white/10 bg-black/30 shrink-0"
      style={{ width: dim, height: dim }}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  )
})

const STATUSES: Truck['status'][] = [
  'available',
  // Back from a job; set by the driver's return, lifted by the next passing BLOWBAGETS.
  'recheck_due',
  'in_use',
  'under_maintenance',
  'inactive',
  'archived',
]

// What the edit form may set. Archiving has its own action (it also releases the
// driver pairing and is refused mid-booking), so it is not a status pick.
const EDITABLE_STATUSES = STATUSES.filter((s) => s !== 'archived')

function fmtLabel(s: string) {
  if (s === 'recheck_due') return 'Re-check Due'
  return (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function statusStyle(status: string): { bg: string; color: string; border: string } {
  switch (status) {
    case 'available':
      return { bg: 'rgba(58,246,38,0.12)', color: '#86efac', border: 'rgba(58,246,38,0.35)' }
    case 'in_use':
      return { bg: 'rgba(77,249,237,0.12)', color: 'var(--color-cyan)', border: 'rgba(77,249,237,0.35)' }
    case 'recheck_due':
      return { bg: 'rgba(250,204,21,0.12)', color: '#fde047', border: 'rgba(250,204,21,0.35)' }
    case 'under_maintenance':
      return { bg: 'rgba(246,159,38,0.12)', color: '#fbbf24', border: 'rgba(246,159,38,0.35)' }
    case 'inactive':
      return { bg: 'rgba(156,163,175,0.12)', color: '#d1d5db', border: 'rgba(156,163,175,0.3)' }
    case 'archived':
      return { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', border: 'rgba(107,114,128,0.35)' }
    default:
      return { bg: 'rgba(156,163,175,0.12)', color: '#9ca3af', border: 'rgba(156,163,175,0.3)' }
  }
}

function kgToTons(kg: number | null | undefined): string {
  if (kg == null) return ''
  const tons = kg / 1000
  return parseFloat(tons.toFixed(3)).toString()
}

type FormMode    = 'create' | 'edit' | null
type ConfirmKind = 'save' | 'archive' | null

interface TruckFormState {
  plate_number: string
  model_id:     string
  status:       Truck['status']
  /** The vehicle's regular driver. '' means it has none. */
  assigned_driver_id: string
}

function emptyForm(): TruckFormState {
  return {
    plate_number: '',
    model_id:     '',
    status:       'available',
    assigned_driver_id: '',
  }
}

function truckToForm(t: Truck): TruckFormState {
  return {
    plate_number: t.plate_number ?? '',
    model_id:     t.model_id ?? '',
    status:       t.status,
    assigned_driver_id: t.assigned_driver_id ?? '',
  }
}

function formsEqual(a: TruckFormState, b: TruckFormState): boolean {
  return (
    a.plate_number === b.plate_number &&
    a.model_id     === b.model_id     &&
    a.status       === b.status       &&
    a.assigned_driver_id === b.assigned_driver_id
  )
}

/**
 * Whether this vehicle is cleared for operations to assign, from its most recent
 * BLOWBAGETS inspection. A vehicle that has never been inspected reads the same
 * as one that failed: it can't be picked.
 */
function InspectionBadge({ inspection, dueRecheck }: { inspection: TruckInspection | null; dueRecheck?: boolean }) {
  if (!inspection) {
    return (
      <span
        className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
        style={{ color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.15)' }}
        title="Never inspected — cannot be assigned to a booking"
      >
        Not inspected
      </span>
    )
  }

  const when = new Date(inspection.inspected_at)
  const whenLabel = Number.isNaN(when.getTime())
    ? inspection.inspected_at
    : when.toLocaleDateString()

  // A pass that predates the vehicle's last homecoming is spent: it cleared the
  // job the truck has already done. Saying "Passed" here would leave the fleet
  // manager wondering why operations cannot pick it.
  if (inspection.passed && dueRecheck) {
    return (
      <span className="flex flex-col gap-0.5 items-start">
        <span
          className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
          style={{ color: '#fbbf24', borderColor: 'rgba(246,159,38,0.35)', background: 'rgba(246,159,38,0.12)' }}
          title="Back from a booking since its last check — inspect it again before it can be assigned"
        >
          Re-check due
        </span>
        <span className="text-[10px] text-white/30 tabular-nums">last {whenLabel}</span>
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-0.5 items-start">
      <span
        className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
        style={
          inspection.passed
            ? { color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.40)', background: 'rgba(77,249,237,0.12)' }
            : { color: '#fca5a5', borderColor: 'rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.10)' }
        }
        title={inspection.passed
          ? 'Cleared — the Operations Manager can assign this vehicle'
          : 'Failed — blocked from assignment until it passes a re-check'}
      >
        {inspection.passed ? 'Passed' : 'Failed'}
      </span>
      <span className="text-[10px] text-white/30 tabular-nums">{whenLabel}</span>
    </span>
  )
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-wide text-white/40 shrink-0">{label}</span>
      <span className="text-sm text-white/80 text-right min-w-0 break-words">{children}</span>
    </div>
  )
}

/** Read-only view of one vehicle — nothing here writes. */
function VehicleDetailsModal({
  truck,
  onClose,
  onUpdate,
}: {
  truck:    Truck | null
  onClose:  () => void
  /** Offered only when the viewer may edit and the vehicle is not archived. */
  onUpdate?: (t: Truck) => void
}) {
  return (
    <AnimatePresence>
      {truck && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/65"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Details for ${truck.plate_number}`}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Vehicle details</h2>
              <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-white/50" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex gap-3 items-center">
                <ModelThumb
                  imageUrl={resolveModelImageUrl((truck.truck_model?.image_url as string | null | undefined) ?? null)}
                  label={truck.truck_model?.name ?? 'Vehicle'}
                  size={88}
                />
                <div className="min-w-0">
                  <p className="text-lg font-mono font-bold text-white tracking-widest">{truck.plate_number}</p>
                  <p className="text-xs text-white/50 truncate">
                    {truck.truck_model?.name ?? 'No model'}
                    {truck.truck_model?.vehicle_type ? ` · ${truck.truck_model.vehicle_type}` : ''}
                  </p>
                  <span
                    className="inline-flex mt-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                    style={{ color: statusStyle(truck.status).color, borderColor: statusStyle(truck.status).border, background: statusStyle(truck.status).bg }}
                  >
                    {fmtLabel(truck.status)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3">
                <DetailRow label="Max weight">
                  {truck.truck_model?.max_weight_kg != null
                    ? `${truck.truck_model.max_weight_kg.toLocaleString()} kg · ${kgToTons(truck.truck_model.max_weight_kg)} t`
                    : '—'}
                </DetailRow>
                <DetailRow label="Max volume">
                  {truck.truck_model?.max_volume_cbm != null ? `${truck.truck_model.max_volume_cbm} cbm` : '—'}
                </DetailRow>
                <DetailRow label="Cargo bed (mm)">{truck.truck_model?.dimension_mm ?? '—'}</DetailRow>
                <DetailRow label="Regular driver">
                  {assignedDriverName(truck) ?? <span className="text-white/35">Unassigned</span>}
                  {truck.assigned_driver?.license_number && (
                    <span className="block text-[10px] text-white/35 font-mono">{truck.assigned_driver.license_number}</span>
                  )}
                </DetailRow>
                <DetailRow label="BLOWBAGETS">
                  <span className="inline-flex justify-end">
                    <InspectionBadge inspection={truck.latest_inspection ?? null} dueRecheck={needsReinspection(truck)} />
                  </span>
                </DetailRow>
                <DetailRow label="Last back in yard">{fmtDate(truck.last_fleet_return_at)}</DetailRow>
                <DetailRow label="Added">{fmtDate(truck.created_at)}</DetailRow>
                <DetailRow label="Last updated">{fmtDate(truck.updated_at)}</DetailRow>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/[0.07]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/5"
              >
                Close
              </button>
              {onUpdate && truck.status !== 'archived' && (
                <button
                  type="button"
                  onClick={() => onUpdate(truck)}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-black"
                  style={{ background: 'var(--color-cyan)' }}
                >
                  Update Details
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function VehicleManagementView() {
  const [trucks,  setTrucks]  = useState<Truck[]>([])
  const [models,  setModels]  = useState<TruckModel[]>([])
  // The full driver roster, for the "regular driver" picker. Deliberately NOT
  // the per-booking assignable pool: pairing says who normally drives this
  // vehicle, a standing fact that does not depend on any one day's calendar.
  const [drivers, setDrivers] = useState<DriverUser[]>([])

  const [listLoading, setListLoading] = useState(true)
  const [listError,   setListError]   = useState<string | null>(null)

  const [search,          setSearch]          = useState('')
  const [statusFilter,    setStatusFilter]    = useState<string>('all')
  const [page,            setPage]            = useState(0)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [listMeta,        setListMeta]        = useState<{
    total: number
    totalPages: number
  } | null>(null)

  // Vehicle-management tier: hide write controls the user isn't allowed to use.
  const { canCreate, canEdit, canDelete } = useModuleAccess()

  const [modalMode,     setModalMode]     = useState<FormMode>(null)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [form,          setForm]          = useState<TruckFormState>(emptyForm())
  const [originalForm,  setOriginalForm]  = useState<TruckFormState>(emptyForm())
  const [formError,     setFormError]     = useState<string | null>(null)

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null)
  const [actionBusy,  setActionBusy]  = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Truck | null>(null)
  const [viewTruck,     setViewTruck]     = useState<Truck | null>(null)

  const [modelModalOpen, setModelModalOpen] = useState(false)

  const isUnchanged = modalMode === 'edit' && formsEqual(form, originalForm)
  const editingTruck = useMemo(() => trucks.find((t) => t.truck_id === editingId) ?? null, [trucks, editingId])

  const loadModels = useCallback(async () => {
    try {
      setListError(null)
      const mList = await adminFetchTruckModels()
      setModels(mList)
    } catch (e) {
      setListError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(t)
  }, [search])

  const loadTrucksPage = useCallback(async () => {
    try {
      setListLoading(true)
      setListError(null)
      const res = await adminFetchTrucksPaginated({
        page:     page + 1,
        limit:    PAGE_SIZE,
        status:   statusFilter,
        search:   debouncedSearch,
      })
      setTrucks(res.rows)
      setListMeta({ total: res.meta.total, totalPages: res.meta.totalPages })
      if (res.meta.totalPages >= 1 && page > res.meta.totalPages - 1) {
        setPage(res.meta.totalPages - 1)
      }
    } catch (e) {
      setListError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    } finally {
      setListLoading(false)
    }
  }, [page, statusFilter, debouncedSearch])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  useEffect(() => {
    void driverService.getAll().then(setDrivers).catch(() => setDrivers([]))
  }, [])

  useEffect(() => {
    void loadTrucksPage()
  }, [loadTrucksPage])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadModels(), loadTrucksPage()])
  }, [loadModels, loadTrucksPage])

  const pageCount = Math.max(1, listMeta?.totalPages ?? 1)
  const pageSafe  = Math.min(page, pageCount - 1)
  const totalRows = listMeta?.total ?? 0

  // driver_id -> the plate it is already paired with, excluding the vehicle
  // being edited. One driver has one truck, so the picker greys out the rest
  // instead of letting the save fail on the unique index.
  const pairedElsewhere = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of trucks) {
      if (!t.assigned_driver_id || t.truck_id === editingId) continue
      map.set(t.assigned_driver_id, t.plate_number)
    }
    return map
  }, [trucks, editingId])

  const selectedModel         = useMemo(() => models.find((m) => m.model_id === form.model_id) ?? null, [models, form.model_id])
  const selectedModelImageUrl = resolveModelImageUrl(selectedModel?.image_url ?? null)

  // The vehicle whose BLOWBAGETS inspection is open, if any. Recording an
  // inspection patches the row in place so readiness updates without a refetch.
  const [inspectTruck, setInspectTruck] = useState<Truck | null>(null)

  const applyInspection = useCallback((truckId: string, inspection: TruckInspection) => {
    setTrucks((prev) =>
      prev.map((t) => (t.truck_id === truckId ? { ...t, latest_inspection: inspection } : t)),
    )
    // A failed inspection also takes the vehicle out of service on the server, so
    // pull the row back to pick up the new status.
    if (!inspection.passed) void loadTrucksPage()
  }, [loadTrucksPage])

  function applyModelPick(modelId: string) {
    setForm((f) => ({ ...f, model_id: modelId }))
  }

  function clearModelPick() {
    setForm((f) => ({ ...f, model_id: '' }))
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setOriginalForm(emptyForm())
    setFormError(null)
    setModalMode('create')
  }

  const openEdit = (t: Truck) => {
    setEditingId(t.truck_id)
    const initial = truckToForm(t)
    setForm(initial)
    setOriginalForm(initial)
    setFormError(null)
    setModalMode('edit')
  }

  // One person edits a vehicle at a time — see useRecordLock. If the vehicle
  // changed while this screen was waiting for the lock, the form is out of date;
  // close it rather than let it be saved over the newer record.
  const truckLock = useRecordLock({
    type:    'truck',
    id:      modalMode === 'edit' ? editingId : null,
    onStale: () => {
      appToast.info('This vehicle was just changed by someone else. Reopen it to edit the latest.', {
        action: 'truck-stale', entityId: editingId ?? undefined,
      })
      closeModal()
      void loadTrucksPage()
    },
  })
  const truckLocks = useRecordLocks('truck', canEdit || canDelete)

  const closeModal = () => {
    setModalMode(null)
    setEditingId(null)
    setFormError(null)
  }

  function validateForm(): boolean {
    setFormError(null)
    if (!form.plate_number.trim()) {
      setFormError('Plate number is required.')
      return false
    }
    const plateRegex = /^(?:[A-ZÑ]{3} \d{4}|[A-ZÑ]{2,3} \d{2,3})$/
    if (!plateRegex.test(form.plate_number)) {
      setFormError('Invalid plate format (e.g. ABC 1234). Only letters, and numbers allowed.')
      return false
    }
    return true
  }

  const handleSaveClick = () => {
    if (!validateForm()) return
    setConfirmKind('save')
  }

  const handleArchiveClick = (t: Truck) => {
    setArchiveTarget(t)
    setConfirmKind('archive')
  }

  const executeSave = async () => {
    const model_id  = form.model_id.trim() || null

    setActionBusy(true)
    try {
      if (modalMode === 'create') {
        const body: CreateTruckInput = {
          plate_number: form.plate_number.trim().toUpperCase(),
          model_id,
        }
        await adminCreateTruck(body)
        appToast.success('Vehicle created.', { action: 'truck-save' })
      } else if (modalMode === 'edit' && editingId) {
        const body: UpdateTruckInput = {
          plate_number: form.plate_number.trim().toUpperCase(),
          model_id,
          status:       form.status,
          // null, not undefined: clearing the dropdown must unpair the vehicle
          // rather than silently leave the old driver in place.
          assigned_driver_id: form.assigned_driver_id || null,
        }
        await adminUpdateTruck(editingId, body)
        appToast.success('Vehicle updated.', { action: 'truck-save', entityId: editingId })
      }
      setConfirmKind(null)
      closeModal()
      await refreshAll()
    } catch (e) {
      setConfirmKind(null)
      setFormError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    } finally {
      setActionBusy(false)
    }
  }

  const executeArchive = async () => {
    if (!archiveTarget) return
    const id = archiveTarget.truck_id
    setActionBusy(true)
    try {
      await adminArchiveTruck(id)
      appToast.success(`${archiveTarget.plate_number} archived.`, { action: 'truck-archive', entityId: id })
      if (editingId === id) closeModal()
      if (viewTruck?.truck_id === id) setViewTruck(null)
      setArchiveTarget(null)
      setConfirmKind(null)
      await refreshAll()
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'truck-archive', entityId: id })
      setConfirmKind(null)
    } finally {
      setActionBusy(false)
    }
  }

  // The row's 3-dot menu. Viewing stays open while someone else is editing the
  // vehicle; everything that writes waits for them.
  function rowActions(t: Truck): RowAction[] {
    const archived = t.status === 'archived'
    const lockedBy = truckLocks.get(t.truck_id)
    const lockedTitle = lockedBy ? `${lockedBy} is editing this vehicle` : undefined
    const actions: RowAction[] = [
      { label: 'View Details', icon: <Eye size={13} />, onSelect: () => setViewTruck(t) },
    ]
    if (archived) return actions

    if (canEdit) {
      actions.push({
        label: 'Update Details', icon: <Pencil size={13} />, onSelect: () => openEdit(t),
        disabled: !!lockedBy, title: lockedTitle,
      })
      // Only offered while the vehicle is actually blocked on BLOWBAGETS: never
      // inspected, failed, or back from a booking since its last pass.
      if (!isRoadworthy(t)) {
        actions.push({
          label: 'Approve Vehicle', icon: <ClipboardCheck size={13} />, tone: 'accent',
          onSelect: () => setInspectTruck(t),
          disabled: !!lockedBy, title: lockedTitle ?? 'Run the BLOWBAGETS inspection',
        })
      }
    }
    if (canDelete) {
      const onBooking = t.status === 'in_use'
      actions.push({
        label: 'Archive', icon: <Archive size={13} />, tone: 'warning', separated: true,
        onSelect: () => handleArchiveClick(t),
        disabled: !!lockedBy || onBooking,
        title: lockedTitle ?? (onBooking ? 'Out on a booking — archive it once it is back in the yard' : undefined),
      })
    }
    return actions
  }

  const confirmModalProps = useMemo(() => {
    if (confirmKind === 'save') {
      const isCreate = modalMode === 'create'
      return {
        title:        isCreate ? 'Create vehicle?' : 'Save changes?',
        description:  isCreate
          ? `Add ${form.plate_number.trim().toUpperCase() || 'this vehicle'} to the fleet?`
          : `Save updates to ${form.plate_number.trim().toUpperCase() || 'this vehicle'}?`,
        confirmLabel: actionBusy ? 'Saving…' : isCreate ? 'Create' : 'Save',
        onConfirm:    () => { void executeSave() },
      }
    }
    if (confirmKind === 'archive' && archiveTarget) {
      return {
        title:        'Archive vehicle?',
        description:  `${archiveTarget.plate_number} will be removed from the fleet list and can no longer be assigned to bookings.`
          + (archiveTarget.assigned_driver_id ? ' Its regular driver will be unpaired.' : '')
          + ' Its booking and inspection history is kept, and it stays under the Archived filter.',
        confirmLabel: actionBusy ? 'Archiving…' : 'Archive',
        onConfirm:    () => { void executeArchive() },
      }
    }
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmKind, modalMode, form.plate_number, actionBusy, archiveTarget])

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-sc bg-[var(--color-bg)]">

      <header className="shrink-0 px-3 py-3 lg:px-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Vehicle management</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setModelModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
            >
              <Settings2 size={14} />
              Manage models
            </button>
          )}
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide text-black"
              style={{ background: 'var(--color-cyan)' }}
            >
              <Plus size={16} />
              Add vehicle
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 gap-3 overflow-hidden">

        {/* Filters */}
        <div className="flex flex-col xl:flex-row gap-2 xl:items-center shrink-0">
          <div
            className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-md"
            style={{ background: '#2a2828' }}
          >
            <Search size={16} className="text-white/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Search plate, model, status…"
              className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/35 self-center mr-1">Status</span>
            {(['all', ...STATUSES] as const).map((key) => {
              const label  = key === 'all' ? 'All' : fmtLabel(key)
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
                    color:       active ? 'var(--color-cyan)' : '#888',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
          {listLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <div
                className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--color-cyan)' }}
              />
              <p className="text-sm text-white/45">Loading vehicles…</p>
            </div>
          ) : listError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <p className="text-red-400 text-sm text-center">{listError}</p>
              <button type="button" onClick={() => void refreshAll()} className="text-[var(--color-cyan)] text-sm font-semibold">
                Try again
              </button>
            </div>
          ) : trucks.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12 text-center px-4">
              <TruckIcon size={40} className="text-white/20" />
              <p className="text-sm text-white/45">No vehicles match your filters.</p>
              {canCreate && (
                <button type="button" onClick={openCreate} className="text-[var(--color-cyan)] text-sm font-bold">
                  Add your first vehicle
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-left text-sm border-collapse min-w-[700px]">
                  <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                    <tr className="text-[11px] uppercase tracking-wider text-white/40">
                      <th className="px-2 py-2.5 font-bold w-14 text-center">Image</th>
                      <th className="px-3 py-2.5 font-bold">Plate</th>
                      <th className="px-3 py-2.5 font-bold">Vehicle type</th>
                      <th className="px-3 py-2.5 font-bold hidden md:table-cell">Model</th>
                      <th className="px-3 py-2.5 font-bold hidden md:table-cell">Max weight</th>
                      <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Driver</th>
                      <th className="px-3 py-2.5 font-bold">Status</th>
                      <th className="px-3 py-2.5 font-bold">BLOWBAGETS</th>
                      <th className="px-3 py-2.5 font-bold text-right w-[90px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trucks.map((t) => {
                      const st         = statusStyle(t.status)
                      const modelLabel = t.truck_model?.name ?? 'Vehicle'
                      const thumbUrl   = resolveModelImageUrl((t.truck_model?.image_url as string | null | undefined) ?? null)
                      return (
                        <tr
                          key={t.truck_id}
                          className="border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors"
                        >
                          <td className="px-2 py-2 align-middle">
                            <div className="flex justify-center">
                              <ModelThumb imageUrl={thumbUrl} label={modelLabel} size={44} />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono font-semibold text-white">{t.plate_number}</td>
                          <td className="px-3 py-2.5 text-white/70">
                            {t.truck_model?.vehicle_type ?? '—'}
                          </td>
                          <td className="px-3 py-2.5 text-white/60 text-xs max-w-[200px] truncate hidden md:table-cell">
                            {t.truck_model?.name ?? '—'}
                          </td>
                          <td className="px-3 py-2.5 text-white/60 text-xs hidden md:table-cell tabular-nums">
                            {t.truck_model?.max_weight_kg != null
                              ? `${t.truck_model.max_weight_kg.toLocaleString()} kg · ${kgToTons(t.truck_model.max_weight_kg)} t`
                              : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-xs hidden lg:table-cell">
                            {assignedDriverName(t)
                              ? (
                                <span className="text-white/70">
                                  {assignedDriverName(t)}
                                  {t.assigned_driver?.license_number && (
                                    <span className="block text-[10px] text-white/30 font-mono">
                                      {t.assigned_driver.license_number}
                                    </span>
                                  )}
                                </span>
                              )
                              : <span className="text-white/25">Unassigned</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                              style={{ color: st.color, borderColor: st.border, background: st.bg }}
                            >
                              {fmtLabel(t.status)}
                            </span>
                          </td>
                          {/* Readiness for assignment: operations can only pick a
                              vehicle whose latest inspection passed. */}
                          <td className="px-3 py-2.5">
                            <InspectionBadge inspection={t.latest_inspection ?? null} dueRecheck={needsReinspection(t)} />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <RecordLockBadge holder={truckLocks.get(t.truck_id)} />
                              <RowActionMenu label={`Actions for ${t.plate_number}`} actions={rowActions(t)} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-white/[0.07] text-xs text-white/50">
                <span>
                  {totalRows === 0
                    ? '0'
                    : `${pageSafe * PAGE_SIZE + 1}–${Math.min((pageSafe + 1) * PAGE_SIZE, totalRows)}`}{' '}
                  of {totalRows}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pageSafe <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="p-1.5 rounded-md border border-white/10 disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-2 tabular-nums">{pageSafe + 1} / {pageCount}</span>
                  <button
                    type="button"
                    disabled={pageSafe >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    className="p-1.5 rounded-md border border-white/10 disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* BLOWBAGETS inspection — the gate on whether operations can assign this
          vehicle to a booking. */}
      <BlowbagetsInspectionModal
        truck={inspectTruck}
        onClose={() => setInspectTruck(null)}
        onRecorded={(inspection) => {
          if (inspectTruck) applyInspection(inspectTruck.truck_id, inspection)
        }}
      />

      <VehicleDetailsModal
        truck={viewTruck}
        onClose={() => setViewTruck(null)}
        onUpdate={canEdit
          ? (t) => {
              if (truckLocks.has(t.truck_id)) {
                appToast.info(`${truckLocks.get(t.truck_id)} is editing this vehicle.`, { action: 'truck-locked', entityId: t.truck_id })
                return
              }
              setViewTruck(null)
              openEdit(t)
            }
          : undefined}
      />

      {/* Model catalog modal */}
      <TruckModelFormModal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        onSaved={() => void refreshAll()}
      />

      {/* Confirm modal */}
      <ReusableModal
        open={!!confirmKind && !!confirmModalProps}
        title={confirmModalProps?.title ?? ''}
        description={confirmModalProps?.description}
        confirmLabel={confirmModalProps?.confirmLabel ?? 'Confirm'}
        cancelLabel="Cancel"
        disableBackdropClose={actionBusy}
        onCancel={() => {
          if (actionBusy) return
          setConfirmKind(null)
          if (confirmKind === 'archive') setArchiveTarget(null)
        }}
        onConfirm={confirmModalProps?.onConfirm}
      />

      {/* Create / Edit vehicle modal */}
      <AnimatePresence>
        {modalMode && (
          <motion.div
            className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/65"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">
                  {modalMode === 'create' ? 'New vehicle' : 'Edit vehicle'}
                </h2>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-2 rounded-lg hover:bg-white/5 text-white/50"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <RecordLockBanner lock={truckLock} noun="vehicle" className="mx-4 mt-4" />
              <fieldset disabled={truckLock.readOnly} className="p-4 space-y-3 min-w-0 border-0 m-0">

                {/* Plate number */}
                <label className="block">
                  <span className="text-[11px] font-bold uppercase text-white/40">
                    Plate number <span className="text-red-400">*</span>
                  </span>
                  <input
                    value={form.plate_number}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, plate_number: formatPlateNumber(e.target.value) }))
                    }
                    maxLength={8}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--color-cyan)]/40 font-mono tracking-widest uppercase"
                    placeholder="ABC 1234"
                  />
                  <p className="text-[10px] text-white/25 mt-1">
                    Letters and numbers only (e.g. ABC 1234 or ÑBC 5678). Space is inserted automatically.
                  </p>
                </label>

                {/* Model picker */}
                <div className="block">
                  <span className="text-[11px] font-bold uppercase text-white/40">
                    Model &amp; vehicle type
                  </span>

                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/15 scrollbar-track-transparent">
                    <button
                      type="button"
                      onClick={clearModelPick}
                      className={`shrink-0 flex flex-col items-center gap-1.5 w-[88px] p-2 rounded-xl border transition-colors ${
                        !form.model_id
                          ? 'border-[var(--color-cyan)] bg-[rgba(77,249,237,0.08)]'
                          : 'border-white/10 bg-[#111] hover:border-white/20'
                      }`}
                    >
                      <ModelThumb imageUrl={null} label="No model" size={52} />
                      <span className="text-[10px] font-semibold text-white/60 text-center leading-tight">No model</span>
                    </button>

                    {models.map((m) => {
                      const url    = resolveModelImageUrl(m.image_url ?? null)
                      const picked = form.model_id === m.model_id
                      return (
                        <button
                          key={m.model_id}
                          type="button"
                          onClick={() => applyModelPick(m.model_id)}
                          title={`${m.name} · ${m.vehicle_type}`}
                          className={`shrink-0 flex flex-col items-center gap-1.5 w-[88px] p-2 rounded-xl border transition-colors ${
                            picked
                              ? 'border-[var(--color-cyan)] bg-[rgba(77,249,237,0.08)]'
                              : 'border-white/10 bg-[#111] hover:border-white/20'
                          }`}
                        >
                          <ModelThumb imageUrl={url} label={m.name} size={52} />
                          <span className="text-[10px] font-semibold text-white/75 text-center leading-tight line-clamp-2">
                            {m.name}
                          </span>
                          <span className="text-[9px] text-white/35 text-center leading-tight">
                            {m.vehicle_type}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Selected model preview */}
                <div className="flex gap-3 rounded-xl border border-white/[0.08] bg-black/25 p-3 items-center">
                  <ModelThumb imageUrl={selectedModelImageUrl} label={selectedModel?.name ?? 'Vehicle'} size={88} />
                  <div className="min-w-0 flex-1">
                    {selectedModel ? (
                      <>
                        <p className="text-sm font-semibold text-white truncate">{selectedModel.name}</p>
                        <span
                          className="inline-flex mt-1 text-[10px] font-bold px-2 py-0.5 rounded-md border"
                          style={{
                            background:  'rgba(77,249,237,0.10)',
                            borderColor: 'rgba(77,249,237,0.30)',
                            color:       'var(--color-cyan)',
                          }}
                        >
                          {selectedModel.vehicle_type}
                        </span>
                        {selectedModel.max_weight_kg != null && (
                          <p className="text-[11px] text-white/40 mt-1.5">
                            Max weight:{' '}
                            <span className="text-white/65 font-semibold">
                              {selectedModel.max_weight_kg.toLocaleString()} kg
                            </span>
                            <span className="text-white/30 mx-1">·</span>
                            {kgToTons(selectedModel.max_weight_kg)} t
                          </p>
                        )}
                        {!selectedModelImageUrl && (
                          <p className="text-[11px] text-amber-200/90 mt-2 leading-snug">
                            This model has no image yet. Set it in Manage models.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-white/80">No model selected</p>
                        <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
                          Vehicle type and image come from the linked model.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {modalMode === 'edit' && (
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-white/40">Status</span>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Truck['status'] }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none"
                    >
                      {EDITABLE_STATUSES.map((s) => (
                        <option key={s} value={s}>{fmtLabel(s)}</option>
                      ))}
                    </select>
                  </label>
                )}

                {/* The vehicle's regular driver. Edit only: a truck is paired
                    once it exists, and pairing at creation would mean picking a
                    driver before anyone has seen the vehicle on the list. */}
                {modalMode === 'edit' && (
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-white/40">Assigned driver</span>
                    <select
                      value={form.assigned_driver_id}
                      onChange={(e) => setForm((f) => ({ ...f, assigned_driver_id: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none"
                    >
                      <option value="">No regular driver</option>
                      {drivers.map((d) => {
                        const id    = d.drivers?.driver_id
                        const taken = id ? pairedElsewhere.get(id) : undefined
                        if (!id) return null
                        return (
                          <option key={id} value={id} disabled={!!taken}>
                            {d.first_name} {d.last_name}
                            {d.drivers?.license_number ? ` · ${d.drivers.license_number}` : ''}
                            {taken ? ` — already on ${taken}` : ''}
                          </option>
                        )
                      })}
                    </select>
                    <p className="text-[10px] text-white/25 mt-1">
                      Who normally drives this vehicle. Operations still picks the crew per booking —
                      this fills it in for them, it does not lock the vehicle to one person.
                    </p>
                  </label>
                )}

                {formError && (
                  <p className="text-xs text-red-400 border border-red-500/25 rounded-lg px-3 py-2 bg-red-500/10">
                    {formError}
                  </p>
                )}
              </fieldset>

              <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/[0.07]">
                {modalMode === 'edit' && editingTruck && canDelete && (
                  <button
                    type="button"
                    onClick={() => handleArchiveClick(editingTruck)}
                    disabled={truckLock.readOnly || editingTruck.status === 'in_use'}
                    title={editingTruck.status === 'in_use' ? 'Out on a booking — archive it once it is back in the yard' : undefined}
                    className="text-xs font-semibold text-yellow-400 hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    Archive vehicle…
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveClick}
                    disabled={isUnchanged || truckLock.readOnly}
                    title={truckLock.readOnly ? 'Someone else is editing this vehicle' : isUnchanged ? 'No changes to save' : undefined}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                    style={{ background: 'var(--color-cyan)' }}
                  >
                    {modalMode === 'create' ? 'Create' : 'Save'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}