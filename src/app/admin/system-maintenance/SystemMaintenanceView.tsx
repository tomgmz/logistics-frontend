'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Tag, Layers, Package, Phone, Pencil, Trash2, X } from 'lucide-react'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { systemMaintenanceService } from '@/lib/services/admin/system-maintenance.service'
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
} from '@/lib/services/admin/system-maintenance.service'

// ── Tabs ────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'handling',    label: 'Handling Codes',   singular: 'Handling Code',   icon: Tag },
  { key: 'commodities', label: 'Commodities',       singular: 'Commodity',       icon: Layers },
  { key: 'products',    label: 'Products',          singular: 'Product',         icon: Package },
  { key: 'landline',    label: 'Landline Prefixes', singular: 'Landline Prefix', icon: Phone },
] as const
type TabKey = (typeof TABS)[number]['key']

// ── Form state ───────────────────────────────────────────────────────────────

type HandlingForm  = { code: string; name: string; description: string; type: HandlingCodeType }
type CommodityForm = { name: string; description: string; category: string }
type ProductForm   = { commodity_id: string; name: string; description: string; unit: string }
type LandlineForm  = { prefix: string; city: string; region: string }

const initHandling:  HandlingForm  = { code: '', name: '', description: '', type: 'standard' }
const initCommodity: CommodityForm = { name: '', description: '', category: '' }
const initProduct:   ProductForm   = { commodity_id: '', name: '', description: '', unit: '' }
const initLandline:  LandlineForm  = { prefix: '', city: '', region: '' }

// ── Shared styles ────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#4DF9ED]/40 focus:ring-0'
const labelCls = 'block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SystemMaintenanceView() {
  const [tab, setTab] = useState<TabKey>('handling')

  const [handlingCodes, setHandling]    = useState<HandlingCode[]>([])
  const [commodities,   setCommodities] = useState<Commodity[]>([])
  const [products,      setProducts]    = useState<Product[]>([])
  const [prefixes,      setPrefixes]    = useState<LandlinePrefix[]>([])

  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [hForm, setHForm] = useState<HandlingForm>(initHandling)
  const [cForm, setCForm] = useState<CommodityForm>(initCommodity)
  const [pForm, setPForm] = useState<ProductForm>(initProduct)
  const [lForm, setLForm] = useState<LandlineForm>(initLandline)

  const [editingPrefix, setEditingPrefix] = useState<LandlinePrefix | null>(null)

  // ── Load ───────────────────────────────────────────────────────────────────

  async function load() {
    try {
      setLoading(true)
      const [codes, comms, prods, pfxs] = await Promise.all([
        systemMaintenanceService.getHandlingCodes(),
        systemMaintenanceService.getCommodities(),
        systemMaintenanceService.getProducts(),
        systemMaintenanceService.getLandlinePrefixes(),
      ])
      setHandling(codes)
      setCommodities(comms)
      setProducts(prods)
      setPrefixes(pfxs)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    if (!pForm.commodity_id) return products
    return products.filter(p => p.commodity_id === pForm.commodity_id)
  }, [products, pForm.commodity_id])

  // ── Submit: handling ───────────────────────────────────────────────────────

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
      setHandling(prev => [created, ...prev])
      setHForm(initHandling)
      appToast.success(`Handling code ${created.code} added.`)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to add handling code')
    } finally {
      setSaving(false)
    }
  }

  // ── Submit: commodity ──────────────────────────────────────────────────────

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
      setCForm(initCommodity)
      appToast.success(`Commodity "${created.name}" added.`)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to add commodity')
    } finally {
      setSaving(false)
    }
  }

  // ── Submit: product ────────────────────────────────────────────────────────

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
      setProducts(prev => [created, ...prev])
      setPForm(initProduct)
      appToast.success(`Product "${created.name}" added.`)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to add product')
    } finally {
      setSaving(false)
    }
  }

  // ── Submit: landline prefix (create + update) ──────────────────────────────

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
        setPrefixes(prev => prev.map(p => p.prefix_id === updated.prefix_id ? updated : p))
        appToast.success(`Prefix (${updated.prefix}) updated.`)
        cancelEditLandline()
      } else {
        const payload: CreateLandlinePrefixPayload = {
          prefix: lForm.prefix.trim(),
          city:   lForm.city.trim(),
          region: lForm.region.trim() || null,
        }
        const created = await systemMaintenanceService.createLandlinePrefix(payload)
        setPrefixes(prev => [...prev, created].sort((a, b) => Number(a.prefix) - Number(b.prefix)))
        setLForm(initLandline)
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

  async function deletePrefix(pfx: LandlinePrefix) {
    try {
      setDeleting(pfx.prefix_id)
      await systemMaintenanceService.deleteLandlinePrefix(pfx.prefix_id)
      setPrefixes(prev => prev.filter(p => p.prefix_id !== pfx.prefix_id))
      if (editingPrefix?.prefix_id === pfx.prefix_id) cancelEditLandline()
      appToast.success(`Prefix (${pfx.prefix}) deleted.`)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to delete prefix')
    } finally {
      setDeleting(null)
    }
  }

  function startEditLandline(pfx: LandlinePrefix) {
    setEditingPrefix(pfx)
    setLForm({
      prefix: pfx.prefix,
      city:   pfx.city,
      region: pfx.region ?? '',
    })
  }

  function cancelEditLandline() {
    setEditingPrefix(null)
    setLForm(initLandline)
  }

  // ── Form renderers ─────────────────────────────────────────────────────────

  function renderForm() {
    if (tab === 'handling') return (
      <div className="space-y-4">
        <Field label="Code">
          <input
            value={hForm.code}
            onChange={e => setHForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
            className={inputCls}
            placeholder="e.g. GEN"
          />
        </Field>
        <Field label="Name">
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
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition
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

    // landline tab
    return (
      <div className="space-y-4">
        {editingPrefix && (
          <div className="flex items-center justify-between rounded-lg border border-[#4DF9ED]/20 bg-[#4DF9ED]/5 px-3 py-2">
            <p className="text-xs font-bold text-[#4DF9ED]">
              Editing ({editingPrefix.prefix}) {editingPrefix.city}
            </p>
            <button
              type="button"
              onClick={cancelEditLandline}
              className="text-white/40 hover:text-white/70 transition-colors"
              aria-label="Cancel edit"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <Field label="Prefix *">
          <input
            value={lForm.prefix}
            onChange={e => setLForm(p => ({ ...p, prefix: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
            className={inputCls}
            placeholder="e.g. 2, 32, 62"
            inputMode="numeric"
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
          busy={saving}
          onClick={() => void submitLandline()}
        />
      </div>
    )
  }

  // ── List renderer ──────────────────────────────────────────────────────────

  function renderList() {
    if (loading) return (
      <div className="flex items-center justify-center py-12">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-[#4DF9ED]" />
      </div>
    )

    if (tab === 'handling') {
      if (!handlingCodes.length) return <EmptyState />
      return (
        <div className="space-y-2">
          {handlingCodes.map(hc => (
            <div key={hc.handling_code_id} className="rounded-lg border border-white/[0.07] bg-black/30 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-bold text-[#4DF9ED]">{hc.code}</span>
                <span className="text-sm text-white/70">{hc.name}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-white/70">
                  {hc.type === 'additional' ? 'Additional' : 'Standard'}
                </span>
              </div>
              {hc.description && <p className="mt-1.5 text-xs text-white/35">{hc.description}</p>}
            </div>
          ))}
        </div>
      )
    }

    if (tab === 'commodities') {
      if (!commodities.length) return <EmptyState />
      return (
        <div className="space-y-2">
          {commodities.map(c => (
            <div key={c.commodity_id} className="rounded-lg border border-white/[0.07] bg-black/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                  {c.category && <p className="text-xs text-white/40 mt-0.5">{c.category}</p>}
                </div>
                <ActiveBadge active={c.is_active} />
              </div>
              {c.description && <p className="mt-1.5 text-xs text-white/35">{c.description}</p>}
            </div>
          ))}
        </div>
      )
    }

    if (tab === 'products') {
      const list = pForm.commodity_id ? filteredProducts : products
      if (!list.length) return <EmptyState />
      return (
        <div className="space-y-2">
          {list.map(prod => (
            <div key={prod.product_id} className="rounded-lg border border-white/[0.07] bg-black/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{prod.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {prod.commodities?.name ?? '—'}
                    {prod.commodities?.category ? ` · ${prod.commodities.category}` : ''}
                    {prod.unit ? ` · ${prod.unit}` : ''}
                  </p>
                </div>
                <ActiveBadge active={prod.is_active} />
              </div>
              {prod.description && <p className="mt-1.5 text-xs text-white/35">{prod.description}</p>}
            </div>
          ))}
        </div>
      )
    }

    // landline tab
    if (!prefixes.length) return <EmptyState />
    return (
      <div className="space-y-2">
        {prefixes.map(pfx => {
          const isBeingEdited  = editingPrefix?.prefix_id === pfx.prefix_id
          const isBeingDeleted = deleting === pfx.prefix_id
          return (
            <div
              key={pfx.prefix_id}
              className="rounded-lg border bg-black/30 p-3 transition-colors"
              style={{
                borderColor: isBeingEdited ? 'rgba(77,249,237,0.25)' : 'rgba(255,255,255,0.07)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <span
                    className="shrink-0 rounded border border-white/10 px-2 py-0.5 font-mono text-sm font-bold"
                    style={{ color: '#4DF9ED' }}
                  >
                    {pfx.prefix}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{pfx.city}</p>
                    {pfx.region && (
                      <p className="text-xs text-white/40 mt-0.5">{pfx.region}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEditLandline(pfx)}
                    disabled={isBeingDeleted}
                    className="rounded-md p-1.5 text-white/30 transition-colors hover:bg-white/5 hover:text-white/70 disabled:opacity-30"
                    aria-label={`Edit prefix ${pfx.prefix}`}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void deletePrefix(pfx)}
                    disabled={isBeingDeleted}
                    className="rounded-md p-1.5 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
                    aria-label={`Delete prefix ${pfx.prefix}`}
                  >
                    {isBeingDeleted
                      ? <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white/60" />
                      : <Trash2 size={13} />
                    }
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeTab = TABS.find(t => t.key === tab)!

  return (
    <div className="flex flex-col min-h-0 h-[calc(100dvh-80px)] overflow-hidden bg-[var(--color-bg,#0d0d0d)]">

      {/* header */}
      <header className="shrink-0 border-b border-white/[0.07] px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Admin</p>
          <h1 className="mt-0.5 text-lg font-bold tracking-tight text-white">System Maintenance</h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </header>

      {/* tab bar */}
      <div className="shrink-0 flex gap-1 border-b border-white/[0.07] px-4 pt-2 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key)
                if (key !== 'landline') cancelEditLandline()
              }}
              className="inline-flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-1.5 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors"
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
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* form panel */}
        <div className="w-[360px] shrink-0 border-r border-white/[0.07] flex flex-col">
          <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.07]">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">
              {tab === 'landline' && editingPrefix ? 'Edit entry' : 'New entry'}
            </p>
            <h2 className="mt-0.5 text-base font-bold text-white">
              {tab === 'landline' && editingPrefix
                ? `Edit ${activeTab.singular}`
                : `Add ${activeTab.singular}`}
            </h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {renderForm()}
          </div>
        </div>

        {/* list panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">
                Existing entries
              </p>
              <h2 className="mt-0.5 text-base font-bold text-white">{activeTab.label}</h2>
            </div>
            {tab === 'products' && pForm.commodity_id && (
              <button
                type="button"
                onClick={() => setPForm(p => ({ ...p, commodity_id: '' }))}
                className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-colors"
                style={{ borderColor: '#4DF9ED55', color: '#4DF9ED', background: 'rgba(77,249,237,0.08)' }}
              >
                {commodities.find(c => c.commodity_id === pForm.commodity_id)?.name ?? 'Filtered'} ✕
              </button>
            )}
            {tab === 'landline' && (
              <p className="text-xs text-white/30">{prefixes.length} prefix{prefixes.length !== 1 ? 'es' : ''}</p>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {renderList()}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────────

function SubmitBtn({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-colors disabled:opacity-40"
      style={{
        background: 'rgba(77,249,237,0.12)',
        border:     '1px solid rgba(77,249,237,0.30)',
        color:      '#4DF9ED',
      }}
    >
      <Plus size={15} />
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

function EmptyState() {
  return <p className="text-sm text-white/30 py-6 text-center">No entries yet.</p>
}