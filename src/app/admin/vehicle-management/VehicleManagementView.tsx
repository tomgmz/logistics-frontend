'use client'

import Pagination from '@/components/ui/Pagination'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import {
  Pencil,
  Archive,
  Eye,
  X,
  Truck as TruckIcon,
  Wrench,
  Gauge,
  ChevronRight,
} from 'lucide-react'

import {
  ModelThumb,
  resolveModelImageUrl,
  STATUSES,
  EDITABLE_STATUSES,
  fmtLabel,
  statusStyle,
  kgToTons,
  fmtDimensions,
  InspectionBadge,
  TABLE_TAG,
} from './vehicle-ui'
import { assignedDriverName, needsReinspection, type Truck, type MaintenanceTruck, type CreateTruckInput, type UpdateTruckInput } from '@/app/types/truck.types'
import type { TruckModel } from '@/app/types/truck-model'
import {
  adminFetchTrucksPaginated,
  adminCreateTruck,
  adminUpdateTruck, flaggedBookingNotice,
  adminArchiveTruck,
  adminFetchTruckModels,
  adminFetchMaintenanceQueue,
  adminUploadFleetPhoto,
} from '@/lib/services/admin/trucks.service'
import { driverService } from '@/lib/services/admin/user-management.service'
import type { DriverUser } from '@/app/types/admin/user-management.types'
import ReusableModal from '@/components/layout/ReusableModal'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import TruckModelsTab from './TruckModelsTab'
import UpkeepTab, { toProblems, NEED_GROUPS, NEED_GROUP_ORDER, type NeedGroup } from './UpkeepTab'
import OdometerModal from './OdometerModal'
import RecordServiceModal from './RecordServiceModal'
import UpkeepHistory from './UpkeepHistory'
import {
  OdometerInput,
  PhotoField,
  ServiceStatusBadge,
  parseKm,
  fmtKm,
  fmtDay,
  phToday,
  inputCls,
} from './upkeep-ui'
import { useRecordLock, useRecordLocks } from '@/lib/hooks/useRecordLock'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import RecordLockBanner, { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import { type RowAction } from '@/components/ui/RowActionMenu'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { formatPlateNumber, plateError } from '@/lib/validation/plate'

import RefreshButton from '@/components/ui/RefreshButton'
import { useVehicleTypeOptions } from '@/lib/hooks/useVehicleTypes'
const PAGE_SIZE = 10

type FormMode    = 'create' | 'edit' | null
type ConfirmKind = 'save' | 'archive' | null

interface TruckFormState {
  plate_number: string
  model_id:     string
  status:       Truck['status']
  /** The vehicle's regular driver. '' means it has none. */
  assigned_driver_id: string
  // Odometer + routine service schedule (strings while typing).
  odometer_km:              string
  service_interval_km:      string
  service_interval_months:  string
  last_service_at:          string
  last_service_odometer_km: string
}

function emptyForm(): TruckFormState {
  return {
    plate_number: '',
    model_id:     '',
    status:       'available',
    assigned_driver_id: '',
    odometer_km:              '',
    service_interval_km:      '',
    service_interval_months:  '',
    last_service_at:          '',
    last_service_odometer_km: '',
  }
}

const numStr = (n: number | null | undefined) => (n == null ? '' : String(n))

function truckToForm(t: Truck): TruckFormState {
  return {
    plate_number: t.plate_number ?? '',
    model_id:     t.model_id ?? '',
    status:       t.status === 'recheck_due' ? 'available' : t.status,
    assigned_driver_id: t.assigned_driver_id ?? '',
    odometer_km:              numStr(t.odometer_km),
    service_interval_km:      numStr(t.service_interval_km),
    service_interval_months:  numStr(t.service_interval_months),
    last_service_at:          t.last_service_at ?? '',
    last_service_odometer_km: numStr(t.last_service_odometer_km),
  }
}

function formsEqual(a: TruckFormState, b: TruckFormState): boolean {
  return (Object.keys(a) as (keyof TruckFormState)[]).every((k) => a[k] === b[k])
}

/** Whole months 1–60, or null. */
function parseMonths(raw: string): number | null {
  const n = parseKm(raw)
  return n != null && n >= 1 && n <= 60 ? n : null
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
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
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
                <DetailRow label="Cargo bed (mm)">{fmtDimensions(truck.truck_model)}</DetailRow>
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
                <DetailRow label="Odometer">
                  {fmtKm(truck.odometer_km)}
                  {truck.odometer_recorded_at && (
                    <span className="block text-[10px] text-white/35">{fmtDate(truck.odometer_recorded_at)}</span>
                  )}
                  {truck.return_odometer_due && (
                    <span className="block text-[10px] text-amber-300">Return reading due</span>
                  )}
                </DetailRow>
                <DetailRow label="Service every">
                  {truck.service_interval_km != null && truck.service_interval_months != null
                    ? `${truck.service_interval_km.toLocaleString()} km or ${truck.service_interval_months} months`
                    : <span className="text-white/35">Not set</span>}
                </DetailRow>
                <DetailRow label="Last service">
                  {truck.last_service_at
                    ? `${fmtDay(truck.last_service_at)} · ${fmtKm(truck.last_service_odometer_km)}`
                    : <span className="text-white/35">Not set</span>}
                </DetailRow>
                <DetailRow label="Next service">
                  <span className="inline-flex justify-end"><ServiceStatusBadge status={truck.service_status} /></span>
                  {truck.service_status?.due_date && (
                    <span className="block text-[10px] text-white/35">
                      {fmtDay(truck.service_status.due_date)} or {fmtKm(truck.service_status.due_km)}
                    </span>
                  )}
                </DetailRow>
                <DetailRow label="Added">{fmtDate(truck.created_at)}</DetailRow>
                <DetailRow label="Last updated">{fmtDate(truck.updated_at)}</DetailRow>
              </div>

              <UpkeepHistory key={truck.truck_id} truckId={truck.truck_id} />
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

// Two tabs, one job each: Vehicles is what each vehicle is, Maintenance is what
// it owes before it can go out (the 'upkeep' key is the old name, kept for
// links). Models is not a tab; the header's Manage Models button opens it in a
// pop-up ('models' survives only so old ?tab=models links still open it).
type VehicleTab = 'vehicles' | 'models' | 'upkeep'

const TABS: { key: VehicleTab; label: string; icon: ReactNode }[] = [
  { key: 'vehicles', label: 'Vehicles', icon: <TruckIcon size={14} /> },
  { key: 'upkeep',   label: 'Maintenance', icon: <Wrench size={14} /> },
]

/** ?tab= value -> tab. 'maintenance' is the old name, kept so earlier links still land. */
function tabFromParam(v: string | null): VehicleTab | null {
  if (v === 'maintenance') return 'upkeep'
  return v === 'vehicles' || v === 'models' || v === 'upkeep' ? v : null
}

// Reads ?tab= (the fleet manager's report notification opens Maintenance) once.
// Isolated so useSearchParams sits under its own Suspense boundary.
function TabDeepLink({ onTab }: { onTab: (t: VehicleTab) => void }) {
  const searchParams = useSearchParams()
  const tab = tabFromParam(searchParams.get('tab'))
  const appliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (tab && appliedRef.current !== tab) {
      appliedRef.current = tab
      onTab(tab)
    }
  }, [tab, onTab])
  return null
}

export default function VehicleManagementView() {
  const [tab, setTab] = useState<VehicleTab>('vehicles')
  // The maintenance queue lives here, not in the tab: the tab badge and the
  // Vehicles rows' maintenance tags read the same list.
  const [upkeep,        setUpkeep]        = useState<MaintenanceTruck[]>([])
  const [upkeepLoading, setUpkeepLoading] = useState(true)
  const [upkeepError,   setUpkeepError]   = useState<string | null>(null)
  const [upkeepSearch,  setUpkeepSearch]  = useState('')
  // The vehicle clicked on the Vehicles tab; the Maintenance tab highlights it.
  const [focusId,       setFocusId]       = useState<string | null>(null)
  // Manage Models: a pop-up over the page, not a tab.
  const [modelsOpen,    setModelsOpen]    = useState(false)
  useBodyScrollLock(modelsOpen)

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
  // The vehicle as it was when opened — it may not be on the current page
  // (e.g. opened from the Maintenance tab).
  const [editingSnapshot, setEditingSnapshot] = useState<Truck | null>(null)
  const [createOdoPhoto,  setCreateOdoPhoto]  = useState<File | null>(null)
  const [odometerTruck,   setOdometerTruck]   = useState<Truck | null>(null)
  // Create only: pair the new vehicle with a regular driver straight away.
  const [pairOnCreate,    setPairOnCreate]    = useState(false)
  const [serviceTruck,    setServiceTruck]    = useState<Truck | null>(null)
  const [form,          setForm]          = useState<TruckFormState>(emptyForm())
  const [originalForm,  setOriginalForm]  = useState<TruckFormState>(emptyForm())
  const [formError,     setFormError]     = useState<string | null>(null)

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null)
  const [actionBusy,  setActionBusy]  = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Truck | null>(null)
  const [viewTruck,     setViewTruck]     = useState<Truck | null>(null)


  const isUnchanged = modalMode === 'edit' && formsEqual(form, originalForm)
  const editingTruck = useMemo(
    () => trucks.find((t) => t.truck_id === editingId) ?? (editingSnapshot?.truck_id === editingId ? editingSnapshot : null),
    [trucks, editingId, editingSnapshot],
  )

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

  // `quiet`: a live refresh re-reads in place — no spinner, and a transient
  // failure leaves the rows on screen instead of replacing them with an error.
  const loadTrucksPage = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setListLoading(true)
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
      if (!quiet) setListError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    } finally {
      if (!quiet) setListLoading(false)
    }
  }, [page, statusFilter, debouncedSearch])

  useEffect(() => {
    if (tab === 'vehicles') void loadModels()
  }, [tab, loadModels])

  const loadUpkeep = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setUpkeepLoading(true)
      setUpkeepError(null)
      setUpkeep(await adminFetchMaintenanceQueue())
    } catch (e) {
      if (!quiet) setUpkeepError(getApiErrorMessage(e, 'Could not load the maintenance list. Please try again.'))
    } finally {
      if (!quiet) setUpkeepLoading(false)
    }
  }, [])

  useEffect(() => { void loadUpkeep() }, [loadUpkeep])

  // truck_id -> which of the three needs it has open, for the Vehicles rows'
  // maintenance column. No entry means nothing owed: "Passed".
  const needsByTruck = useMemo(() => {
    const map = new Map<string, Set<NeedGroup>>()
    for (const p of toProblems(upkeep)) {
      const set = map.get(p.truck.truck_id) ?? new Set<NeedGroup>()
      set.add(p.group)
      map.set(p.truck.truck_id, set)
    }
    return map
  }, [upkeep])
  // The maintenance queue leaves Inactive vehicles out, so theirs is worked out
  // from the vehicle itself: inspection missing, failed or expired -> Blowbagets;
  // service not up to date -> Vehicle Maintenance. (Their driver reports are not
  // known here.)
  const needsFor = useCallback((t: Truck): Set<NeedGroup> | undefined => {
    if (t.status !== 'inactive') return needsByTruck.get(t.truck_id)
    const set = new Set<NeedGroup>()
    const insp = t.latest_inspection
    if (!insp || !insp.passed || needsReinspection(t)) set.add('blowbagets')
    const svc = t.service_status?.state
    if (svc && svc !== 'ok') set.add('vehicle_maintenance')
    return set.size ? set : undefined
  }, [needsByTruck])
  // The focused vehicle as currently loaded (the Vehicles page, else the queue),
  // so an edit made from the Maintenance tab shows straight away.
  const [focusSnapshot, setFocusSnapshot] = useState<Truck | null>(null)
  const focusTruck = focusId
    ? trucks.find((t) => t.truck_id === focusId) ?? upkeep.find((t) => t.truck_id === focusId) ?? focusSnapshot
    : null

  /** Vehicles row click: open Maintenance with this vehicle first and highlighted. */
  function openInMaintenance(t: Truck) {
    setUpkeepSearch('')
    setFocusSnapshot(t)
    setFocusId(t.truck_id)
    switchTab('upkeep')
  }

  const blockingCount = useMemo(() => toProblems(upkeep).filter((p) => p.blocking).length, [upkeep])

  // Live: someone else's edit, an inspection, a reading, a driver's return or
  // report — the vehicle list and the upkeep queue follow on their own.
  useLiveTable(['live:trucks', 'live:truck_models'], () => {
    if (tab === 'vehicles') {
      void loadTrucksPage(true)
      void loadModels()
    }
    void loadUpkeep(true)
  })

  const switchTab = useCallback((next: VehicleTab) => {
    setTab(next)
    // Keep the tab in the address so a refresh or a shared link lands on it.
    const url = new URL(window.location.href)
    if (next === 'vehicles') url.searchParams.delete('tab')
    else url.searchParams.set('tab', next)
    window.history.replaceState(window.history.state, '', url)
  }, [])

  useEffect(() => {
    void driverService.getAll().then(setDrivers).catch(() => setDrivers([]))
  }, [])

  useEffect(() => {
    void loadTrucksPage()
  }, [loadTrucksPage])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadModels(), loadTrucksPage(), loadUpkeep()])
  }, [loadModels, loadTrucksPage, loadUpkeep])

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

  // Vehicle type narrows the model strip. The type itself lives on the model,
  // so this is a filter, not a field of the vehicle.
  const [typeFilter, setTypeFilter] = useState('')
  const vehicleTypes = useVehicleTypeOptions(selectedModel?.vehicle_type, !!modalMode)
  const pickableModels = useMemo(
    () => typeFilter
      ? models.filter((m) => (m.vehicle_type ?? '').trim().toLowerCase() === typeFilter.toLowerCase())
      : models,
    [models, typeFilter],
  )

  function changeTypeFilter(value: string) {
    setTypeFilter(value)
    // A picked model of another type no longer fits the choice.
    if (value && selectedModel && (selectedModel.vehicle_type ?? '').trim().toLowerCase() !== value.toLowerCase()) {
      clearModelPick()
    }
  }

  function applyModelPick(modelId: string) {
    setForm((f) => ({ ...f, model_id: modelId }))
  }

  function clearModelPick() {
    setForm((f) => ({ ...f, model_id: '' }))
  }

  const openCreate = () => {
    setEditingId(null)
    setEditingSnapshot(null)
    setCreateOdoPhoto(null)
    setPairOnCreate(false)
    setForm(emptyForm())
    setOriginalForm(emptyForm())
    setFormError(null)
    setTypeFilter('')
    setModalMode('create')
  }

  const openEdit = (t: Truck) => {
    setEditingId(t.truck_id)
    setEditingSnapshot(t)
    const initial = truckToForm(t)
    setForm(initial)
    setOriginalForm(initial)
    setFormError(null)
    setTypeFilter(models.find((m) => m.model_id === initial.model_id)?.vehicle_type?.trim() ?? '')
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
    const plateMsg = plateError(form.plate_number)
    if (plateMsg) {
      setFormError(plateMsg)
      return false
    }

    // Odometer + service schedule. Required when creating; on an older vehicle
    // the parts not yet set are entered here once.
    const isCreate      = modalMode === 'create'
    const needOdometer  = isCreate || editingTruck?.odometer_km == null
    const needBaseline  = isCreate || !editingTruck?.last_service_at
    const odo           = parseKm(form.odometer_km)
    const everyKm       = parseKm(form.service_interval_km)
    const everyMonths   = parseMonths(form.service_interval_months)
    const lastKm        = parseKm(form.last_service_odometer_km)

    if (isCreate && pairOnCreate && !form.assigned_driver_id) {
      setFormError('Choose the regular driver, or turn off "Assign a regular driver".'); return false
    }
    if (needOdometer && (isCreate || form.odometer_km.trim()) && odo == null) {
      setFormError('Enter the current odometer in whole kilometres.'); return false
    }
    const intervalTouched = isCreate || form.service_interval_km.trim() || form.service_interval_months.trim()
    if (intervalTouched && (everyKm == null || everyKm < 100)) {
      setFormError('Enter the service interval in kilometres (at least 100).'); return false
    }
    if (intervalTouched && everyMonths == null) {
      setFormError('Enter the service interval in months (1 to 60).'); return false
    }
    const baselineTouched = needBaseline && (isCreate || form.last_service_at || form.last_service_odometer_km.trim())
    if (baselineTouched) {
      if (!form.last_service_at) { setFormError('Enter the last service date.'); return false }
      if (form.last_service_at > phToday()) { setFormError('The last service date cannot be in the future.'); return false }
      if (lastKm == null) { setFormError('Enter the odometer at the last service.'); return false }
      const currentKm = odo ?? editingTruck?.odometer_km ?? null
      if (currentKm != null && lastKm > currentKm) {
        setFormError('The last service odometer cannot be higher than the current odometer.'); return false
      }
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
        const odometer_photo_url = createOdoPhoto ? await adminUploadFleetPhoto(createOdoPhoto) : null
        const body: CreateTruckInput = {
          plate_number: form.plate_number.trim().toUpperCase(),
          model_id,
          odometer_km:              parseKm(form.odometer_km)!,
          odometer_photo_url,
          service_interval_km:      parseKm(form.service_interval_km)!,
          service_interval_months:  parseMonths(form.service_interval_months)!,
          last_service_at:          form.last_service_at,
          last_service_odometer_km: parseKm(form.last_service_odometer_km)!,
          assigned_driver_id:       pairOnCreate ? form.assigned_driver_id || null : null,
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
        // Schedule: intervals whenever given; the baseline and first odometer
        // only while the vehicle has none (after that they move through Record
        // Service and the delivery readings).
        const everyKm     = parseKm(form.service_interval_km)
        const everyMonths = parseMonths(form.service_interval_months)
        if (everyKm != null)     body.service_interval_km     = everyKm
        if (everyMonths != null) body.service_interval_months = everyMonths
        if (!editingTruck?.last_service_at && form.last_service_at) {
          body.last_service_at          = form.last_service_at
          body.last_service_odometer_km = parseKm(form.last_service_odometer_km)!
        }
        if (editingTruck?.odometer_km == null && parseKm(form.odometer_km) != null) {
          body.odometer_km = parseKm(form.odometer_km)!
        }
        const saved   = await adminUpdateTruck(editingId, body)
        const flagged = flaggedBookingNotice(saved?.plate_number ?? 'The vehicle', saved?.flagged_booking)
        if (flagged) appToast.warn(flagged, { action: 'truck-save', entityId: editingId })
        else appToast.success('Vehicle updated.', { action: 'truck-save', entityId: editingId })
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
      // Its own record, apart from BLOWBAGETS: the after-delivery reading when
      // the vehicle is back from a job, otherwise an update at any time.
      actions.push({
        label: t.return_odometer_due ? 'Record Return Odometer' : 'Update Odometer', icon: <Gauge size={13} />,
        tone: t.return_odometer_due ? 'accent' : 'default',
        onSelect: () => setOdometerTruck(t),
        disabled: !!lockedBy, title: lockedTitle,
      })
      // BLOWBAGETS lives on the Upkeep tab now. Record Service stays here too,
      // for a vehicle serviced early while nothing is due.
      actions.push({
        label: 'Record Service', icon: <Wrench size={13} />,
        tone: 'default',
        onSelect: () => setServiceTruck(t),
        disabled: !!lockedBy, title: lockedTitle,
      })
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

      <Suspense fallback={null}>
        <TabDeepLink onTab={(t) => (t === 'models' ? setModelsOpen(true) : setTab(t))} />
      </Suspense>

      <header className="shrink-0 px-3 pt-3 lg:px-4 3xl:px-[19px] border-b border-[#424242] flex flex-col gap-2 bg-[#0a0a0a]">
        <div className="flex flex-wrap items-center gap-2 3xl:gap-[10px]">
          <h1 className="mr-auto text-[18px] 3xl:text-[24px] font-bold text-white">Vehicle Management</h1>
          <RefreshButton onClick={() => void refreshAll()} />
          <button
            type="button"
            onClick={() => setModelsOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex h-9 3xl:h-11 items-center gap-2 3xl:gap-[9px] whitespace-nowrap rounded-[10px] border border-[#818181] px-3 3xl:px-6 text-[14px] 3xl:text-[18px] text-white transition hover:bg-white/5 active:scale-95"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/vehicle-management/manage-models.svg" alt="" width={24} height={24} draggable={false} className="size-5 3xl:size-6" />
            Manage Models
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 3xl:h-11 items-center gap-2 3xl:gap-[9px] whitespace-nowrap rounded-[10px] border border-[#4df9ed] bg-[#4df9ed]/[0.19] px-3 3xl:px-6 text-[14px] 3xl:text-[18px] text-[#4df9ed] transition hover:bg-[#4df9ed]/30 active:scale-95"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/vehicle-management/add.svg" alt="" width={24} height={24} draggable={false} className="size-5 3xl:size-6" />
              Add Vehicle
            </button>
          )}
        </div>
        <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist" aria-label="Vehicle management sections">
          {TABS.map(({ key, label, icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setFocusId(null); switchTab(key) }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] 3xl:text-[16px] font-bold border-b-2 transition-colors whitespace-nowrap ${
                  active ? 'text-[var(--color-cyan)] border-[var(--color-cyan)]' : 'text-[#818181] border-transparent hover:text-white/80'
                }`}
              >
                {icon}
                {label}
                {key === 'upkeep' && blockingCount > 0 && (
                  <span className="ml-0.5 min-w-[18px] px-1 rounded-full text-[11px] leading-[18px] text-center bg-[#4df9ed] text-black font-bold">
                    {blockingCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </header>

      {/* Manage Models pop-up. z-60: the models' own form (z-66), row menus (z-65)
          and confirm pop-ups (z-70) open above it. */}
      <AnimatePresence>
        {modelsOpen && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-2 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModelsOpen(false)}
          >
            {/* Not transformed (no scale/slide): a transformed parent would trap the
                models' own fixed pop-ups inside this panel. */}
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Manage Models"
              className="flex h-[90dvh] w-full max-w-[1200px] flex-col overflow-hidden rounded-[10px] border border-[#424242] bg-[#0a0a0a] shadow-[0_4px_4px_rgba(0,0,0,0.25)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#424242] px-3 py-2.5 lg:px-4">
                <h2 className="text-[16px] 3xl:text-[20px] font-bold text-white">Manage Models</h2>
                <button
                  type="button"
                  onClick={() => setModelsOpen(false)}
                  aria-label="Close"
                  className="rounded-md p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <TruckModelsTab canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {tab === 'upkeep' && (
        <UpkeepTab
          rows={upkeep}
          loading={upkeepLoading}
          error={upkeepError}
          onReload={() => { void loadUpkeep(); void loadTrucksPage(true) }}
          canEdit={canEdit}
          search={upkeepSearch}
          onSearchChange={setUpkeepSearch}
          onSetUpSchedule={(t) => openEdit(t)}
          onRecordOdometer={(t) => setOdometerTruck(t)}
          focusTruck={focusTruck}
          vehicleActions={rowActions}
        />
      )}

      {tab === 'vehicles' && (
      <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 3xl:p-[34px] 3xl:pl-9 gap-3 3xl:gap-[14px] overflow-hidden bg-[#0a0a0a]">

        {/* Filters */}
        <div className="flex flex-col xl:flex-row gap-2 xl:items-center shrink-0">
          <div className="relative min-w-0 flex-1 xl:max-w-[360px] 3xl:max-w-[466px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/booking-management/search.svg" alt="" width={22} height={22} draggable={false}
              className="pointer-events-none absolute left-3 3xl:left-[18px] top-1/2 size-4 3xl:size-[22px] -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Search plate, model, status..."
              aria-label="Search vehicles"
              className="h-9 3xl:h-[46px] w-full rounded-[10px] border border-[#818181] bg-[#424242] pl-9 3xl:pl-[49px] pr-4 text-[14px] 3xl:text-[18px] text-white placeholder:text-[#818181] outline-none transition focus:border-[#4df9ed]"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0 xl:ml-auto">
            <label htmlFor="vehicle-status-filter" className="text-[13px] 3xl:text-[16px] font-bold text-[#818181]">
              status
            </label>
            <div className="relative">
              <select
                id="vehicle-status-filter"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
                className="appearance-none h-8 3xl:h-[38px] min-w-[140px] 3xl:min-w-[141px] rounded-[10px] border-[0.5px] border-[#818181] bg-[#2a2828] pl-3 3xl:pl-[15px] pr-8 text-[13px] 3xl:text-[16px] font-bold text-[#4df9ed] outline-none focus:border-[#4df9ed] cursor-pointer [&>option]:bg-[#2a2828] [&>option]:text-white"
              >
                {(['all', ...STATUSES] as const).map((key) => (
                  <option key={key} value={key}>
                    {key === 'all' ? 'All' : fmtLabel(key)}
                    {key === statusFilter && listMeta ? ` (${listMeta.total})` : ''}
                  </option>
                ))}
              </select>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/vehicle-management/chevron-down.svg" alt="" width={15} height={15} draggable={false}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 rounded-[10px] border-[0.5px] border-[#424242] overflow-hidden flex flex-col bg-[#1b1b1b] shadow-[0_4px_4px_rgba(0,0,0,0.25)]">
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
              {/* "Add your first vehicle" only when the fleet really is empty —
                  not when a search or status filter just hides everything. */}
              <p className="text-sm text-white/45">
                {debouncedSearch || statusFilter !== 'all' ? 'No vehicles match your filters.' : 'No vehicles yet.'}
              </p>
              {canCreate && !debouncedSearch && statusFilter === 'all' && (
                <button type="button" onClick={openCreate} className="text-[var(--color-cyan)] text-sm font-bold">
                  Add your first vehicle
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  {/* Headers keep the small caps face; the data rows are regular Alegreya Sans. */}
                  <thead className="sticky top-0 z-[1] bg-[#181717]">
                    <tr className="text-[13px] 3xl:text-[16px] text-[#818181] [&>th]:border-b [&>th]:border-[#818181] [&>th]:font-bold [&>th]:px-3 3xl:[&>th]:px-6 [&>th]:py-2.5 3xl:[&>th]:py-[13px] [&>th]:whitespace-nowrap">
                      <th className="w-14 3xl:w-[100px]">image</th>
                      <th>plate no.</th>
                      <th>vehicle type</th>
                      <th className="hidden md:table-cell">model</th>
                      <th className="hidden md:table-cell">max weight</th>
                      <th className="hidden lg:table-cell">driver</th>
                      <th>status</th>
                      <th>maintenance</th>
                      {/* No header text, as in the Figma; the arrow says the row opens Maintenance. */}
                      <th className="w-12"><span className="sr-only">open</span></th>
                    </tr>
                  </thead>
                  <tbody className="ff-regular text-[13px] 3xl:text-[16px] text-white">
                    {trucks.map((t) => {
                      const st         = statusStyle(t.status)
                      const needs      = needsFor(t)
                      const modelLabel = t.truck_model?.name ?? 'Vehicle'
                      const thumbUrl   = resolveModelImageUrl((t.truck_model?.image_url as string | null | undefined) ?? null)
                      return (
                        <tr
                          key={t.truck_id}
                          role="button"
                          tabIndex={0}
                          title="Open in the Maintenance tab"
                          onClick={() => openInMaintenance(t)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInMaintenance(t) }
                          }}
                          className="border-b border-[#818181] cursor-pointer hover:bg-white/[0.03] transition-colors [&>td]:px-3 3xl:[&>td]:px-6 [&>td]:py-2 3xl:h-[55px]"
                        >
                          <td className="align-middle">
                            <ModelThumb imageUrl={thumbUrl} label={modelLabel} size={40} />
                          </td>
                          <td className="font-bold text-[#4df9ed] whitespace-nowrap">{t.plate_number}</td>
                          <td>
                            {t.truck_model?.vehicle_type ?? '—'}
                          </td>
                          <td className="max-w-[200px] truncate hidden md:table-cell">
                            {t.truck_model?.name ?? '—'}
                          </td>
                          <td className="hidden md:table-cell tabular-nums whitespace-nowrap">
                            {t.truck_model?.max_weight_kg != null
                              ? `${t.truck_model.max_weight_kg.toLocaleString()} kg · ${kgToTons(t.truck_model.max_weight_kg)} t`
                              : '—'}
                          </td>
                          <td className="hidden lg:table-cell">
                            {assignedDriverName(t)
                              ? (
                                <span>
                                  {assignedDriverName(t)}
                                  {t.assigned_driver?.license_number && (
                                    <span className="block text-[11px] text-[#818181]/70">
                                      {t.assigned_driver.license_number}
                                    </span>
                                  )}
                                </span>
                              )
                              : <span className="text-[#818181]/60">Unassigned</span>}
                          </td>
                          <td>
                            <span className={TABLE_TAG} style={{ color: st.color, borderColor: st.color, background: st.bg }}>
                              {fmtLabel(t.status)}
                            </span>
                          </td>
                          {/* Maintenance: Passed when nothing is owed, otherwise one tag per need. */}
                          <td>
                            {t.status === 'archived' ? (
                              <span className="text-white">---</span>
                            ) : !needs ? (
                              <span className={TABLE_TAG} style={{ color: '#3af626', borderColor: '#3af626', background: 'rgba(58,246,38,0.1)' }}>
                                Passed
                              </span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1">
                                {NEED_GROUP_ORDER.filter((g) => needs.has(g)).map((g) => (
                                  <span
                                    key={g}
                                    className={TABLE_TAG}
                                    style={{ color: NEED_GROUPS[g].color, borderColor: NEED_GROUPS[g].color, background: NEED_GROUPS[g].bg }}
                                  >
                                    {NEED_GROUPS[g].short}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          <td>
                            <div className="flex items-center justify-end gap-1.5">
                              <RecordLockBadge holder={truckLocks.get(t.truck_id)} />
                              <ChevronRight size={18} className="text-[#818181]" aria-hidden />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination page={pageSafe + 1} totalPages={pageCount} total={totalRows} pageSize={PAGE_SIZE} onPageChange={(p) => setPage(p - 1)} />
            </>
          )}
        </div>
      </div>
      )}

      <OdometerModal
        truck={odometerTruck}
        onClose={() => setOdometerTruck(null)}
        onRecorded={() => { void loadTrucksPage(); void loadUpkeep() }}
      />

      <RecordServiceModal
        truck={serviceTruck}
        onClose={() => setServiceTruck(null)}
        onRecorded={() => { void loadTrucksPage(); void loadUpkeep() }}
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
              className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
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
                  <label htmlFor="vehicle-type-filter" className="text-[11px] font-bold uppercase text-white/40">
                    Vehicle type
                  </label>
                  <select
                    id="vehicle-type-filter"
                    value={typeFilter}
                    onChange={(e) => changeTypeFilter(e.target.value)}
                    disabled={vehicleTypes.loading}
                    style={{ colorScheme: 'dark' }}
                    className="mt-1 mb-3 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-base sm:text-sm text-white outline-none focus:border-[var(--color-cyan)]/40"
                  >
                    <option value="">{vehicleTypes.loading ? 'Loading types…' : 'All types'}</option>
                    {vehicleTypes.options.map((vt) => (
                      <option key={vt} value={vt}>{vt}</option>
                    ))}
                  </select>

                  <span className="text-[11px] font-bold uppercase text-white/40">
                    Model
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

                    {pickableModels.map((m) => {
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
                  {typeFilter && pickableModels.length === 0 && (
                    <p className="text-[11px] text-white/40 mt-1.5 leading-snug">
                      No {typeFilter} models yet. Add one in Manage models, or pick another type.
                    </p>
                  )}
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

                {/* Odometer + routine service schedule. Required for a new vehicle;
                    on an older one, whatever is still missing is entered here once. */}
                <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3 space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">Odometer &amp; routine service</p>

                  {(modalMode === 'create' || editingTruck?.odometer_km == null) ? (
                    <>
                      <OdometerInput
                        value={form.odometer_km}
                        onChange={(v) => setForm((f) => ({ ...f, odometer_km: v }))}
                        label="Current odometer (km)"
                      />
                      {modalMode === 'create' && (
                        <PhotoField file={createOdoPhoto} onFile={setCreateOdoPhoto} label="Odometer photo" />
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-white/45">
                      Odometer: <span className="text-white/75 font-mono">{fmtKm(editingTruck.odometer_km)}</span>
                      {' '}— change it with Update Odometer on the vehicle&apos;s menu.
                    </p>
                  )}

                  <div>
                    <span className="text-[11px] font-bold uppercase text-white/40">
                      Service every <span className="text-red-400">*</span>
                    </span>
                    <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div className="relative">
                        <input
                          value={form.service_interval_km}
                          onChange={(e) => setForm((f) => ({ ...f, service_interval_km: e.target.value }))}
                          inputMode="numeric"
                          placeholder="e.g. 5000"
                          className={`${inputCls} mt-0 pr-10 font-mono tabular-nums`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/35">km</span>
                      </div>
                      <span className="text-[11px] text-white/40">or</span>
                      <div className="relative">
                        <input
                          value={form.service_interval_months}
                          onChange={(e) => setForm((f) => ({ ...f, service_interval_months: e.target.value }))}
                          inputMode="numeric"
                          placeholder="e.g. 3"
                          className={`${inputCls} mt-0 pr-16 font-mono tabular-nums`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/35">months</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-white/25 mt-1">
                      Whichever comes first. An overdue vehicle cannot be assigned until its service is recorded.
                    </p>
                  </div>

                  {(modalMode === 'create' || !editingTruck?.last_service_at) ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-bold uppercase text-white/40">
                          Last service <span className="text-red-400">*</span>
                        </span>
                        <input
                          type="date"
                          value={form.last_service_at}
                          max={phToday()}
                          onChange={(e) => setForm((f) => ({ ...f, last_service_at: e.target.value }))}
                          className={inputCls}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-bold uppercase text-white/40">
                          Odometer then <span className="text-red-400">*</span>
                        </span>
                        <input
                          value={form.last_service_odometer_km}
                          onChange={(e) => setForm((f) => ({ ...f, last_service_odometer_km: e.target.value }))}
                          inputMode="numeric"
                          placeholder="km"
                          className={`${inputCls} font-mono tabular-nums`}
                        />
                      </label>
                      <p className="col-span-2 text-[10px] text-white/25 -mt-1">
                        Never serviced? Use the day it was put into service and its odometer then.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-white/45">
                      Last service: <span className="text-white/75">{fmtDay(editingTruck.last_service_at)}</span>
                      {' '}at <span className="text-white/75 font-mono">{fmtKm(editingTruck.last_service_odometer_km)}</span>
                      {' '}— log new ones with Record Service.
                    </p>
                  )}
                </div>

                {modalMode === 'edit' && (
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-white/40">Status</span>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Truck['status'] }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none"
                    >
                      {/* In use is set by assignment, so it is only shown when it is
                          already the vehicle's status. */}
                      {EDITABLE_STATUSES.filter((s) => s !== 'in_use' || editingTruck?.status === 'in_use').map((s) => (
                        <option key={s} value={s}>{fmtLabel(s)}</option>
                      ))}
                    </select>
                  </label>
                )}

                {/* The vehicle's regular driver. On create it sits behind a toggle,
                    since most new vehicles are paired later (or never). */}
                {modalMode === 'create' && (
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 cursor-pointer">
                    <span className="min-w-0">
                      <span className="block text-[11px] font-bold uppercase text-white/50">Assign a regular driver</span>
                      <span className="block text-[10px] text-white/30 mt-0.5">Pair this vehicle with the driver who normally drives it.</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pairOnCreate}
                      onClick={() => {
                        setPairOnCreate((on) => !on)
                        if (pairOnCreate) setForm((f) => ({ ...f, assigned_driver_id: '' }))
                      }}
                      className="relative shrink-0 w-10 h-[22px] rounded-full border transition-colors"
                      style={pairOnCreate
                        ? { background: 'rgba(77,249,237,0.25)', borderColor: 'rgba(77,249,237,0.55)' }
                        : { background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)' }}
                    >
                      <span
                        className="absolute top-[2px] w-4 h-4 rounded-full transition-all"
                        style={{ left: pairOnCreate ? 20 : 3, background: pairOnCreate ? 'var(--color-cyan)' : 'rgba(255,255,255,0.45)' }}
                      />
                    </button>
                  </label>
                )}
                {(modalMode === 'edit' || pairOnCreate) && (
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-white/40">
                      Assigned driver{modalMode === 'create' && <span className="text-red-400"> *</span>}
                    </span>
                    <select
                      value={form.assigned_driver_id}
                      onChange={(e) => setForm((f) => ({ ...f, assigned_driver_id: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none"
                    >
                      <option value="">{modalMode === 'create' ? 'Select driver' : 'No regular driver'}</option>
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