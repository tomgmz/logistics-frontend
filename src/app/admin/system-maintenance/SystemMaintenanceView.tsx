'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Tag, Layers, Package, Phone, Truck, Pencil, Trash2, X, Search } from 'lucide-react'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { systemMaintenanceService, type CatalogTab } from '@/lib/services/admin/system-maintenance.service'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import { useRecordLock, useRecordLocks } from '@/lib/hooks/useRecordLock'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import RecordLockBanner, { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import ReusableModal from '@/components/layout/ReusableModal'
import type {
  Commodity,
  CreateCommodityPayload,
  CreateHandlingCodePayload,
  CreateLandlinePrefixPayload,
  CreateProductPayload,
  HandlingCode,
  HandlingCodeType,
  LandlinePrefix,
  Product,
  UpdateLandlinePrefixPayload,
  VehicleType,
} from '@/lib/services/admin/system-maintenance.service'

import RefreshButton from '@/components/ui/RefreshButton'
import Pagination from '@/components/ui/Pagination'
import { useServerTable } from '@/lib/hooks/useServerTable'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'


const TABS = [
  { key: 'handling',      label: 'Handling Codes',    singular: 'Handling Code',   icon: Tag },
  { key: 'commodities',   label: 'Commodities',       singular: 'Commodity',       icon: Layers },
  { key: 'products',      label: 'Products',          singular: 'Product',         icon: Package },
  { key: 'landline',      label: 'Landline Prefixes', singular: 'Landline Prefix', icon: Phone },
  { key: 'vehicle_types', label: 'Vehicle Types',     singular: 'Vehicle Type',    icon: Truck },
] as const
type TabKey = (typeof TABS)[number]['key']

type HandlingForm    = { code: string; name: string; description: string; type: HandlingCodeType }
type CommodityForm   = { name: string; description: string; category: string }
type ProductForm     = { commodity_id: string; name: string; description: string; unit: string }
type LandlineForm    = { prefix: string; city: string; region: string }
type VehicleTypeForm = { name: string; description: string; is_active: boolean }

const initHandling:    HandlingForm    = { code: '', name: '', description: '', type: 'standard' }
const initCommodity:   CommodityForm   = { name: '', description: '', category: '' }
const initProduct:     ProductForm     = { commodity_id: '', name: '', description: '', unit: '' }
const initLandline:    LandlineForm    = { prefix: '', city: '', region: '' }
const initVehicleType: VehicleTypeForm = { name: '', description: '', is_active: true }

const VEHICLE_TYPE_NAME_MAX = 60
const VEHICLE_TYPE_DESC_MAX = 300

// 16px on phones: iOS Safari zooms the page into any input smaller than that.
const inputCls =
  'w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-base sm:text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#4DF9ED]/40 focus:ring-0 disabled:opacity-50'
const labelCls = 'block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5'

/** Collapse inner whitespace, as the server stores vehicle type names. */
const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ')

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {error
        ? <p className="mt-1 text-[11px] text-red-400">{error}</p>
        : hint && <p className="mt-1 text-[11px] text-white/30">{hint}</p>}
    </div>
  )
}

type ConfirmTarget =
  | { kind: 'prefix'; item: LandlinePrefix }
  | { kind: 'vehicle_type'; item: VehicleType }

export default function SystemMaintenanceView() {
  // System-maintenance tier: hide the create/edit form and per-row write actions.
  const { canCreate, canEdit, canDelete } = useModuleAccess()

  const [tab, setTab] = useState<TabKey>('handling')
  const [search, setSearch] = useState('')

  // Full lists only where a form needs them: the product form's commodity
  // picker and the vehicle type duplicate-name check. The table pages on the server.
  const [commodities,   setCommodities]  = useState<Commodity[]>([])
  const [vehicleTypes,  setVehicleTypes] = useState<VehicleType[]>([])

  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirm,  setConfirm]  = useState<ConfirmTarget | null>(null)

  const [hForm, setHForm] = useState<HandlingForm>(initHandling)
  const [cForm, setCForm] = useState<CommodityForm>(initCommodity)
  const [pForm, setPForm] = useState<ProductForm>(initProduct)

  // The active tab's list, one server page at a time (10 on phones, 20 from
  // tablet up). `meta.tab` says which tab the rows belong to, so a tab switch
  // never renders the previous tab's rows with the new tab's columns.
  const debouncedSearch = useDebouncedValue(search.trim())
  const table = useServerTable(
    async (q) => {
      const t   = tab as CatalogTab
      const res = await systemMaintenanceService.getCatalogPage(t, {
        ...q,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(t === 'products' && pForm.commodity_id && { commodity_id: pForm.commodity_id }),
      })
      return { data: res.data, meta: { ...res.meta, tab: t } }
    },
    `${tab}|${debouncedSearch}|${tab === 'products' ? pForm.commodity_id : ''}`,
    { errorMessage: 'Failed to load data' },
  )
  const { page, setPage, pageSize: PAGE_SIZE, totalPages } = table
  const tableReady = table.meta?.tab === tab
  const refreshTable = () => { void table.reload(true) }
  const [lForm, setLForm] = useState<LandlineForm>(initLandline)
  const [vForm, setVForm] = useState<VehicleTypeForm>(initVehicleType)
  const [vTouched, setVTouched] = useState(false)

  const [editingPrefix, setEditingPrefix] = useState<LandlinePrefix | null>(null)
  const [editingType,   setEditingType]   = useState<VehicleType | null>(null)

  // Below lg the form panel would squeeze the list to nothing, so the form
  // opens as a sheet over the list instead.
  const compact = useIsMobile(1024)
  const [sheetOpen, setSheetOpen] = useState(false)
  useBodyScrollLock(compact && sheetOpen)

  // One admin edits a prefix at a time; a form that waited on someone else's
  // edit is stale, so it is dropped and the list re-read.
  const prefixLock = useRecordLock({
    type:    'landline_prefix',
    id:      editingPrefix?.prefix_id ?? null,
    onStale: () => {
      appToast.info('This prefix was just changed by someone else. Reopen it to edit the latest.')
      cancelEdit()
      void load()
    },
  })
  const prefixLocks = useRecordLocks('landline_prefix', tab === 'landline')

  const typeLock = useRecordLock({
    type:    'vehicle_type',
    id:      editingType?.vehicle_type_id ?? null,
    onStale: () => {
      appToast.info('This vehicle type was just changed by someone else. Reopen it to edit the latest.')
      cancelEdit()
      void load()
    },
  })
  const typeLocks = useRecordLocks('vehicle_type', tab === 'vehicle_types')

  // `quiet` re-reads in place (a live signal): no spinner and no error toast.
  async function load(quiet = false) {
    try {
      if (!quiet) setLoading(true)
      const [comms, types] = await Promise.all([
        systemMaintenanceService.getCommodities(),
        systemMaintenanceService.getVehicleTypes(),
        table.reload(true),
      ])
      setCommodities(comms)
      setVehicleTypes(types)
    } catch (e: unknown) {
      if (!quiet) appToast.error(getApiErrorMessage(e) || 'Failed to load data')
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  useLiveTable(['live:catalog'], () => { void load(true) })

  // Escape closes the sheet, as it does every other pop-up.
  useEffect(() => {
    if (!(compact && sheetOpen)) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheet() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Keep the selected tab in view on a phone, where the tab row scrolls.
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({})
  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab])

  function cancelEdit() {
    setEditingPrefix(null)
    setLForm(initLandline)
    setEditingType(null)
    setVForm(initVehicleType)
    setVTouched(false)
  }

  function closeSheet() {
    setSheetOpen(false)
    cancelEdit()
  }

  function switchTab(key: TabKey) {
    if (key === tab) return
    setTab(key)
    setSearch('')
    setSheetOpen(false)
    cancelEdit()
  }

  function openCreate() {
    cancelEdit()
    setSheetOpen(true)
  }

  async function submitHandling() {
    if (!hForm.code.trim() || !hForm.name.trim()) {
      appToast.error('Code and name are required.')
      return
    }
    const payload: CreateHandlingCodePayload = {
      code:        hForm.code.trim().toUpperCase(),
      name:        hForm.name.trim(),
      description: hForm.description.trim() || undefined,
      type:        hForm.type,
    }
    try {
      setSaving(true)
      const created = await systemMaintenanceService.createHandlingCode(payload)
      refreshTable()
      setHForm(initHandling)
      setSheetOpen(false)
      appToast.success(`Handling code ${created.code} added.`)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to add handling code')
    } finally {
      setSaving(false)
    }
  }

  async function submitCommodity() {
    if (!cForm.name.trim()) {
      appToast.error('Commodity name is required.')
      return
    }
    const payload: CreateCommodityPayload = {
      name:        cForm.name.trim(),
      description: cForm.description.trim() || undefined,
      category:    cForm.category.trim() || undefined,
    }
    try {
      setSaving(true)
      const created = await systemMaintenanceService.createCommodity(payload)
      setCommodities(prev => [created, ...prev])
      refreshTable()
      setCForm(initCommodity)
      setSheetOpen(false)
      appToast.success(`Commodity "${created.name}" added.`)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to add commodity')
    } finally {
      setSaving(false)
    }
  }

  async function submitProduct() {
    if (!pForm.commodity_id) {
      appToast.error('Please select a commodity.')
      return
    }
    if (!pForm.name.trim()) {
      appToast.error('Product name is required.')
      return
    }
    const payload: CreateProductPayload = {
      commodity_id: pForm.commodity_id,
      name:         pForm.name.trim(),
      description:  pForm.description.trim() || undefined,
      unit:         pForm.unit.trim() || undefined,
    }
    try {
      setSaving(true)
      const created = await systemMaintenanceService.createProduct(payload)
      // Re-read the page: the list endpoint embeds the commodity; the create response does not.
      refreshTable()
      setPForm(initProduct)
      setSheetOpen(false)
      appToast.success(`Product "${created.name}" added.`)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to add product')
    } finally {
      setSaving(false)
    }
  }

  async function submitLandline() {
    if (!lForm.prefix.trim()) {
      appToast.error('Prefix is required.')
      return
    }
    if (!/^\d+$/.test(lForm.prefix.trim())) {
      appToast.error('Prefix must be numeric digits only.')
      return
    }
    if (!lForm.city.trim()) {
      appToast.error('City is required.')
      return
    }

    try {
      setSaving(true)

      if (editingPrefix) {
        const payload: UpdateLandlinePrefixPayload = {
          prefix: lForm.prefix.trim(),
          city:   lForm.city.trim(),
          region: lForm.region.trim() || null,
        }
        const updated = await systemMaintenanceService.updateLandlinePrefix(editingPrefix.prefix_id, payload)
        refreshTable()
        appToast.success(`Prefix (${updated.prefix}) updated.`)
        closeSheet()
      } else {
        const payload: CreateLandlinePrefixPayload = {
          prefix: lForm.prefix.trim(),
          city:   lForm.city.trim(),
          region: lForm.region.trim() || null,
        }
        const created = await systemMaintenanceService.createLandlinePrefix(payload)
        refreshTable()
        setLForm(initLandline)
        setSheetOpen(false)
        appToast.success(`Prefix (${created.prefix}) added.`)
      }
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e)
      appToast.error(msg?.includes('unique') || msg?.includes('409')
        ? 'That prefix already exists.'
        : msg || 'Failed to save prefix')
    } finally {
      setSaving(false)
    }
  }

  // Shown under the fields as the admin types, after the first save attempt.
  const vErrors = useMemo(() => {
    const errs: { name?: string; description?: string } = {}
    const name = cleanName(vForm.name)
    if (!name) errs.name = 'Name is required.'
    else if (name.length > VEHICLE_TYPE_NAME_MAX) errs.name = `At most ${VEHICLE_TYPE_NAME_MAX} characters.`
    else if (vehicleTypes.some(t =>
      t.vehicle_type_id !== editingType?.vehicle_type_id && t.name.toLowerCase() === name.toLowerCase(),
    )) errs.name = `"${name}" already exists.`
    if (vForm.description.trim().length > VEHICLE_TYPE_DESC_MAX) errs.description = `At most ${VEHICLE_TYPE_DESC_MAX} characters.`
    return errs
  }, [vForm, vehicleTypes, editingType])

  const vChanged = !editingType || (
    cleanName(vForm.name) !== editingType.name ||
    vForm.description.trim() !== (editingType.description ?? '') ||
    vForm.is_active !== editingType.is_active
  )

  async function submitVehicleType() {
    setVTouched(true)
    if (vErrors.name || vErrors.description) return
    const payload = {
      name:        cleanName(vForm.name),
      description: vForm.description.trim() || null,
      is_active:   vForm.is_active,
    }
    try {
      setSaving(true)
      if (editingType) {
        const renamed = payload.name !== editingType.name && editingType.model_count > 0
        const updated = await systemMaintenanceService.updateVehicleType(editingType.vehicle_type_id, payload)
        setVehicleTypes(prev => prev.map(t => t.vehicle_type_id === updated.vehicle_type_id ? updated : t))
        refreshTable()
        appToast.success(renamed
          ? `${updated.name} saved. ${updated.model_count} truck model${updated.model_count === 1 ? '' : 's'} renamed with it.`
          : `${updated.name} saved.`)
        closeSheet()
      } else {
        const created = await systemMaintenanceService.createVehicleType(payload)
        setVehicleTypes(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        refreshTable()
        setVForm(initVehicleType)
        setVTouched(false)
        setSheetOpen(false)
        appToast.success(`Vehicle type ${created.name} added.`)
      }
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to save vehicle type')
    } finally {
      setSaving(false)
    }
  }

  async function runConfirm() {
    if (!confirm) return
    const target = confirm

    if (target.kind === 'prefix') {
      const pfx = target.item
      try {
        setDeleting(pfx.prefix_id)
        await systemMaintenanceService.deleteLandlinePrefix(pfx.prefix_id)
        refreshTable()
        if (editingPrefix?.prefix_id === pfx.prefix_id) closeSheet()
        appToast.success(`Prefix (${pfx.prefix}) deleted.`)
        setConfirm(null)
      } catch (e: unknown) {
        appToast.error(getApiErrorMessage(e) || 'Failed to delete prefix')
        setConfirm(null)
      } finally {
        setDeleting(null)
      }
      return
    }

    const vt = target.item
    // A type still on models can't go; the confirm offers to hide it instead.
    if (vt.model_count > 0 && !vt.is_active) { setConfirm(null); return }
    try {
      setDeleting(vt.vehicle_type_id)
      if (vt.model_count > 0) {
        const updated = await systemMaintenanceService.updateVehicleType(vt.vehicle_type_id, { is_active: false })
        setVehicleTypes(prev => prev.map(t => t.vehicle_type_id === updated.vehicle_type_id ? updated : t))
        refreshTable()
        appToast.success(`${vt.name} is now inactive.`)
      } else {
        await systemMaintenanceService.deleteVehicleType(vt.vehicle_type_id)
        setVehicleTypes(prev => prev.filter(t => t.vehicle_type_id !== vt.vehicle_type_id))
        refreshTable()
        appToast.success(`${vt.name} deleted.`)
      }
      if (editingType?.vehicle_type_id === vt.vehicle_type_id) closeSheet()
      setConfirm(null)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to delete vehicle type')
      setConfirm(null)
      void load(true)
    } finally {
      setDeleting(null)
    }
  }

  function startEditLandline(pfx: LandlinePrefix) {
    cancelEdit()
    setEditingPrefix(pfx)
    setLForm({ prefix: pfx.prefix, city: pfx.city, region: pfx.region ?? '' })
    setSheetOpen(true)
  }

  function startEditType(vt: VehicleType) {
    cancelEdit()
    setEditingType(vt)
    setVForm({ name: vt.name, description: vt.description ?? '', is_active: vt.is_active })
    setSheetOpen(true)
  }

  const isEditing = (tab === 'landline' && !!editingPrefix) || (tab === 'vehicle_types' && !!editingType)
  const activeTab = TABS.find(t => t.key === tab)!
  // Tabs that can edit existing rows, as opposed to add-only ones.
  const editableTab = tab === 'landline' || tab === 'vehicle_types'

  function renderForm() {
    if (!isEditing && !canCreate) return (
      <p className="text-sm text-white/40 leading-relaxed">
        {editableTab
          ? 'Your access can change existing entries but not add new ones. Pick an entry in the list to edit it.'
          : 'Your access can view these entries but not add new ones.'}
      </p>
    )

    if (tab === 'handling') return (
      <div className="space-y-4">
        <Field label="Code *">
          <input
            value={hForm.code}
            onChange={e => setHForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
            className={inputCls}
            placeholder="e.g. GEN"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </Field>
        <Field label="Name *">
          <input
            value={hForm.name}
            onChange={e => setHForm(p => ({ ...p, name: e.target.value }))}
            className={inputCls}
            placeholder="e.g. General Cargo"
          />
        </Field>
        <Field label="Type">
          <div className="grid grid-cols-2 gap-2">
            {(['standard', 'additional'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setHForm(p => ({ ...p, type: option }))}
                aria-pressed={hForm.type === option}
                className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-semibold transition-colors
                  ${hForm.type === option
                    ? 'border-[#4DF9ED] bg-[#4DF9ED]/15 text-white'
                    : 'border-white/10 bg-[#0a0a0a] text-white/70 hover:border-white/30'}`}
              >
                {option === 'standard' ? 'Standard' : 'Additional'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={hForm.description}
            onChange={e => setHForm(p => ({ ...p, description: e.target.value }))}
            className={`${inputCls} min-h-[90px] resize-none`}
            placeholder="Optional details"
          />
        </Field>
        <SubmitBtn label="Add handling code" busy={saving} onClick={() => void submitHandling()} />
      </div>
    )

    if (tab === 'commodities') return (
      <div className="space-y-4">
        <Field label="Name *">
          <input
            value={cForm.name}
            onChange={e => setCForm(p => ({ ...p, name: e.target.value }))}
            className={inputCls}
            placeholder="e.g. Electronics"
          />
        </Field>
        <Field label="Category (optional)">
          <input
            value={cForm.category}
            onChange={e => setCForm(p => ({ ...p, category: e.target.value }))}
            className={inputCls}
            placeholder="e.g. Consumer Goods"
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={cForm.description}
            onChange={e => setCForm(p => ({ ...p, description: e.target.value }))}
            className={`${inputCls} min-h-[90px] resize-none`}
            placeholder="Optional details"
          />
        </Field>
        <SubmitBtn label="Add commodity" busy={saving} onClick={() => void submitCommodity()} />
      </div>
    )

    if (tab === 'products') return (
      <div className="space-y-4">
        <Field label="Commodity *">
          <select
            value={pForm.commodity_id}
            onChange={e => setPForm(p => ({ ...p, commodity_id: e.target.value }))}
            className={inputCls}
            style={{ colorScheme: 'dark' }}
          >
            <option value="">Select commodity…</option>
            {commodities.map(c => (
              <option key={c.commodity_id} value={c.commodity_id}>
                {c.name}{c.category ? ` — ${c.category}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Product name *">
          <input
            value={pForm.name}
            onChange={e => setPForm(p => ({ ...p, name: e.target.value }))}
            className={inputCls}
            placeholder="e.g. LCD Monitor"
          />
        </Field>
        <Field label="Unit (optional)">
          <input
            value={pForm.unit}
            onChange={e => setPForm(p => ({ ...p, unit: e.target.value }))}
            className={inputCls}
            placeholder="e.g. pcs, kg, bundle"
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={pForm.description}
            onChange={e => setPForm(p => ({ ...p, description: e.target.value }))}
            className={`${inputCls} min-h-[90px] resize-none`}
            placeholder="Optional details"
          />
        </Field>
        <SubmitBtn label="Add product" busy={saving} onClick={() => void submitProduct()} />
      </div>
    )

    if (tab === 'vehicle_types') return (
      <div className="space-y-4">
        {editingType && <RecordLockBanner lock={typeLock} noun="vehicle type" />}
        {editingType && (
          <EditingChip label={`Editing ${editingType.name}`} onCancel={closeSheet} />
        )}
        <fieldset disabled={typeLock.readOnly || saving} className="space-y-4 min-w-0 border-0 p-0 m-0">
          <Field
            label="Name *"
            error={vTouched ? vErrors.name : undefined}
            hint={editingType && editingType.model_count > 0 && cleanName(vForm.name) !== editingType.name
              ? `Renaming also renames it on ${editingType.model_count} truck model${editingType.model_count === 1 ? '' : 's'}. Past bookings keep the old name.`
              : undefined}
          >
            <input
              value={vForm.name}
              onChange={e => setVForm(p => ({ ...p, name: e.target.value }))}
              onBlur={() => { if (vForm.name) setVTouched(true) }}
              className={inputCls}
              placeholder="e.g. Wing Van"
              maxLength={VEHICLE_TYPE_NAME_MAX + 10}
              aria-invalid={vTouched && !!vErrors.name}
            />
          </Field>
          <Field label="Description (optional)" error={vTouched ? vErrors.description : undefined}>
            <textarea
              value={vForm.description}
              onChange={e => setVForm(p => ({ ...p, description: e.target.value }))}
              className={`${inputCls} min-h-[90px] resize-none`}
              placeholder="e.g. Side-opening van for palletised FMCG loads"
              maxLength={VEHICLE_TYPE_DESC_MAX}
            />
            <p className="mt-1 text-right text-[10px] text-white/25 tabular-nums">
              {vForm.description.length}/{VEHICLE_TYPE_DESC_MAX}
            </p>
          </Field>
          <button
            type="button"
            role="switch"
            aria-checked={vForm.is_active}
            onClick={() => setVForm(p => ({ ...p, is_active: !p.is_active }))}
            className="flex w-full min-h-[44px] items-center gap-3 rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2 text-left"
          >
            <span
              className="relative h-5 w-9 shrink-0 rounded-full border transition-colors"
              style={{
                background:  vForm.is_active ? '#4DF9ED' : 'rgba(255,255,255,0.08)',
                borderColor: vForm.is_active ? '#4DF9ED' : 'rgba(255,255,255,0.12)',
              }}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: vForm.is_active ? 'translateX(17px)' : 'translateX(2px)' }}
              />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">{vForm.is_active ? 'Active' : 'Inactive'}</span>
              <span className="block text-[11px] text-white/40">
                {vForm.is_active
                  ? 'Shown when picking a type for a model, a vehicle or a vendor vehicle.'
                  : 'Hidden from the pickers. Models that already use it keep it.'}
              </span>
            </span>
          </button>
          <SubmitBtn
            label={editingType ? 'Save changes' : 'Add vehicle type'}
            icon={!editingType}
            busy={saving}
            disabled={!vChanged}
            onClick={() => void submitVehicleType()}
          />
        </fieldset>
      </div>
    )

    // landline tab
    return (
      <div className="space-y-4">
        {editingPrefix && <RecordLockBanner lock={prefixLock} noun="prefix" />}
        {editingPrefix && (
          <EditingChip label={`Editing (${editingPrefix.prefix}) ${editingPrefix.city}`} onCancel={closeSheet} />
        )}

        <fieldset disabled={prefixLock.readOnly || saving} className="space-y-4 min-w-0 border-0 p-0 m-0">
          <Field label="Prefix *">
            <input
              value={lForm.prefix}
              onChange={e => setLForm(p => ({ ...p, prefix: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              className={inputCls}
              placeholder="e.g. 2, 32, 62"
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </Field>

          <Field label="City *">
            <input
              value={lForm.city}
              onChange={e => setLForm(p => ({ ...p, city: e.target.value }))}
              className={inputCls}
              placeholder="e.g. Metro Manila"
            />
          </Field>

          <Field label="Region (optional)">
            <input
              value={lForm.region}
              onChange={e => setLForm(p => ({ ...p, region: e.target.value }))}
              className={inputCls}
              placeholder="e.g. NCR"
            />
          </Field>

          <SubmitBtn
            label={editingPrefix ? 'Save changes' : 'Add prefix'}
            icon={!editingPrefix}
            busy={saving}
            onClick={() => void submitLandline()}
          />
        </fieldset>
      </div>
    )
  }

  // ── list: searched and paged on the server ─────────────────────────────────
  const q = search.trim()

  const rows     = table.rows
  const tabTotal = table.meta?.unfiltered ?? 0
  const tabCount = table.total

  function renderList() {
    if (loading || !tableReady) return (
      <div className="flex items-center justify-center py-12">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-[#4DF9ED]" />
      </div>
    )

    if (!rows.length) return (
      <EmptyState
        filtered={tabTotal > 0}
        canAdd={canCreate}
        noun={activeTab.singular.toLowerCase()}
        onAdd={openCreate}
        onClear={() => setSearch('')}
      />
    )

    if (tab === 'handling') return (
      <div className="space-y-2">
        {(rows as HandlingCode[]).map(hc => (
          <div key={hc.handling_code_id} className={rowCls}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-mono text-sm font-bold text-[#4DF9ED] break-all">{hc.code}</span>
              <span className="min-w-0 text-sm text-white/70 break-words">{hc.name}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-white/70">
                {hc.type === 'additional' ? 'Additional' : 'Standard'}
              </span>
            </div>
            {hc.description && <p className="mt-1.5 text-xs text-white/35 break-words">{hc.description}</p>}
          </div>
        ))}
      </div>
    )

    if (tab === 'commodities') return (
      <div className="space-y-2">
        {(rows as Commodity[]).map(c => (
          <div key={c.commodity_id} className={rowCls}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white break-words">{c.name}</p>
                {c.category && <p className="text-xs text-white/40 mt-0.5 break-words">{c.category}</p>}
              </div>
              <ActiveBadge active={c.is_active} />
            </div>
            {c.description && <p className="mt-1.5 text-xs text-white/35 break-words">{c.description}</p>}
          </div>
        ))}
      </div>
    )

    if (tab === 'products') return (
      <div className="space-y-2">
        {(rows as Product[]).map(prod => (
          <div key={prod.product_id} className={rowCls}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white break-words">{prod.name}</p>
                <p className="text-xs text-white/40 mt-0.5 break-words">
                  {prod.commodities?.name ?? '—'}
                  {prod.commodities?.category ? ` · ${prod.commodities.category}` : ''}
                  {prod.unit ? ` · ${prod.unit}` : ''}
                </p>
              </div>
              <ActiveBadge active={prod.is_active} />
            </div>
            {prod.description && <p className="mt-1.5 text-xs text-white/35 break-words">{prod.description}</p>}
          </div>
        ))}
      </div>
    )

    if (tab === 'vehicle_types') return (
      <div className="space-y-2">
        {(rows as VehicleType[]).map(vt => {
          const lockedBy = typeLocks.get(vt.vehicle_type_id)
          const busy     = deleting === vt.vehicle_type_id || !!lockedBy
          const selected = editingType?.vehicle_type_id === vt.vehicle_type_id
          return (
            <div key={vt.vehicle_type_id} className={`${rowCls} ${selected ? '!border-[#4DF9ED]/30' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-semibold text-white break-words">{vt.name}</p>
                    <ActiveBadge active={vt.is_active} />
                  </div>
                  <p className="text-xs text-white/40 mt-1">
                    {vt.model_count === 0
                      ? 'Not used by any truck model'
                      : `Used by ${vt.model_count} truck model${vt.model_count === 1 ? '' : 's'}`}
                  </p>
                  {vt.description && <p className="mt-1.5 text-xs text-white/35 break-words">{vt.description}</p>}
                </div>
                <RowButtons
                  lockedBy={lockedBy}
                  busy={busy}
                  deleting={deleting === vt.vehicle_type_id}
                  name={vt.name}
                  onEdit={canEdit ? () => startEditType(vt) : undefined}
                  onDelete={canDelete ? () => setConfirm({ kind: 'vehicle_type', item: vt }) : undefined}
                />
              </div>
            </div>
          )
        })}
      </div>
    )

    // landline tab
    return (
      <div className="space-y-2">
        {(rows as LandlinePrefix[]).map(pfx => {
          const lockedBy = prefixLocks.get(pfx.prefix_id)
          const busy     = deleting === pfx.prefix_id || !!lockedBy
          const selected = editingPrefix?.prefix_id === pfx.prefix_id
          return (
            <div key={pfx.prefix_id} className={`${rowCls} ${selected ? '!border-[#4DF9ED]/30' : ''}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <span className="shrink-0 rounded border border-white/10 px-2 py-0.5 font-mono text-sm font-bold text-[#4DF9ED]">
                    {pfx.prefix}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white break-words">{pfx.city}</p>
                    {pfx.region && <p className="text-xs text-white/40 mt-0.5 break-words">{pfx.region}</p>}
                  </div>
                </div>
                <RowButtons
                  lockedBy={lockedBy}
                  busy={busy}
                  deleting={deleting === pfx.prefix_id}
                  name={`prefix ${pfx.prefix}`}
                  onEdit={canEdit ? () => startEditLandline(pfx) : undefined}
                  onDelete={canDelete ? () => setConfirm({ kind: 'prefix', item: pfx }) : undefined}
                />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const showFormPanel = canCreate || canEdit
  const formTitle = isEditing ? `Edit ${activeTab.singular}` : `Add ${activeTab.singular}`

  // ── delete confirmation ────────────────────────────────────────────────────
  let confirmTitle = '', confirmDescription = '', confirmLabel = 'Delete'
  if (confirm?.kind === 'prefix') {
    confirmTitle       = `Delete prefix (${confirm.item.prefix})?`
    confirmDescription = `${confirm.item.city} will no longer be offered for landline numbers. Numbers already saved keep their prefix.`
  } else if (confirm?.kind === 'vehicle_type') {
    const vt = confirm.item
    if (vt.model_count === 0) {
      confirmTitle       = `Delete ${vt.name}?`
      confirmDescription = 'No truck model uses this type. Past bookings keep the name they were given.'
    } else if (vt.is_active) {
      confirmTitle       = `${vt.name} can't be deleted`
      confirmDescription = `${vt.model_count} truck model${vt.model_count === 1 ? ' still uses' : 's still use'} it. `
        + 'Make it inactive instead: it disappears from the pickers and those models keep it.'
      confirmLabel       = 'Make inactive'
    } else {
      confirmTitle       = `${vt.name} can't be deleted`
      confirmDescription = `${vt.model_count} truck model${vt.model_count === 1 ? ' still uses' : 's still use'} it. `
        + 'It is already inactive. Change those models to another type first, then delete it.'
      confirmLabel       = 'OK'
    }
  }
  if (deleting) confirmLabel = 'Working…'

  return (
    <div className="flex flex-col min-h-0 h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[var(--color-bg,#0d0d0d)]">

      {/* header */}
      <header className="shrink-0 border-b border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3">
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <RefreshButton onClick={() => void load()} />
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="lg:hidden inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-bold uppercase tracking-wide text-black"
              style={{ background: '#4DF9ED' }}
            >
              <Plus size={15} />
              <span>Add<span className="hidden sm:inline"> {activeTab.singular.toLowerCase()}</span></span>
            </button>
          )}
        </div>
      </header>

      {/* tab bar: scrolls sideways on a phone */}
      <div role="tablist" aria-label="System Maintenance sections" className="shrink-0 flex gap-1 border-b border-white/[0.07] px-2 sm:px-4 pt-2 overflow-x-auto scrollbar-none overscroll-x-contain">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              ref={el => { tabRefs.current[key] = el }}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchTab(key)}
              className="inline-flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-1.5 min-h-[40px] text-xs font-bold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap"
              style={{
                borderColor: active ? '#4DF9ED' : 'transparent',
                color:       active ? '#4DF9ED' : 'rgba(255,255,255,0.35)',
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          )
        })}
      </div>

      {/* body */}
      <div className="flex flex-[1_0_auto] lg:flex-1 lg:min-h-0 lg:overflow-hidden">

        {/* form panel (lg and up) — only for users who can create/edit this module */}
        {showFormPanel && (
          <div className="hidden lg:flex w-[340px] xl:w-[380px] shrink-0 border-r border-white/[0.07] flex-col">
            <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.07]">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">
                {isEditing ? 'Edit entry' : 'New entry'}
              </p>
              <h2 className="mt-0.5 text-base font-bold text-white">{formTitle}</h2>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {!compact && renderForm()}
            </div>
          </div>
        )}

        {/* list panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 px-4 pt-3 pb-3 border-b border-white/[0.07] space-y-2.5">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">Existing entries</p>
                <h2 className="mt-0.5 text-base font-bold text-white truncate">{activeTab.label}</h2>
              </div>
              {!loading && (
                <p className="shrink-0 text-xs text-white/30 tabular-nums">
                  {q || (tab === 'products' && pForm.commodity_id) ? `${tabCount} of ${tabTotal}` : tabTotal}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 min-w-0 sm:max-w-md" style={{ background: '#2a2828' }}>
                <Search size={16} className="text-white/40 shrink-0" />
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`Search ${activeTab.label.toLowerCase()}…`}
                  aria-label={`Search ${activeTab.label}`}
                  className="min-w-0 flex-1 bg-transparent border-none outline-none text-base sm:text-sm text-white/80 placeholder:text-white/35"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="-m-1.5 p-1.5 text-white/40">
                    <X size={14} />
                  </button>
                )}
              </div>
              {tab === 'products' && pForm.commodity_id && (
                <button
                  type="button"
                  onClick={() => setPForm(p => ({ ...p, commodity_id: '' }))}
                  className="inline-flex max-w-full items-center gap-1.5 self-start sm:self-auto text-[11px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: '#4DF9ED55', color: '#4DF9ED', background: 'rgba(77,249,237,0.08)' }}
                  aria-label="Clear commodity filter"
                >
                  <span className="truncate">{commodities.find(c => c.commodity_id === pForm.commodity_id)?.name ?? 'Filtered'}</span>
                  <X size={12} className="shrink-0" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-[1_0_auto] lg:flex-1 lg:min-h-0 overflow-x-auto lg:overflow-y-auto lg:overscroll-contain p-3 sm:p-4">
            {renderList()}
          </div>
          {!loading && tableReady && rows.length > 0 && (
            <Pagination page={page} totalPages={totalPages} total={tabCount} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={table.fetching} />
          )}
        </div>
      </div>

      {/* form sheet (below lg) */}
      <AnimatePresence>
        {compact && sheetOpen && showFormPanel && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/65 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!saving) closeSheet() }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={formTitle}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="flex w-full sm:max-w-lg max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[var(--color-surface,#111)] shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.07]">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">
                    {isEditing ? 'Edit entry' : 'New entry'}
                  </p>
                  <h2 className="mt-0.5 text-base font-bold text-white truncate">{formTitle}</h2>
                </div>
                <button
                  type="button"
                  onClick={closeSheet}
                  disabled={saving}
                  className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/50 disabled:opacity-40"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                {renderForm()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReusableModal
        open={!!confirm}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        cancelLabel="Cancel"
        disableBackdropClose={!!deleting}
        onCancel={() => { if (!deleting) setConfirm(null) }}
        onConfirm={() => { if (!deleting) void runConfirm() }}
      />
    </div>
  )
}

const rowCls = 'rounded-lg border border-white/[0.07] bg-black/30 p-3 transition-colors'

function RowButtons({ lockedBy, busy, deleting, name, onEdit, onDelete }: {
  lockedBy: string | undefined
  busy:     boolean
  deleting: boolean
  name:     string
  onEdit?:   () => void
  onDelete?: () => void
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <RecordLockBadge holder={lockedBy} />
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="flex h-9 w-9 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/5 hover:text-white/80 disabled:opacity-30"
          aria-label={`Edit ${name}`}
          title={lockedBy ? `${lockedBy} is editing this` : undefined}
        >
          <Pencil size={15} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="flex h-9 w-9 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
          aria-label={`Delete ${name}`}
          title={lockedBy ? `${lockedBy} is editing this` : undefined}
        >
          {deleting
            ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-white/20 border-t-white/60" />
            : <Trash2 size={15} />}
        </button>
      )}
    </div>
  )
}

function EditingChip({ label, onCancel }: { label: string; onCancel: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[#4DF9ED]/20 bg-[#4DF9ED]/5 pl-3 pr-1 py-1">
      <p className="min-w-0 truncate text-xs font-bold text-[#4DF9ED]">{label}</p>
      <button
        type="button"
        onClick={onCancel}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
        aria-label="Cancel edit"
      >
        <X size={14} />
      </button>
    </div>
  )
}

function SubmitBtn({ label, busy, onClick, disabled = false, icon = true }: {
  label: string; busy: boolean; onClick: () => void; disabled?: boolean; icon?: boolean
}) {
  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-colors disabled:opacity-40"
      style={{
        background: 'rgba(77,249,237,0.12)',
        border:     '1px solid rgba(77,249,237,0.30)',
        color:      '#4DF9ED',
      }}
    >
      {icon && <Plus size={15} />}
      {busy ? 'Saving…' : label}
    </button>
  )
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
        active
          ? 'border-[#4DF9ED]/30 text-[#4DF9ED]'
          : 'border-white/10 text-white/30'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function EmptyState({ filtered, canAdd, noun, onAdd, onClear }: { filtered: boolean; canAdd: boolean; noun: string; onAdd: () => void; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-white/30">{filtered ? 'Nothing matches your search.' : 'No entries yet.'}</p>
      <ClearFiltersLink show={filtered} onClear={onClear} className="mt-0" />
      {!filtered && canAdd && (
        <button type="button" onClick={onAdd} className="lg:hidden text-sm font-bold text-[#4DF9ED]">
          Add the first {noun}
        </button>
      )}
    </div>
  )
}
