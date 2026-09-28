'use client'

import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'

import type { OdometerReading, TruckService } from '@/app/types/truck.types'
import { adminFetchTruckUpkeep } from '@/lib/services/admin/trucks.service'
import { fmtDay, fmtKm } from './upkeep-ui'

const READING_LABEL: Record<OdometerReading['kind'], string> = {
  initial:   'Initial reading',
  pre_trip:  'Before delivery',
  post_trip: 'After delivery',
  service:   'At service',
}

function who(p: { first_name: string | null; last_name: string | null } | null): string | null {
  if (!p) return null
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null
}

function PhotoLink({ url, label }: { url: string | null; label: string }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[var(--color-cyan)] hover:underline">
      <ImageIcon size={11} /> {label}
    </a>
  )
}

/** Service history and odometer readings, newest first, for the vehicle details. */
export default function UpkeepHistory({ truckId }: { truckId: string }) {
  const [services, setServices] = useState<TruckService[]>([])
  const [readings, setReadings] = useState<OdometerReading[]>([])
  const [loading,  setLoading]  = useState(true)
  const [failed,   setFailed]   = useState(false)

  useEffect(() => {
    // Mounted per vehicle (keyed by the caller), so it starts in the loading state.
    let cancelled = false
    adminFetchTruckUpkeep(truckId)
      .then((h) => { if (!cancelled) { setServices(h.services); setReadings(h.readings) } })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [truckId])

  if (loading) return <p className="text-[11px] text-white/35">Loading history…</p>
  if (failed)  return <p className="text-[11px] text-red-400">Could not load the service history.</p>

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">Service history</h3>
        {services.length === 0 ? (
          <p className="text-[11px] text-white/35">No service recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {services.slice(0, 10).map((s) => (
              <li key={s.service_id} className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white/85">{fmtDay(s.serviced_at)}</span>
                  <span className="text-[11px] text-white/45 tabular-nums">{fmtKm(s.odometer_km)}</span>
                </div>
                <p className="text-[11px] text-white/65 mt-1 leading-snug whitespace-pre-wrap">{s.work_done}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  {s.workshop && <span className="text-[10px] text-white/35">{s.workshop}</span>}
                  {who(s.recorder) && <span className="text-[10px] text-white/30">by {who(s.recorder)}</span>}
                  <PhotoLink url={s.receipt_url} label="Receipt" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">Odometer readings</h3>
        {readings.length === 0 ? (
          <p className="text-[11px] text-white/35">No reading yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.07] bg-black/20">
            {readings.slice(0, 12).map((r) => (
              <li key={r.reading_id} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                <span className="min-w-0">
                  <span className="block text-[11px] text-white/75">
                    {READING_LABEL[r.kind]}
                    {r.reference_number ? <span className="text-white/35"> · {r.reference_number}</span> : null}
                  </span>
                  <span className="block text-[10px] text-white/30">
                    {new Date(r.recorded_at).toLocaleString()}
                    {who(r.recorder) ? ` · ${who(r.recorder)}` : ''}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-xs font-mono tabular-nums text-white/85">{fmtKm(r.reading_km)}</span>
                  <PhotoLink url={r.photo_url} label="Photo" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
