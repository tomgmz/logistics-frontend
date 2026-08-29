'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, BookOpen, RefreshCw, Save, X } from 'lucide-react'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  billingService,
  type BookletSettings as Booklet,
  type BookletUpdate,
} from '@/lib/services/admin/billing.service'

const CYAN = '#4df9ed'

const TITLES: Record<string, string> = {
  service_invoice: 'Service Invoice booklet',
  acknowledgement_receipt: 'Acknowledgement Receipt booklet',
}

function Field({
  label, value, onChange, hint, type = 'text', disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  type?: 'text' | 'number'
  disabled?: boolean
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">{label}</label>
      <input
        type={type} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white/85 outline-none focus:border-[rgba(77,249,237,0.4)] disabled:opacity-50"
      />
      {hint && <p className="text-[10px] text-white/35 mt-1">{hint}</p>}
    </div>
  )
}

/**
 * One pad's settings.
 *
 * The serial counter and the Authority to Print block both describe the
 * physical booklet in the drawer, so they are edited together — when a pad runs
 * out, all of it changes at once.
 */
function BookletCard({
  booklet,
  canEdit,
  onSaved,
}: {
  booklet: Booklet
  canEdit: boolean
  onSaved: () => void
}) {
  const [form, setForm] = useState<BookletUpdate>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const val = <K extends keyof Booklet>(key: K): string => {
    const pending = (form as Record<string, unknown>)[key as string]
    const v = pending !== undefined ? pending : booklet[key]
    return v === null || v === undefined ? '' : String(v)
  }
  const set = (key: string, v: unknown) => {
    setForm((f) => ({ ...f, [key]: v }))
    // A changed field invalidates whatever the last attempt warned about.
    setWarnings([])
  }

  const dirty = Object.keys(form).length > 0

  const preview = (() => {
    const n = Number(val('next_number'))
    const w = Number(val('pad_width')) || 1
    return Number.isFinite(n) ? String(n).padStart(w, '0') : ''
  })()

  async function save(acknowledge = false) {
    if (busy) return
    setBusy(true)
    try {
      const res = await billingService.saveBooklet(booklet.series_key, {
        ...form,
        acknowledge_warnings: acknowledge || undefined,
      })
      if (res.requires_confirmation) {
        // Nothing was written; the accountant has to see why first.
        setWarnings(res.warnings)
        return
      }
      appToast.success('Booklet settings saved.')
      setForm({})
      setWarnings([])
      onSaved()
    } catch (err) {
      appToast.error(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111] p-4">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={15} style={{ color: CYAN }} />
        <h3 className="text-sm font-bold text-white">{TITLES[booklet.series_key] ?? booklet.series_key}</h3>
        {dirty && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(246,159,38,.12)', color: '#fbbf24' }}>
            unsaved
          </span>
        )}
      </div>

      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-2">Serial</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Field label="Next serial" type="number" disabled={!canEdit}
          value={val('next_number')} onChange={(v) => set('next_number', Number(v))}
          hint={preview ? `prints as "${preview}"` : undefined} />
        <Field label="Range from" type="number" disabled={!canEdit}
          value={val('booklet_start')} onChange={(v) => set('booklet_start', v === '' ? null : Number(v))} />
        <Field label="Range to" type="number" disabled={!canEdit}
          value={val('booklet_end')} onChange={(v) => set('booklet_end', v === '' ? null : Number(v))} />
        <Field label="Digits" type="number" disabled={!canEdit}
          value={val('pad_width')} onChange={(v) => set('pad_width', Number(v))}
          hint="zero-padding" />
      </div>

      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 mb-2">
        Authority to Print — copy from the pad&rsquo;s footer
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field label="ATP number" disabled={!canEdit}
          value={val('atp_number')} onChange={(v) => set('atp_number', v)}
          hint="e.g. OCN 057AU2025000012162" />
        <Field label="Date of ATP" disabled={!canEdit}
          value={val('atp_date')} onChange={(v) => set('atp_date', v)}
          hint="exactly as printed, e.g. 08-06-2025" />
        <Field label="Booklets line" disabled={!canEdit}
          value={val('booklet_label')} onChange={(v) => set('booklet_label', v)}
          hint="e.g. 10 Bklts. (50x2) 001-500" />
      </div>

      <details className="mb-4">
        <summary className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 cursor-pointer">
          Printer details — rarely change
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Printer" disabled={!canEdit}
            value={val('printer_name')} onChange={(v) => set('printer_name', v)} />
          <Field label="Printer address" disabled={!canEdit}
            value={val('printer_address')} onChange={(v) => set('printer_address', v)} />
          <Field label="Printer VAT / tel" disabled={!canEdit}
            value={val('printer_vat')} onChange={(v) => set('printer_vat', v)} />
          <Field label="Accreditation" disabled={!canEdit}
            value={val('printer_accreditation')} onChange={(v) => set('printer_accreditation', v)} />
          <Field label="Date issued" disabled={!canEdit}
            value={val('printer_issued')} onChange={(v) => set('printer_issued', v)} />
          <Field label="Expiry date" disabled={!canEdit}
            value={val('printer_expiry')} onChange={(v) => set('printer_expiry', v)} />
        </div>
      </details>

      {warnings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border p-3 mb-4"
          style={{ borderColor: 'rgba(246,159,38,0.35)', background: 'rgba(246,159,38,0.07)' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={13} className="text-amber-400" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Check this before saving
            </p>
          </div>
          <ul className="space-y-1.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-white/70 leading-relaxed">· {w}</li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setWarnings([])}
              className="px-3 py-1.5 rounded-lg border border-white/15 text-[11px] text-white/80">
              <span className="inline-flex items-center gap-1"><X size={11} /> Cancel</span>
            </button>
            <button type="button" disabled={busy} onClick={() => save(true)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-black disabled:opacity-50"
              style={{ background: '#fbbf24' }}>
              {busy ? 'Saving…' : 'Save anyway'}
            </button>
          </div>
        </motion.div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-white/30">
          Last changed {new Date(booklet.updated_at).toLocaleDateString('en-PH', {
            year: 'numeric', month: 'short', day: 'numeric',
          })}
        </p>
        {canEdit && (
          <div className="flex gap-2">
            {dirty && (
              <button type="button" onClick={() => { setForm({}); setWarnings([]) }}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-[11px] font-semibold text-white/70 hover:bg-white/5">
                Discard
              </button>
            )}
            <button type="button" disabled={!dirty || busy || warnings.length > 0}
              onClick={() => save(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-black disabled:opacity-40"
              style={{ background: CYAN }}>
              <Save size={12} />{busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Booklet settings.
 *
 * These values are printed on every Service Invoice and Acknowledgement Receipt
 * the system generates. They used to be constants in the backend, which meant
 * buying a new pad required a developer and a deploy; now the accountant enters
 * them from the pad's own footer.
 */
export default function BookletSettings({ onClose }: { onClose: () => void }) {
  const { canView, canEdit } = useModuleAccess()
  const [booklets, setBooklets] = useState<Booklet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setBooklets(await billingService.listBooklets())
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (!canView) return null

  return (
    <motion.div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/65"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 14, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-none rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: 'var(--color-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.07]">
          <div>
            <h2 className="text-lg font-bold text-white">Booklet Settings</h2>
            <p className="text-xs text-white/45 mt-0.5">
              What gets printed on generated Service Invoices and Acknowledgement Receipts
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-white/50 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* The physical pad is the authority; this only mirrors it. Saying so
              here is the difference between a careful entry and a guess. */}
          <p className="text-xs text-white/50 leading-relaxed">
            Copy these from the footer of the pad you are writing on. The paper booklet is the
            authoritative BIR document — this only makes the generated PDF match it. The two pads
            are registered separately and do not share an Authority to Print.
          </p>

          {loading ? (
            <div className="p-10 flex items-center justify-center">
              <RefreshCw size={20} className="animate-spin text-white/40" />
            </div>
          ) : error ? (
            <div className="p-8 flex flex-col items-center gap-2">
              <AlertTriangle size={22} className="text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : (
            booklets.map((b) => (
              <BookletCard key={b.series_key} booklet={b} canEdit={canEdit} onSaved={load} />
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
