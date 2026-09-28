'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, Truck as TruckIcon, Pencil, Archive, Eye, Plus, RefreshCw, Search } from 'lucide-react'
import type { CreateTruckModelInput, UpdateTruckModelInput } from '@/app/types/truck.types'
import { TruckModel } from '@/app/types/truck-model'
import {
  adminFetchTruckModels,
  adminCreateTruckModel,
  adminUpdateTruckModel,
  adminArchiveTruckModel,
  adminUploadTruckModelImage,
} from '@/lib/services/admin/trucks.service'
import ReusableModal from '@/components/layout/ReusableModal'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { createTruckModelSchema } from '@/lib/validation/truck-model.validation'
import { useRecordLock, useRecordLocks } from '@/lib/hooks/useRecordLock'
import RecordLockBanner, { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import RowActionMenu, { type RowAction } from '@/components/ui/RowActionMenu'
import { ModelThumb, kgToTons } from './vehicle-ui'

export const VEHICLE_TYPES = [
  'Closed Van',
  'Wing Van',
  'Dropside',
  'Refrigerated Van',
  'Boom Truck',
  'Flatbed',
  'Others',
] as const

export type VehicleType = (typeof VEHICLE_TYPES)[number]

const KNOWN_TYPES = VEHICLE_TYPES.slice(0, -1)

interface ModelFormState {
  name:               string
  vehicle_type:       string
  length_mm:          string
  width_mm:           string
  height_mm:          string
  suitable_for:       string
  stackable_friendly: boolean
  max_volume_cbm:     string
  max_weight_kg:      string
  max_length_cm:      string
  image_url:          string
}

function emptyModelForm(): ModelFormState {
  return {
    name:               '',
    vehicle_type:       '',
    length_mm:          '',
    width_mm:           '',
    height_mm:          '',
    suitable_for:       '',
    stackable_friendly: false,
    max_volume_cbm:     '',
    max_weight_kg:      '',
    max_length_cm:      '',
    image_url:          '',
  }
}

function modelToForm(m: TruckModel): ModelFormState {
  const dimParts = m.dimension_mm?.split(/\s*[x×]\s*/i) ?? []
  return {
    name:               m.name               ?? '',
    vehicle_type:       m.vehicle_type        ?? '',
    length_mm:          dimParts[0]           ?? '',
    width_mm:           dimParts[1]           ?? '',
    height_mm:          dimParts[2]           ?? '',
    suitable_for:       m.suitable_for        ?? '',
    stackable_friendly: m.stackable_friendly  ?? false,
    max_volume_cbm:     m.max_volume_cbm != null ? String(m.max_volume_cbm) : '',
    max_weight_kg:      m.max_weight_kg  != null ? String(m.max_weight_kg)  : '',
    max_length_cm:      m.max_length_cm  != null ? String(m.max_length_cm)  : '',
    image_url:          m.image_url           ?? '',
  }
}

/** Vehicle-management tier, passed down from the page. */
interface Props {
  canCreate: boolean
  canEdit:   boolean
  canDelete: boolean
}

type FormMode    = 'create' | 'edit' | null
type ConfirmKind = 'save' | 'archive' | null

type FieldErrors = Partial<Record<keyof ModelFormState | 'image', string>>

/**
 * Vehicle Management → Models: the truck model catalog as a table. Vehicles
 * pick their model (type, capacity, image) from here. Models are archived,
 * never deleted, so past bookings keep their details.
 */
export default function TruckModelsTab({ canCreate, canEdit, canDelete }: Props) {
  const [models,      setModels]      = useState<TruckModel[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError,   setListError]   = useState<string | null>(null)
  const [search,      setSearch]      = useState('')

  const [formMode,     setFormMode]    = useState<FormMode>(null)
  const [editingId,    setEditingId]   = useState<string | null>(null)
  const [form,         setForm]        = useState<ModelFormState>(emptyModelForm())
  const [fieldErrors,  setFieldErrors] = useState<FieldErrors>({})
  const [touched,      setTouched]     = useState(false)
  const [isOtherType,  setIsOtherType] = useState(false)

  const [imageFile,    setImageFile]    = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadBusy,   setUploadBusy]   = useState(false)

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null)
  const [archiveTarget, setArchiveTarget] = useState<TruckModel | null>(null)
  const [viewModel,     setViewModel]     = useState<TruckModel | null>(null)
  const [actionBusy,  setActionBusy]  = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const editingModel = models.find((m) => m.model_id === editingId) ?? null
  const initialForm  = useRef<ModelFormState | null>(null)

  const hasChanges = formMode === 'create' || !!imageFile || (
    initialForm.current !== null &&
    (Object.keys(form) as (keyof ModelFormState)[]).some(
      (k) => form[k] !== initialForm.current![k]
    )
  )

  const loadModels = useCallback(async () => {
    try {
      setListLoading(true)
      setListError(null)
      setModels(await adminFetchTruckModels())
    } catch (e) {
      setListError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  const visibleModels = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) =>
      [m.name, m.vehicle_type, m.suitable_for].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [models, search])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyModelForm())
    setImageFile(null)
    setImagePreview(null)
    setFieldErrors({})
    setTouched(false)
    setIsOtherType(false)
    setFormMode('create')
    initialForm.current = null
  }

  const openEdit = (m: TruckModel) => {
    const formState = modelToForm(m)
    setEditingId(m.model_id)
    setForm(formState)
    setImageFile(null)
    setImagePreview(m.image_url ?? null)
    setFieldErrors({})
    setTouched(false)
    setIsOtherType(!!m.vehicle_type && !(KNOWN_TYPES as readonly string[]).includes(m.vehicle_type))
    setFormMode('edit')
    initialForm.current = formState
  }

  // One person edits a model at a time. A form that waited on someone else's
  // edit is stale, so it is closed rather than saved over theirs.
  const modelLock = useRecordLock({
    type:    'truck_model',
    id:      formMode === 'edit' ? editingId : null,
    onStale: () => {
      appToast.info('This model was just changed by someone else. Reopen it to edit the latest.', {
        action: 'truck-model-stale', entityId: editingId ?? undefined,
      })
      closeForm()
      void loadModels()
    },
  })
  const modelLocks = useRecordLocks('truck_model', canEdit || canDelete)

  const closeForm = () => {
    setFormMode(null)
    setEditingId(null)
    setImageFile(null)
    setImagePreview(null)
    setFieldErrors({})
    setTouched(false)
    setIsOtherType(false)
    initialForm.current = null
  }

  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
  const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFieldErrors((prev) => ({ ...prev, image: 'Only PNG, JPG, and WEBP images are allowed.' }))
      return
    }

    if (file.size > MAX_SIZE_BYTES) {
      setFieldErrors((prev) => ({ ...prev, image: 'Image must be 5 MB or smaller.' }))
      return
    }

    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setForm((f) => ({ ...f, image_url: '' }))
    setFieldErrors((prev) => ({ ...prev, image: undefined }))
  }

  const handleVehicleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === 'Others') {
      setIsOtherType(true)
      setForm((f) => ({ ...f, vehicle_type: '' }))
    } else {
      setIsOtherType(false)
      setForm((f) => ({ ...f, vehicle_type: val }))
    }
    setFieldErrors((prev) => ({ ...prev, vehicle_type: undefined }))
  }

  function validate(): boolean {
    const hasImage = !!(imagePreview || form.image_url)

    const result = createTruckModelSchema.safeParse({
      name:               form.name.trim(),
      vehicle_type:       form.vehicle_type,
      length_mm:          form.length_mm,
      width_mm:           form.width_mm,
      height_mm:          form.height_mm,
      suitable_for:       form.suitable_for.trim(),
      stackable_friendly: form.stackable_friendly,
      max_volume_cbm:     form.max_volume_cbm,
      max_weight_kg:      form.max_weight_kg,
      max_length_cm:      form.max_length_cm,
      image_url:          hasImage ? 'https://placeholder.com' : '',
    })

    const errs: FieldErrors = {}

    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FieldErrors
        if (!errs[key]) errs[key] = issue.message
      }
    }

    if (!hasImage) {
      errs.image = 'An image is required.'
    }

    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSaveClick = () => {
    setTouched(true)
    if (!validate()) return
    setConfirmKind('save')
  }

  const handleArchiveClick = (m: TruckModel) => {
    setArchiveTarget(m)
    setConfirmKind('archive')
  }

  // The row's 3-dot menu. Viewing stays open while someone else is editing
  // the model; the writes wait for them.
  function rowActions(m: TruckModel): RowAction[] {
    const lockedBy = modelLocks.get(m.model_id)
    const lockedTitle = lockedBy ? `${lockedBy} is editing this model` : undefined
    const actions: RowAction[] = [
      { label: 'View Details', icon: <Eye size={13} />, onSelect: () => setViewModel(m) },
    ]
    if (canEdit) {
      actions.push({
        label: 'Update Details', icon: <Pencil size={13} />, onSelect: () => openEdit(m),
        disabled: !!lockedBy, title: lockedTitle,
      })
    }
    if (canDelete) {
      actions.push({
        label: 'Archive', icon: <Archive size={13} />, tone: 'warning', separated: true,
        onSelect: () => handleArchiveClick(m),
        disabled: !!lockedBy, title: lockedTitle,
      })
    }
    return actions
  }

  const executeSave = async () => {
    setActionBusy(true)
    try {
      let finalUrl = form.image_url

      if (imageFile) {
        setUploadBusy(true)
        finalUrl = await adminUploadTruckModelImage(imageFile)
        setUploadBusy(false)
      }

      const dimension_mm = `${form.length_mm} x ${form.width_mm} x ${form.height_mm}`

      const payload = {
        name:               form.name.trim(),
        vehicle_type:       form.vehicle_type,
        dimension_mm,
        suitable_for:       form.suitable_for.trim(),
        stackable_friendly: form.stackable_friendly,
        max_volume_cbm:     parseFloat(form.max_volume_cbm),
        max_weight_kg:      parseFloat(form.max_weight_kg),
        max_length_cm:      parseFloat(form.max_length_cm),
        image_url:          finalUrl,
      }

      if (formMode === 'create') {
        await adminCreateTruckModel(payload as CreateTruckModelInput)
        appToast.success('Truck model created.', { action: 'truck-model-save' })
      } else if (formMode === 'edit' && editingId) {
        await adminUpdateTruckModel(editingId, payload as UpdateTruckModelInput)
        appToast.success('Truck model updated.', { action: 'truck-model-save', entityId: editingId })
      }

      setConfirmKind(null)
      closeForm()
      await loadModels()
    } catch (e) {
      setConfirmKind(null)
      setUploadBusy(false)
      setFieldErrors({ name: getApiErrorMessage(e, 'Request failed. Please try again.') })
    } finally {
      setActionBusy(false)
    }
  }

  const executeArchive = async () => {
    if (!archiveTarget) return
    const id = archiveTarget.model_id
    setActionBusy(true)
    try {
      await adminArchiveTruckModel(id)
      appToast.success(`${archiveTarget.name} archived.`, { action: 'truck-model-archive', entityId: id })
      if (editingId === id) closeForm()
      if (viewModel?.model_id === id) setViewModel(null)
      setArchiveTarget(null)
      setConfirmKind(null)
      await loadModels()
    } catch (e) {
      // Most often: vehicles still use this model. The server names them.
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'truck-model-archive', entityId: id })
      setConfirmKind(null)
    } finally {
      setActionBusy(false)
    }
  }

  const confirmTitle = confirmKind === 'archive'
    ? 'Archive model?'
    : formMode === 'create' ? 'Create model?' : 'Save changes?'

  const confirmDescription = confirmKind === 'archive'
    ? `"${archiveTarget?.name ?? 'This model'}" will be hidden from the catalog and can no longer be picked for vehicles. `
      + 'Past bookings keep their details. A model still used by an active vehicle cannot be archived.'
    : formMode === 'create'
      ? `Add "${form.name.trim() || 'this model'}" to the catalog?`
      : `Save updates to "${form.name.trim() || 'this model'}"?`

  const confirmLabel = actionBusy
    ? (uploadBusy ? 'Uploading…' : 'Saving…')
    : confirmKind === 'archive'
      ? 'Archive'
      : formMode === 'create' ? 'Create' : 'Save'

  const inputCls = (hasErr: boolean) =>
    `w-full rounded-lg border bg-[#111] px-3 py-2.5 text-sm text-white outline-none transition-colors
     ${hasErr
       ? 'border-red-400/60 focus:border-red-400'
       : 'border-white/10 focus:border-[var(--color-cyan)]/40'}`

  return (
    <>
      <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 gap-3 overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center shrink-0">
          <div
            className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-md"
            style={{ background: '#2a2828' }}
          >
            <Search size={16} className="text-white/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search model, type, use…"
              className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
            />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => void loadModels()}
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
                Add model
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
          {listLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <div
                className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--color-cyan)' }}
              />
              <p className="text-sm text-white/45">Loading models…</p>
            </div>
          ) : listError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <p className="text-red-400 text-sm text-center">{listError}</p>
              <button type="button" onClick={() => void loadModels()} className="text-[var(--color-cyan)] text-sm font-semibold">
                Try again
              </button>
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12 text-center px-4">
              <TruckIcon size={40} className="text-white/20" />
              <p className="text-sm text-white/45">
                {models.length === 0 ? 'No truck models yet.' : 'No models match your search.'}
              </p>
              {models.length === 0 && canCreate && (
                <button type="button" onClick={openCreate} className="text-[var(--color-cyan)] text-sm font-bold">
                  Add the first model
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-left text-sm border-collapse min-w-[700px]">
                <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                  <tr className="text-[11px] uppercase tracking-wider text-white/40">
                    <th className="px-2 py-2.5 font-bold w-14 text-center">Image</th>
                    <th className="px-3 py-2.5 font-bold">Model</th>
                    <th className="px-3 py-2.5 font-bold">Vehicle type</th>
                    <th className="px-3 py-2.5 font-bold hidden md:table-cell">Cargo bed (mm)</th>
                    <th className="px-3 py-2.5 font-bold">Max weight</th>
                    <th className="px-3 py-2.5 font-bold hidden md:table-cell">Max volume</th>
                    <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Stackable</th>
                    <th className="px-3 py-2.5 font-bold text-right w-[90px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleModels.map((m) => (
                    <tr key={m.model_id} className="border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors">
                      <td className="px-2 py-2 align-middle">
                        <div className="flex justify-center">
                          <ModelThumb imageUrl={m.image_url ?? null} label={m.name} size={44} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-white max-w-[240px] truncate">{m.name}</td>
                      <td className="px-3 py-2.5 text-white/70">{m.vehicle_type ?? '—'}</td>
                      <td className="px-3 py-2.5 text-white/60 text-xs hidden md:table-cell tabular-nums">{m.dimension_mm ?? '—'}</td>
                      <td className="px-3 py-2.5 text-white/60 text-xs tabular-nums">
                        {m.max_weight_kg != null ? `${m.max_weight_kg.toLocaleString()} kg · ${kgToTons(m.max_weight_kg)} t` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-white/60 text-xs hidden md:table-cell tabular-nums">
                        {m.max_volume_cbm != null ? `${m.max_volume_cbm} cbm` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs hidden lg:table-cell">
                        {m.stackable_friendly
                          ? <span className="text-emerald-400/80">Yes</span>
                          : <span className="text-white/35">No</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <RecordLockBadge holder={modelLocks.get(m.model_id)} />
                          <RowActionMenu label={`Actions for ${m.name}`} actions={rowActions(m)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit form modal */}
      <AnimatePresence>
        {formMode && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/65"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeForm}
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">
                  {formMode === 'create' ? 'New truck model' : 'Edit truck model'}
                </h2>
                <button type="button" onClick={closeForm} className="p-2 rounded-lg hover:bg-white/5 text-white/50">
                  <X size={18} />
                </button>
              </div>

              <RecordLockBanner lock={modelLock} noun="truck model" className="mx-4 mt-4" />
              <fieldset
                disabled={modelLock.readOnly}
                className={`p-4 space-y-4 min-w-0 border-0 m-0 ${modelLock.readOnly ? 'pointer-events-none opacity-70' : ''}`}
              >

                {/* Image upload */}
                <div className="flex flex-col gap-1">
                  <div
                    className="relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors overflow-hidden"
                    style={{
                      borderColor: fieldErrors.image
                        ? 'rgba(248,113,113,0.6)'
                        : imagePreview ? 'transparent' : 'rgba(255,255,255,0.12)',
                      minHeight: 140,
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {imagePreview ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-xl" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-xl">
                          <Upload size={18} className="text-white" />
                          <span className="text-sm font-semibold text-white">Change image</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-6 text-white/30 hover:text-white/50 transition-colors">
                        <Upload size={28} />
                        <span className="text-xs font-semibold">Click to upload image</span>
                        <span className="text-[10px]">PNG, JPG, WEBP · max 5 MB</span>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                  {fieldErrors.image && (
                    <p className="text-[11px] text-red-400 mt-0.5">{fieldErrors.image}</p>
                  )}
                </div>

                {/* Model name */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase text-white/40">
                    Model name <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, name: e.target.value }))
                      if (touched) setFieldErrors((prev) => ({ ...prev, name: undefined }))
                    }}
                    className={inputCls(!!fieldErrors.name)}
                    placeholder="e.g. Isuzu NQR 4HK1"
                  />
                  {fieldErrors.name && <p className="text-[11px] text-red-400">{fieldErrors.name}</p>}
                </div>

                {/* Vehicle type */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase text-white/40">
                    Vehicle type <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={isOtherType ? 'Others' : form.vehicle_type}
                    onChange={handleVehicleTypeChange}
                    className={inputCls(!!fieldErrors.vehicle_type)}
                  >
                    <option value="">Select type</option>
                    {VEHICLE_TYPES.map((vt) => (
                      <option key={vt} value={vt}>{vt}</option>
                    ))}
                  </select>
                  {isOtherType && (
                    <input
                      value={form.vehicle_type}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, vehicle_type: e.target.value }))
                        if (touched) setFieldErrors((prev) => ({ ...prev, vehicle_type: undefined }))
                      }}
                      className={`mt-1.5 ${inputCls(!!fieldErrors.vehicle_type)}`}
                      placeholder="Specify vehicle type…"
                      autoFocus
                    />
                  )}
                  {fieldErrors.vehicle_type && (
                    <p className="text-[11px] text-red-400">{fieldErrors.vehicle_type}</p>
                  )}
                </div>

                {/* Dimensions */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase text-white/40">
                    Dimensions (mm) <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-start gap-2">
                    {(
                      [
                        { key: 'length_mm', sub: 'L', placeholder: 'Length' },
                        { key: 'width_mm',  sub: 'W', placeholder: 'Width'  },
                        { key: 'height_mm', sub: 'H', placeholder: 'Height' },
                      ] as const
                    ).map(({ key, sub, placeholder }, i) => (
                      <div key={key} className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={form[key]}
                            onChange={(e) => {
                              setForm((f) => ({ ...f, [key]: e.target.value }))
                              if (touched) setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
                            }}
                            className={inputCls(!!fieldErrors[key])}
                            placeholder={placeholder}
                          />
                          <p className="text-[10px] text-white/25 text-center">{sub}</p>
                          {fieldErrors[key] && (
                            <p className="text-[11px] text-red-400">{fieldErrors[key]}</p>
                          )}
                        </div>
                        {i < 2 && (
                          <span className="text-white/30 font-bold text-base pb-5">×</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Max weight / volume / length */}
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      { key: 'max_weight_kg',  label: 'Max weight (kg)',  placeholder: 'E.g. 4000',  step: '0.01' },
                      { key: 'max_volume_cbm', label: 'Max volume (cbm)', placeholder: 'E.g. 34.56', step: '0.01' },
                      { key: 'max_length_cm',  label: 'Max length (cm)',  placeholder: 'E.g. 600',   step: '0.1'  },
                    ] as const
                  ).map(({ key, label, placeholder, step }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-white/40">
                        {label} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="number"
                        step={step}
                        min="0"
                        value={form[key]}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, [key]: e.target.value }))
                          if (touched) setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
                        }}
                        className={inputCls(!!fieldErrors[key])}
                        placeholder={placeholder}
                      />
                      {fieldErrors[key] && (
                        <p className="text-[11px] text-red-400">{fieldErrors[key]}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Suitable for */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase text-white/40">
                    Suitable for <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={form.suitable_for}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, suitable_for: e.target.value }))
                      if (touched) setFieldErrors((prev) => ({ ...prev, suitable_for: undefined }))
                    }}
                    className={inputCls(!!fieldErrors.suitable_for)}
                    placeholder="e.g. Medium cargo, FMCG deliveries"
                  />
                  {fieldErrors.suitable_for && (
                    <p className="text-[11px] text-red-400">{fieldErrors.suitable_for}</p>
                  )}
                </div>

                {/* Stackable toggle */}
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div
                    className="w-9 h-5 rounded-full border transition-colors relative shrink-0"
                    style={{
                      background:  form.stackable_friendly ? 'var(--color-cyan)' : 'rgba(255,255,255,0.08)',
                      borderColor: form.stackable_friendly ? 'var(--color-cyan)' : 'rgba(255,255,255,0.12)',
                    }}
                    onClick={() => setForm((f) => ({ ...f, stackable_friendly: !f.stackable_friendly }))}
                  >
                    <div
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow"
                      style={{ transform: form.stackable_friendly ? 'translateX(18px)' : 'translateX(2px)' }}
                    />
                  </div>
                  <span className="text-sm text-white/70">Stackable friendly</span>
                </label>

                {/* API / server error */}
                {touched && fieldErrors.name && actionBusy === false && (
                  <p className="text-xs text-red-400 border border-red-500/25 rounded-lg px-3 py-2 bg-red-500/10">
                    {fieldErrors.name}
                  </p>
                )}

              </fieldset>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/[0.07]">
                {formMode === 'edit' && editingModel && canDelete && (
                  <button
                    type="button"
                    onClick={() => handleArchiveClick(editingModel)}
                    disabled={modelLock.readOnly}
                    className="text-xs font-semibold text-yellow-400 hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    Archive model…
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveClick}
                    disabled={actionBusy || !hasChanges || modelLock.readOnly}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-50"
                    style={{ background: 'var(--color-cyan)' }}
                  >
                    {formMode === 'create' ? 'Create' : 'Save'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Read-only model details */}
      <AnimatePresence>
        {viewModel && (
          <motion.div
            className="fixed inset-0 z-[66] flex items-center justify-center p-4 bg-black/65"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setViewModel(null)}
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              role="dialog"
              aria-modal="true"
              aria-label={`Details for ${viewModel.name}`}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Truck model details</h2>
                <button type="button" onClick={() => setViewModel(null)} className="p-2 rounded-lg hover:bg-white/5 text-white/50" aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {viewModel.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={viewModel.image_url} alt={viewModel.name} className="w-full h-44 object-cover rounded-xl border border-white/10 bg-black/30" />
                ) : (
                  <div className="w-full h-44 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center">
                    <TruckIcon size={40} className="text-white/20" />
                  </div>
                )}

                <div>
                  <p className="text-base font-semibold text-white">{viewModel.name}</p>
                  {viewModel.vehicle_type && (
                    <span
                      className="inline-flex mt-1 text-[10px] font-bold px-2 py-0.5 rounded-md border"
                      style={{ background: 'rgba(77,249,237,0.08)', borderColor: 'rgba(77,249,237,0.25)', color: 'var(--color-cyan)' }}
                    >
                      {viewModel.vehicle_type}
                    </span>
                  )}
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3">
                  {([
                    ['Dimensions (mm)', viewModel.dimension_mm ?? '—'],
                    ['Max weight',      viewModel.max_weight_kg  != null ? `${viewModel.max_weight_kg.toLocaleString()} kg` : '—'],
                    ['Max volume',      viewModel.max_volume_cbm != null ? `${viewModel.max_volume_cbm} cbm` : '—'],
                    ['Max length',      viewModel.max_length_cm  != null ? `${viewModel.max_length_cm} cm` : '—'],
                    ['Suitable for',    viewModel.suitable_for || '—'],
                    ['Stackable',       viewModel.stackable_friendly ? 'Yes' : 'No'],
                    ['Added',           viewModel.created_at ? new Date(viewModel.created_at).toLocaleString() : '—'],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.05] last:border-0">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-white/40 shrink-0">{label}</span>
                      <span className="text-sm text-white/80 text-right min-w-0 break-words">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => setViewModel(null)}
                  className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/5"
                >
                  Close
                </button>
                {canEdit && (
                <button
                  type="button"
                  disabled={modelLocks.has(viewModel.model_id)}
                  title={modelLocks.has(viewModel.model_id) ? `${modelLocks.get(viewModel.model_id)} is editing this model` : undefined}
                  onClick={() => { const m = viewModel; setViewModel(null); openEdit(m) }}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-40"
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

      <ReusableModal
        open={!!confirmKind}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        cancelLabel="Cancel"
        disableBackdropClose={actionBusy}
        onCancel={() => {
          if (actionBusy) return
          setConfirmKind(null)
          if (confirmKind === 'archive') setArchiveTarget(null)
        }}
        onConfirm={() => {
          if (confirmKind === 'archive') void executeArchive()
          else void executeSave()
        }}
      />
    </>
  )
}