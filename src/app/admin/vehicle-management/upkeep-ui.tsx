'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import type { ServiceStatus } from '@/app/types/truck.types'

/** Shared bits for odometer readings and routine service. */

export function fmtKm(km: number | null | undefined): string {
  return km == null ? '—' : `${km.toLocaleString()} km`
}

/** "12,345" / "12345" → 12345; anything else → null. */
export function parseKm(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  return Number(cleaned)
}

/** Today as `YYYY-MM-DD` in Philippine time (UTC+8), for date inputs. */
export function phToday(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
}

export function fmtDay(day: string | null | undefined): string {
  if (!day) return '—'
  const d = new Date(`${day}T00:00:00`)
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString()
}

export const inputCls =
  'mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none ' +
  'focus:border-[var(--color-cyan)]/40 disabled:opacity-50 date-input-cyan'

/**
 * Odometer entry. Shows the distance since the last reading as the Fleet
 * Manager types, and flags a jump big enough to be a typo.
 */
export function OdometerInput({
  value,
  onChange,
  lastKm,
  label = 'Odometer (km)',
  disabled,
}: {
  value:     string
  onChange:  (v: string) => void
  lastKm?:   number | null
  label?:    string
  disabled?: boolean
}) {
  const km   = parseKm(value)
  const diff = km != null && lastKm != null ? km - lastKm : null
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase text-white/40">
        {label} <span className="text-red-400">*</span>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        disabled={disabled}
        placeholder={lastKm != null ? `Last: ${lastKm.toLocaleString()}` : 'e.g. 48250'}
        className={`${inputCls} font-mono tabular-nums`}
      />
      {diff != null && (
        <span className={`block text-[10px] mt-1 ${diff < 0 ? 'text-red-400' : diff > 2000 ? 'text-amber-300' : 'text-white/35'}`}>
          {diff < 0
            ? `Lower than the last reading (${lastKm!.toLocaleString()} km) — odometers only go up`
            : diff > 2000
              ? `+${diff.toLocaleString()} km since the last reading — check for a typo`
              : `+${diff.toLocaleString()} km since the last reading`}
        </span>
      )}
    </label>
  )
}

/** Photo picker with a preview. The parent uploads the file when it submits. */
export function PhotoField({
  file,
  onFile,
  label,
  required,
  disabled,
}: {
  file:      File | null
  onFile:    (f: File | null) => void
  label:     string
  required?: boolean
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function pick(f: File | undefined) {
    if (!f) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) { setError('PNG, JPG or WEBP only.'); return }
    if (f.size > 8 * 1024 * 1024) { setError('Photo must be 8 MB or smaller.'); return }
    setError(null)
    onFile(f)
  }

  return (
    <div>
      <span className="text-[11px] font-bold uppercase text-white/40">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      <div className="mt-1 flex items-center gap-3">
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={label} className="w-20 h-20 object-cover rounded-lg border border-white/10" />
            {!disabled && (
              <button
                type="button"
                onClick={() => onFile(null)}
                className="absolute -top-2 -right-2 p-0.5 rounded-full bg-black border border-white/20 text-white/70"
                aria-label="Remove photo"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 disabled:opacity-40"
        >
          <Camera size={14} />
          {file ? 'Retake' : 'Add photo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
        />
      </div>
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
    </div>
  )
}

export function ServiceStatusBadge({ status }: { status: ServiceStatus | undefined }) {
  if (!status) return null
  const tone = {
    overdue:  { label: 'Service overdue',  color: '#fca5a5', border: 'rgba(248,113,113,0.40)', bg: 'rgba(248,113,113,0.12)' },
    due_soon: { label: 'Service due soon', color: '#fde047', border: 'rgba(250,204,21,0.35)',  bg: 'rgba(250,204,21,0.10)' },
    missing:  { label: 'Not set up',       color: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.15)', bg: 'transparent' },
    ok:       { label: 'Up to date',       color: '#86efac', border: 'rgba(58,246,38,0.30)',   bg: 'rgba(58,246,38,0.08)' },
  }[status.state]

  const detail = status.state === 'missing'
    ? 'Service schedule or odometer not entered'
    : `Due ${fmtDay(status.due_date)} or at ${fmtKm(status.due_km)}, whichever comes first`

  return (
    <span className="flex flex-col gap-0.5 items-start" title={detail}>
      <span
        className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
        style={{ color: tone.color, borderColor: tone.border, background: tone.bg }}
      >
        {tone.label}
      </span>
      {status.state !== 'missing' && status.km_left != null && status.days_left != null && (
        <span className="text-[10px] text-white/35 tabular-nums">
          {status.state === 'overdue'
            ? 'past due'
            : `${status.km_left.toLocaleString()} km · ${status.days_left} d left`}
        </span>
      )}
    </span>
  )
}
