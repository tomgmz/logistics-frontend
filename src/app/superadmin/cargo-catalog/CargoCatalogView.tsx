'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Tag, Layers, Package } from 'lucide-react'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { cargoCatalogService } from '../../../lib/services/admin/cargo-catalog.service'
import type {
  Commodity,
  CreateCommodityPayload,
  CreateHandlingCodePayload,
  CreateProductPayload,
  HandlingCode,
  Product,
} from '@/app/types/admin/cargo-catalog.types'

const TABS = [
  { key: 'handling',     label: 'Handling Codes', icon: Tag },
  { key: 'commodities',  label: 'Commodities',    icon: Layers },
  { key: 'products',     label: 'Products',        icon: Package },
] as const
type TabKey = (typeof TABS)[number]['key']

// ── form state types ────────────────────────────────────────────────────────
type HandlingForm = { code: string; name: string; description: string; type: 'standard' | 'additional' }
type CommodityForm = { name: string; description: string; category: string }
type ProductForm   = { commodity_id: string; name: string; description: string; unit: string }

const initHandling:  HandlingForm  = { code: '', name: '', description: '', type: 'standard' }
const initCommodity: CommodityForm = { name: '', description: '', category: '' }
const initProduct:   ProductForm   = { commodity_id: '', name: '', description: '', unit: '' }

// ── shared input classes ────────────────────────────────────────────────────
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

export default function CargoCatalogView() {
  const [tab, setTab]               = useState<TabKey>('handling')
  const [handlingCodes, setHandling] = useState<HandlingCode[]>([])
  const [commodities, setCommodities] = useState<Commodity[]>([])
  const [products, setProducts]       = useState<Product[]>([])
  const [loading, setLoading]         = useState(false)
  const [saving, setSaving]           = useState(false)

  const [hForm, setHForm] = useState<HandlingForm>(initHandling)
  const [cForm, setCForm] = useState<CommodityForm>(initCommodity)
  const [pForm, setPForm] = useState<ProductForm>(initProduct)

  // ── load all ──────────────────────────────────────────────────────────────
  async function load() {
    try {
      setLoading(true)
      const [codes, comms, prods] = await Promise.all([
        cargoCatalogService.getHandlingCodes(),
        cargoCatalogService.getCommodities(),
        cargoCatalogService.getProducts(),
      ])
      setHandling(codes)
      setCommodities(comms)
      setProducts(prods)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to load catalog data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  // ── derived: products filtered by selected commodity ─────────────────────
  const filteredProducts = useMemo(() => {
    if (!pForm.commodity_id) return products
    return products.filter((p) => p.commodity_id === pForm.commodity_id)
  }, [products, pForm.commodity_id])

  // ── submit handlers ───────────────────────────────────────────────────────
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
      const created = await cargoCatalogService.createHandlingCode(payload)
      setHandling((prev) => [created, ...prev])
      setHForm(initHandling)
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
      const created = await cargoCatalogService.createCommodity(payload)
      setCommodities((prev) => [created, ...prev])
      setCForm(initCommodity)
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
      const created = await cargoCatalogService.createProduct(payload)
      setProducts((prev) => [created, ...prev])
      setPForm(initProduct)
      appToast.success(`Product "${created.name}" added.`)
    } catch (e: unknown) {
      appToast.error(getApiErrorMessage(e) || 'Failed to add product')
    } finally {
      setSaving(false)
    }
  }

  // ── form renderers ────────────────────────────────────────────────────────
  function renderForm() {
    if (tab === 'handling') return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code">
            <input
              value={hForm.code}
              onChange={(e) => setHForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              className={inputCls}
              placeholder="e.g. GEN"
            />
          </Field>
          <Field label="Type">
            <div className="flex gap-2 pt-0.5">
              {(['standard', 'additional'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setHForm((p) => ({ ...p, type: t }))}
                  className="flex-1 rounded-lg border py-2.5 text-xs font-bold uppercase tracking-widest transition"
                  style={hForm.type === t
                    ? { borderColor: '#4DF9ED55', background: 'rgba(77,249,237,0.10)', color: '#4DF9ED' }
                    : { borderColor: 'rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.35)' }
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Name">
          <input
            value={hForm.name}
            onChange={(e) => setHForm((p) => ({ ...p, name: e.target.value }))}
            className={inputCls}
            placeholder="e.g. General Cargo"
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={hForm.description}
            onChange={(e) => setHForm((p) => ({ ...p, description: e.target.value }))}
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
            onChange={(e) => setCForm((p) => ({ ...p, name: e.target.value }))}
            className={inputCls}
            placeholder="e.g. Electronics"
          />
        </Field>
        <Field label="Category (optional)">
          <input
            value={cForm.category}
            onChange={(e) => setCForm((p) => ({ ...p, category: e.target.value }))}
            className={inputCls}
            placeholder="e.g. Consumer Goods"
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={cForm.description}
            onChange={(e) => setCForm((p) => ({ ...p, description: e.target.value }))}
            className={`${inputCls} min-h-[90px] resize-none`}
            placeholder="Optional details"
          />
        </Field>
        <SubmitBtn label="Add commodity" busy={saving} onClick={() => void submitCommodity()} />
      </div>
    )

    // products tab
    return (
      <div className="space-y-4">
        <Field label="Commodity *">
          <select
            value={pForm.commodity_id}
            onChange={(e) => setPForm((p) => ({ ...p, commodity_id: e.target.value }))}
            className={inputCls}
            style={{ colorScheme: 'dark' }}
          >
            <option value="">Select commodity…</option>
            {commodities.map((c) => (
              <option key={c.commodity_id} value={c.commodity_id}>
                {c.name}{c.category ? ` — ${c.category}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Product name *">
          <input
            value={pForm.name}
            onChange={(e) => setPForm((p) => ({ ...p, name: e.target.value }))}
            className={inputCls}
            placeholder="e.g. LCD Monitor"
          />
        </Field>
        <Field label="Unit (optional)">
          <input
            value={pForm.unit}
            onChange={(e) => setPForm((p) => ({ ...p, unit: e.target.value }))}
            className={inputCls}
            placeholder="e.g. pcs, kg, bundle"
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={pForm.description}
            onChange={(e) => setPForm((p) => ({ ...p, description: e.target.value }))}
            className={`${inputCls} min-h-[90px] resize-none`}
            placeholder="Optional details"
          />
        </Field>
        <SubmitBtn label="Add product" busy={saving} onClick={() => void submitProduct()} />
      </div>
    )
  }

  // ── list renderer ─────────────────────────────────────────────────────────
  function renderList() {
    if (loading) return (
      <div className="flex items-center justify-center py-12">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-[#4DF9ED]" />
      </div>
    )

    const items =
      tab === 'handling'    ? handlingCodes :
      tab === 'commodities' ? commodities :
      tab === 'products'    ? (pForm.commodity_id ? filteredProducts : products) : []

    if (items.length === 0) return (
      <p className="text-sm text-white/30 py-6 text-center">No entries yet.</p>
    )

    return (
      <div className="space-y-2">
        {tab === 'handling' && (handlingCodes as HandlingCode[]).map((hc) => (
          <div key={hc.handling_code_id} className="rounded-lg border border-white/[0.07] bg-black/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-sm font-bold text-[#4DF9ED]">{hc.code}</span>
                <span className="ml-2 text-sm text-white/70">{hc.name}</span>
              </div>
              <span className="shrink-0 rounded border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/40">
                {hc.type}
              </span>
            </div>
            {hc.description && <p className="mt-1.5 text-xs text-white/35">{hc.description}</p>}
          </div>
        ))}

        {tab === 'commodities' && (commodities as Commodity[]).map((c) => (
          <div key={c.commodity_id} className="rounded-lg border border-white/[0.07] bg-black/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                {c.category && <p className="text-xs text-white/40 mt-0.5">{c.category}</p>}
              </div>
              <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                c.is_active
                  ? 'border-[#4DF9ED]/30 text-[#4DF9ED]'
                  : 'border-white/10 text-white/30'
              }`}>
                {c.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            {c.description && <p className="mt-1.5 text-xs text-white/35">{c.description}</p>}
          </div>
        ))}

        {tab === 'products' && (pForm.commodity_id ? filteredProducts : products).map((prod) => (
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
              <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                prod.is_active
                  ? 'border-[#4DF9ED]/30 text-[#4DF9ED]'
                  : 'border-white/10 text-white/30'
              }`}>
                {prod.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            {prod.description && <p className="mt-1.5 text-xs text-white/35">{prod.description}</p>}
          </div>
        ))}
      </div>
    )
  }

  const activeTab = TABS.find((t) => t.key === tab)!

  return (
    <div className="flex flex-col min-h-0 h-[calc(100dvh-80px)] overflow-hidden bg-[var(--color-bg,#0d0d0d)]">

      {/* ── header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/[0.07] px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Super Admin</p>
          <h1 className="mt-0.5 text-lg font-bold tracking-tight text-white">Cargo Catalog</h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </header>

      {/* ── tab bar ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex gap-1 border-b border-white/[0.07] px-4 pt-2">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="inline-flex items-center gap-1.5 px-3 pb-2.5 pt-1.5 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors"
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

      {/* ── body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* form panel */}
        <div className="w-[360px] shrink-0 border-r border-white/[0.07] flex flex-col">
          <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.07]">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">New entry</p>
            <h2 className="mt-0.5 text-base font-bold text-white">Add {activeTab.label.slice(0, -1)}</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {renderForm()}
          </div>
        </div>

        {/* list panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">Existing entries</p>
              <h2 className="mt-0.5 text-base font-bold text-white">{activeTab.label}</h2>
            </div>
            {/* commodity filter pill — only on products tab */}
            {tab === 'products' && pForm.commodity_id && (
              <button
                type="button"
                onClick={() => setPForm((p) => ({ ...p, commodity_id: '' }))}
                className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-colors"
                style={{ borderColor: '#4DF9ED55', color: '#4DF9ED', background: 'rgba(77,249,237,0.08)' }}
              >
                {commodities.find((c) => c.commodity_id === pForm.commodity_id)?.name ?? 'Filtered'} ✕
              </button>
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

// ── shared submit button ────────────────────────────────────────────────────
function SubmitBtn({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-colors disabled:opacity-40"
      style={{
        background:  'rgba(77,249,237,0.12)',
        border:      '1px solid rgba(77,249,237,0.30)',
        color:       '#4DF9ED',
      }}
    >
      <Plus size={15} />
      {busy ? 'Saving…' : label}
    </button>
  )
}