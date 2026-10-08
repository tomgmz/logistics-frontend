'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
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
  Layers,
  Wrench,
  Gauge,
  ClipboardCheck,
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
} from './vehicle-ui'
import { assignedDriverName, isRoadworthy, needsReinspection, type Truck, type TruckInspection, type CreateTruckInput, type UpdateTruckInput } from '@/app/types/truck.types'
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
import MaintenanceTab from './MaintenanceTab'
import ReturnOdometerModal from './ReturnOdometerModal'
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
import BlowbagetsInspectionModal from './BlowbagetsInspectionModal'
import { useRecordLock, useRecordLocks } from '@/lib/hooks/useRecordLock'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
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
    status:       t.status,
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

type VehicleTab = 'vehicles' | 'models' | 'maintenance'

const TABS: { key: VehicleTab; label: string; icon: ReactNode }[] = [
  { key: 'vehicles',    label: 'Vehicles',    icon: <TruckIcon size={14} /> },
  { key: 'models',      label: 'Models',      icon: <Layers size={14} /> },
  { key: 'maintenance', label: 'Maintenance', icon: <Wrench size={14} /> },
]

function isVehicleTab(v: string | null): v is VehicleTab {
  return v === 'vehicles' || v === 'models' || v === 'maintenance'
}

// Reads ?tab= (the fleet manager's report notification opens Maintenance) once.
// Isolated so useSearchParams sits under its own Suspense boundary.
function TabDeepLink({ onTab }: { onTab: (t: VehicleTab) => void }) {
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab')
  const appliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (isVehicleTab(tab) && appliedRef.current !== tab) {
      appliedRef.current = tab
      onTab(tab)
    }
  }, [tab, onTab])
  return null
}

export default function VehicleManagementView() {
  const [tab, setTab] = useState<VehicleTab>('vehicles')
  // Shown on the Maintenance tab before anyone opens it.
  const [maintenanceCount, setMaintenanceCount] = useState<number | null>(null)
  // Bumped after a save so an open Maintenance tab re-reads its list.
  const [maintenanceKey, setMaintenanceKey] = useState(0)

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
  const [returnTruck,     setReturnTruck]     = useState<Truck | null>(null)
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

  const loadMaintenanceCount = useCallback(() => {
    void adminFetchMaintenanceQueue()
      .then((list) => setMaintenanceCount(list.length))
      .catch(() => setMaintenanceCount(null))
  }, [])

  useEffect(() => {
    if (tab !== 'maintenance') loadMaintenanceCount()
  }, [tab, loadMaintenanceCount])

  // Live: someone else's edit, an inspection, a reading, a driver's return or
  // report — the vehicle list and the Maintenance count follow on their own.
  useLiveTable(['live:trucks', 'live:truck_models'], () => {
    if (tab === 'vehicles') {
      void loadTrucksPage(true)
      void loadModels()
    }
    if (tab !== 'maintenance') loadMaintenanceCount()
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
    setEditingSnapshot(null)
    setCreateOdoPhoto(null)
    setForm(emptyForm())
    setOriginalForm(emptyForm())
    setFormError(null)
    setModalMode('create')
  }

  const openEdit = (t: Truck) => {
    setEditingId(t.truck_id)
    setEditingSnapshot(t)
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

    // Odometer + service schedule. Required when creating; on an older vehicle
    // the parts not yet set are entered here once.
    const isCreate      = modalMode === 'create'
    const needOdometer  = isCreate || editingTruck?.odometer_km == null
    const needBaseline  = isCreate || !editingTruck?.last_service_at
    const odo           = parseKm(form.odometer_km)
    const everyKm       = parseKm(form.service_interval_km)
    const everyMonths   = parseMonths(form.service_interval_months)
    const lastKm        = parseKm(form.last_service_odometer_km)

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
      loadMaintenanceCount()
      setMaintenanceKey((k) => k + 1)
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
      // Back from a delivery: the after-delivery odometer comes first.
      if (t.return_odometer_due) {
        actions.push({
          label: 'Record Return Odometer', icon: <Gauge size={13} />, tone: 'accent',
          onSelect: () => setReturnTruck(t),
          disabled: !!lockedBy, title: lockedTitle,
        })
      }
      // Only offered while the vehicle is actually blocked on BLOWBAGETS: never
      // inspected, failed, or back from a booking since its last pass.
      if (!isRoadworthy(t)) {
        actions.push({
          label: 'Approve Vehicle', icon: <ClipboardCheck size={13} />,
          tone: t.return_odometer_due ? 'default' : 'accent',
          onSelect: () => setInspectTruck(t),
          disabled: !!lockedBy || !!t.return_odometer_due,
          title: lockedTitle ?? (t.return_odometer_due
            ? 'Record the return odometer first'
            : 'Run the BLOWBAGETS inspection and take the before-delivery odometer'),
        })
      }
      actions.push({
        label: 'Record Service', icon: <Wrench size={13} />,
        tone: t.service_status?.state === 'overdue' ? 'accent' : 'default',
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
        <TabDeepLink onTab={setTab} />
      </Suspense>

      <header className="shrink-0 px-3 pt-3 lg:px-4 border-b border-white/[0.07] flex flex-col gap-2">
        <h1 className="text-lg font-bold text-white tracking-tight">Vehicle management</h1>
        <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist" aria-label="Vehicle management sections">
          {TABS.map(({ key, label, icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
                  active ? 'text-[var(--color-cyan)] border-[var(--color-cyan)]' : 'text-white/50 border-transparent hover:text-white/80'
                }`}
              >
                {icon}
                {label}
                {key === 'maintenance' && maintenanceCount != null && maintenanceCount > 0 && (
                  <span className="ml-0.5 min-w-[18px] px-1 rounded-full text-[10px] leading-[18px] text-center bg-amber-400/15 text-amber-300 border border-amber-400/30">
                    {maintenanceCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </header>

      {tab === 'models' && (
        <TruckModelsTab canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
      )}

      {tab === 'maintenance' && (
        <MaintenanceTab
          key={maintenanceKey}
          canEdit={canEdit}
          onCount={setMaintenanceCount}
          onSetUpSchedule={(t) => openEdit(t)}
        />
      )}

      {tab === 'vehicles' && (
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

          <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
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
                <table className="w-full text-left text-sm border-collapse min-w-[760px]">
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
                      <th className="px-3 py-2.5 font-bold hidden md:table-cell">Service</th>
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
                            <div className="flex flex-col gap-1 items-start">
                              {t.return_odometer_due && (
                                <span
                                  className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                                  style={{ color: '#fbbf24', borderColor: 'rgba(246,159,38,0.35)', background: 'rgba(246,159,38,0.12)' }}
                                  title="Back from a delivery — record the return odometer before the next inspection"
                                >
                                  Return odometer due
                                </span>
                              )}
                              <InspectionBadge inspection={t.latest_inspection ?? null} dueRecheck={needsReinspection(t)} />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 hidden md:table-cell">
                            <ServiceStatusBadge status={t.service_status} />
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
      )}

      {/* BLOWBAGETS inspection — the gate on whether operations can assign this
          vehicle to a booking. */}
      <ReturnOdometerModal
        truck={returnTruck}
        onClose={() => setReturnTruck(null)}
        onRecorded={() => { void loadTrucksPage() }}
      />

      <RecordServiceModal
        truck={serviceTruck}
        onClose={() => setServiceTruck(null)}
        onRecorded={() => { void loadTrucksPage(); loadMaintenanceCount() }}
      />

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
                      {' '}— it moves with the before and after delivery readings.
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