'use client'

import { useCallback, useEffect, useMemo, useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Truck as TruckIcon,
  Settings2,
} from 'lucide-react'

import type { Truck, CreateTruckInput, UpdateTruckInput } from '@/app/types/truck.types'
import type { TruckModel } from '@/app/types/truck-model'
import {
  adminFetchTrucksPaginated,
  adminCreateTruck,
  adminUpdateTruck,
  adminDeleteTruck,
  adminFetchTruckModels,
  adminFetchVendorsRaw,
} from '@/lib/services/admin/trucks.service'
import ReusableModal from '@/components/layout/ReusableModal'
import TruckModelFormModal from './TruckModelFormModal'
import { appToast } from '@/lib/toast'

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
  'in_use',
  'under_maintenance',
  'inactive',
  'archived',
]

function fmtLabel(s: string) {
  return (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function statusStyle(status: string): { bg: string; color: string; border: string } {
  switch (status) {
    case 'available':
      return { bg: 'rgba(58,246,38,0.12)', color: '#86efac', border: 'rgba(58,246,38,0.35)' }
    case 'in_use':
      return { bg: 'rgba(77,249,237,0.12)', color: 'var(--color-cyan)', border: 'rgba(77,249,237,0.35)' }
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

interface VendorOption {
  vendor_id: string
  label: string
}

function parseVendorOptions(raw: unknown[]): VendorOption[] {
  const out: VendorOption[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r       = row as Record<string, unknown>
    const vendors = r.vendors as Record<string, unknown> | Record<string, unknown>[] | null | undefined
    let vid = ''
    if (Array.isArray(vendors) && vendors[0] && typeof vendors[0] === 'object') {
      vid = String((vendors[0] as Record<string, unknown>).vendor_id ?? '')
    } else if (vendors && typeof vendors === 'object' && !Array.isArray(vendors)) {
      vid = String((vendors as Record<string, unknown>).vendor_id ?? '')
    }
    if (!vid) continue
    const fn    = typeof r.first_name === 'string' ? r.first_name : ''
    const ln    = typeof r.last_name  === 'string' ? r.last_name  : ''
    const email = typeof r.email      === 'string' ? r.email      : ''
    const label = `${fn} ${ln}`.trim() || email || vid
    out.push({ vendor_id: vid, label })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

function axiosMessage(err: unknown): string {
  const data = (err as { response?: { data?: { message?: string; errors?: { field: string; message: string }[] } } })
    .response?.data
  if (data?.errors?.length) return data.errors.map((e) => `${e.field}: ${e.message}`).join(' · ')
  if (data?.message && typeof data.message === 'string') return data.message
  if (err instanceof Error) return err.message
  return 'Request failed'
}

function kgToTons(kg: number | null | undefined): string {
  if (kg == null) return ''
  const tons = kg / 1000
  return parseFloat(tons.toFixed(3)).toString()
}

type FormMode    = 'create' | 'edit' | null
type ConfirmKind = 'save' | 'delete' | null

interface TruckFormState {
  plate_number: string
  model_id:     string
  owned_by:     'company' | 'vendor'
  vendor_id:    string
  status:       Truck['status']
}

function emptyForm(): TruckFormState {
  return {
    plate_number: '',
    model_id:     '',
    owned_by:     'company',
    vendor_id:    '',
    status:       'available',
  }
}

function truckToForm(t: Truck): TruckFormState {
  return {
    plate_number: t.plate_number ?? '',
    model_id:     t.model_id ?? '',
    owned_by:     t.owned_by,
    vendor_id:    t.vendor_id ?? '',
    status:       t.status,
  }
}

function formsEqual(a: TruckFormState, b: TruckFormState): boolean {
  return (
    a.plate_number === b.plate_number &&
    a.model_id     === b.model_id     &&
    a.owned_by     === b.owned_by     &&
    a.vendor_id    === b.vendor_id    &&
    a.status       === b.status
  )
}

export default function VehicleManagementView() {
  const [trucks,  setTrucks]  = useState<Truck[]>([])
  const [models,  setModels]  = useState<TruckModel[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])

  const [listLoading, setListLoading] = useState(true)
  const [listError,   setListError]   = useState<string | null>(null)

  const [search,          setSearch]          = useState('')
  const [statusFilter,    setStatusFilter]    = useState<string>('all')
  const [ownerFilter,     setOwnerFilter]     = useState<string>('all')
  const [page,            setPage]            = useState(0)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [listMeta,        setListMeta]        = useState<{
    total: number
    totalPages: number
  } | null>(null)

  const [modalMode,     setModalMode]     = useState<FormMode>(null)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [form,          setForm]          = useState<TruckFormState>(emptyForm())
  const [originalForm,  setOriginalForm]  = useState<TruckFormState>(emptyForm())
  const [formError,     setFormError]     = useState<string | null>(null)

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null)
  const [actionBusy,  setActionBusy]  = useState(false)
  const [deleteId,    setDeleteId]    = useState<string | null>(null)

  const [modelModalOpen, setModelModalOpen] = useState(false)

  const isUnchanged = modalMode === 'edit' && formsEqual(form, originalForm)

  const loadModelsVendors = useCallback(async () => {
    try {
      setListError(null)
      const [mList, vRaw] = await Promise.all([
        adminFetchTruckModels(),
        adminFetchVendorsRaw(),
      ])
      setModels(mList)
      setVendors(parseVendorOptions(vRaw))
    } catch (e) {
      setListError(axiosMessage(e))
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
        owned_by: ownerFilter,
        search:   debouncedSearch,
      })
      setTrucks(res.rows)
      setListMeta({ total: res.meta.total, totalPages: res.meta.totalPages })
      if (res.meta.totalPages >= 1 && page > res.meta.totalPages - 1) {
        setPage(res.meta.totalPages - 1)
      }
    } catch (e) {
      setListError(axiosMessage(e))
    } finally {
      setListLoading(false)
    }
  }, [page, statusFilter, ownerFilter, debouncedSearch])

  useEffect(() => {
    void loadModelsVendors()
  }, [loadModelsVendors])

  useEffect(() => {
    void loadTrucksPage()
  }, [loadTrucksPage])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadModelsVendors(), loadTrucksPage()])
  }, [loadModelsVendors, loadTrucksPage])

  const pageCount = Math.max(1, listMeta?.totalPages ?? 1)
  const pageSafe  = Math.min(page, pageCount - 1)
  const totalRows = listMeta?.total ?? 0

  const selectedModel         = useMemo(() => models.find((m) => m.model_id === form.model_id) ?? null, [models, form.model_id])
  const selectedModelImageUrl = resolveModelImageUrl(selectedModel?.image_url ?? null)

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
    if (form.owned_by === 'vendor' && !form.vendor_id.trim()) {
      setFormError('Select a vendor when ownership is Vendor.')
      return false
    }
    return true
  }

  const handleSaveClick = () => {
    if (!validateForm()) return
    setConfirmKind('save')
  }

  const handleDeleteClick = (id: string) => {
    setDeleteId(id)
    setConfirmKind('delete')
  }

  const executeSave = async () => {
    const model_id  = form.model_id.trim() || null
    const vendor_id = form.owned_by === 'vendor' ? form.vendor_id.trim() : null

    setActionBusy(true)
    try {
      if (modalMode === 'create') {
        const body: CreateTruckInput = {
          plate_number: form.plate_number.trim().toUpperCase(),
          model_id,
          owned_by:     form.owned_by,
          vendor_id,
        }
        await adminCreateTruck(body)
        appToast.success('Vehicle created.', { action: 'truck-save' })
      } else if (modalMode === 'edit' && editingId) {
        const body: UpdateTruckInput = {
          plate_number: form.plate_number.trim().toUpperCase(),
          model_id,
          status:       form.status,
          owned_by:     form.owned_by,
          vendor_id:    form.owned_by === 'vendor' ? vendor_id : null,
        }
        await adminUpdateTruck(editingId, body)
        appToast.success('Vehicle updated.', { action: 'truck-save', entityId: editingId })
      }
      setConfirmKind(null)
      closeModal()
      await refreshAll()
    } catch (e) {
      setConfirmKind(null)
      setFormError(axiosMessage(e))
    } finally {
      setActionBusy(false)
    }
  }

  const executeDelete = async () => {
    if (!deleteId) return
    setActionBusy(true)
    try {
      await adminDeleteTruck(deleteId)
      appToast.success('Vehicle removed.', { action: 'truck-delete', entityId: deleteId })
      if (editingId === deleteId) closeModal()
      setDeleteId(null)
      setConfirmKind(null)
      await refreshAll()
    } catch (e) {
      appToast.error(axiosMessage(e), { action: 'truck-delete', entityId: deleteId })
      setConfirmKind(null)
    } finally {
      setActionBusy(false)
    }
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
    if (confirmKind === 'delete') {
      return {
        title:        'Delete vehicle?',
        description:  'This cannot be undone. Active assignments may block deletion.',
        confirmLabel: actionBusy ? '…' : 'Delete',
        onConfirm:    () => { void executeDelete() },
      }
    }
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmKind, modalMode, form.plate_number, actionBusy])

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-body bg-[var(--color-bg)]">

      <header className="shrink-0 px-3 py-3 lg:px-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Vehicle management</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setModelModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
          >
            <Settings2 size={14} />
            Manage models
          </button>
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide text-black"
            style={{ background: 'var(--color-cyan)' }}
          >
            <Plus size={16} />
            Add vehicle
          </button>
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

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] uppercase tracking-wider text-white/35 self-center mr-1">Owner</span>
            {(['all', 'company', 'vendor'] as const).map((key) => {
              const label  = key === 'all' ? 'All' : fmtLabel(key)
              const active = ownerFilter === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setOwnerFilter(key); setPage(0) }}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                  style={{
                    background:  active ? 'rgba(246,159,38,0.12)' : 'transparent',
                    borderColor: active ? 'rgba(246,159,38,0.35)' : 'rgba(255,255,255,0.08)',
                    color:       active ? '#fbbf24' : '#888',
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
              <button type="button" onClick={openCreate} className="text-[var(--color-cyan)] text-sm font-bold">
                Add your first vehicle
              </button>
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
                      <th className="px-3 py-2.5 font-bold">Status</th>
                      <th className="px-3 py-2.5 font-bold">Owner</th>
                      <th className="px-3 py-2.5 font-bold text-right w-[100px]">Actions</th>
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
                          <td className="px-3 py-2.5">
                            <span
                              className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                              style={{ color: st.color, borderColor: st.border, background: st.bg }}
                            >
                              {fmtLabel(t.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-white/65 text-xs">{fmtLabel(t.owned_by)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => openEdit(t)}
                              className="p-1.5 rounded-md border border-white/10 text-white/70 hover:bg-white/5 mr-1"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(t.truck_id)}
                              className="p-1.5 rounded-md border border-red-500/25 text-red-400 hover:bg-red-500/10"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
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
          if (confirmKind === 'delete' && !editingId) setDeleteId(null)
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

              <div className="p-4 space-y-3">

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

                  {/* Dropdown mirror */}
                  <label className="block mt-2">
                    <span className="sr-only">Select model from list</span>
                    <select
                      value={form.model_id}
                      onChange={(e) => {
                        if (e.target.value) applyModelPick(e.target.value)
                        else clearModelPick()
                      }}
                      className="w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/80 outline-none"
                      aria-label="Select model from list"
                    >
                      <option value="">— None —</option>
                      {models.map((m) => (
                        <option key={m.model_id} value={m.model_id}>
                          {m.name} ({m.vehicle_type})
                        </option>
                      ))}
                    </select>
                  </label>
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

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-white/40">Owned by</span>
                    <select
                      value={form.owned_by}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          owned_by:  e.target.value as 'company' | 'vendor',
                          vendor_id: e.target.value === 'company' ? '' : f.vendor_id,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none"
                    >
                      <option value="company">Company</option>
                      <option value="vendor">Vendor</option>
                    </select>
                  </label>
                  {modalMode === 'edit' && (
                    <label className="block">
                      <span className="text-[11px] font-bold uppercase text-white/40">Status</span>
                      <select
                        value={form.status}
                        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Truck['status'] }))}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{fmtLabel(s)}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                {/* Vendor picker */}
                {form.owned_by === 'vendor' && (
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-white/40">Vendor</span>
                    <select
                      value={form.vendor_id}
                      onChange={(e) => setForm((f) => ({ ...f, vendor_id: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none"
                    >
                      <option value="">Select vendor</option>
                      {vendors.map((v) => (
                        <option key={v.vendor_id} value={v.vendor_id}>{v.label}</option>
                      ))}
                    </select>
                    {vendors.length === 0 && (
                      <p className="text-[11px] text-amber-400/90 mt-1">
                        No vendors loaded. Add vendors under user management first.
                      </p>
                    )}
                  </label>
                )}

                {formError && (
                  <p className="text-xs text-red-400 border border-red-500/25 rounded-lg px-3 py-2 bg-red-500/10">
                    {formError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/[0.07]">
                {modalMode === 'edit' && editingId && (
                  <button
                    type="button"
                    onClick={() => handleDeleteClick(editingId)}
                    className="text-xs font-semibold text-red-400 hover:underline"
                  >
                    Delete vehicle…
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
                    disabled={isUnchanged}
                    title={isUnchanged ? 'No changes to save' : undefined}
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