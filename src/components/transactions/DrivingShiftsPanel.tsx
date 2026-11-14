'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, CarFront } from 'lucide-react'

import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { RemarksModal } from '@/components/layout/ReusableModal'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { formatDateTime } from './transaction-format'
import { BORDER_C, CYAN, MUTED } from './transaction-theme'
import { usePanelSection } from '@/components/ui/PanelReady'

/**
 * Who has been at the wheel: Start Navigation puts the main driver there, and
 * either crew member taps "I'm taking the wheel" in the app when they swap.
 * Kept for rest hours, traffic fines (no-contact apprehension) and accidents —
 * the phone in the truck says nothing about who drives it.
 *
 * "Swap main and second driver" is for when the main driver's phone is dead or
 * lost on the road: the second driver's phone then confirms the stops and
 * reports the truck's position. Only with a second driver, while in transit.
 */

interface SwapPreview {
  open_stops: Array<{
    trip_stop_id: string; trip_number: number; trip_loaded: boolean
    stop_number: number | null; address: string | null
    arrived_at: string | null; started_at: string | null
  }>
  main_last_heard_at:   string | null
  second_last_heard_at: string | null
  pending_late:         number
}

/** "12 min ago", red past 15 minutes (the phone is probably off or out of signal). */
function heard(at: string | null): { text: string; stale: boolean } {
  if (!at) return { text: 'never on this delivery', stale: true }
  const min = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60_000))
  const text = min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${span(at, null)} ago`
  return { text, stale: min > 15 }
}

interface Shift {
  shift_id:    string
  driver_id:   string
  driver_name: string | null
  started_at:  string
  ended_at:    string | null
  source:      'start' | 'switch' | 'staff'
  clock_adjusted: boolean
}

const SOURCE: Record<Shift['source'], string> = {
  start:  'started the delivery',
  switch: 'took the wheel in the app',
  staff:  'set by the office',
}

function span(from: string, to: string | null): string {
  const min = Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 60_000))
  const h = Math.floor(min / 60), m = min % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}

export default function DrivingShiftsPanel({ bookingId, inTransit, hasSecondDriver, canSwap, allowed, onSwapped }: {
  bookingId:       string
  inTransit:       boolean
  hasSecondDriver: boolean
  /** Operations Manager / Company Administrator, and nobody else is editing the booking. */
  canSwap:         boolean
  /** The Booking Management tier allows it. Read Only sees the button disabled. */
  allowed:         boolean
  onSwapped:       () => void
}) {
  const [shifts,   setShifts]   = useState<Shift[]>([])
  const [swapping, setSwapping] = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [preview,  setPreview]  = useState<SwapPreview | null>(null)

  // What the swap dialog shows: read fresh each time it opens.
  useEffect(() => {
    if (!swapping) { setPreview(null); return }
    proxyApi.get<{ data: SwapPreview }>(`/admin/assignments/${bookingId}/swap-preview`)
      .then(({ data }) => setPreview(data.data ?? null))
      .catch(() => setPreview(null))
  }, [swapping, bookingId])

  const [loaded, setLoaded] = useState(false)
  usePanelSection(!loaded)
  const load = useCallback(() => {
    proxyApi.get<{ data: Shift[] }>(`/admin/assignments/${bookingId}/driving-shifts`)
      .then(({ data }) => setShifts(data.data ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [bookingId])
  useEffect(() => { load() }, [load])
  useLiveTable(['live:bookings'], load)

  async function swap(reason: string) {
    setBusy(true)
    try {
      await initCsrf()
      await proxyApi.post(`/admin/assignments/${bookingId}/swap-drivers`, { reason })
      appToast.success('Main and second driver swapped. Both drivers have been told.')
      setSwapping(false)
      load()
      onSwapped()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not swap the drivers.'))
    } finally {
      setBusy(false)
    }
  }

  if (shifts.length === 0 && !(inTransit && hasSecondDriver)) return null
  const current = shifts.find((s) => !s.ended_at) ?? null

  return (
    <div className="rounded-xl border p-3.5 flex flex-col gap-2.5" style={{ borderColor: BORDER_C }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <CarFront size={15} style={{ color: CYAN }} /> Who is driving
        </h3>
        {inTransit && hasSecondDriver && canSwap && (
          <button type="button" disabled={busy} onClick={() => setSwapping(true)} {...writeAccess(allowed)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white/70 disabled:opacity-40 disabled:cursor-not-allowed [@media(hover:hover)]:hover:text-white">
            <ArrowLeftRight size={12} /> Swap main and second driver
          </button>
        )}
      </div>

      {current && (
        <p className="text-[13px] text-white">
          {current.driver_name ?? 'A driver'} <span style={{ color: MUTED }}>since {formatDateTime(current.started_at)} ({span(current.started_at, null)})</span>
        </p>
      )}

      {shifts.length > 0 && (
        <ul className="flex flex-col gap-1">
          {shifts.map((s) => (
            <li key={s.shift_id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px]">
              <span className="text-white/85">{s.driver_name ?? 'Driver'} <span style={{ color: MUTED }}>· {SOURCE[s.source]}</span></span>
              <span style={{ color: MUTED }}>
                {formatDateTime(s.started_at)} – {s.ended_at ? formatDateTime(s.ended_at) : 'now'} · {span(s.started_at, s.ended_at)}
                {s.clock_adjusted && ' (phone clock corrected)'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <RemarksModal
        open={swapping}
        title="Swap main and second driver?"
        description="Use this when the main driver's phone is dead or lost. The second driver's phone confirms the stops and photos from now on."
        remarksLabel="Reason"
        remarksPlaceholder="e.g. Main driver's phone died after drop-off 2."
        confirmLabel={busy ? 'Swapping…' : 'Swap drivers'}
        cancelLabel="Cancel"
        busy={busy}
        disableBackdropClose={busy}
        onConfirm={(reason) => { void swap(reason) }}
        onCancel={() => { if (!busy) setSwapping(false) }}
      >
        <div className="mt-3 flex flex-col gap-2 text-[12px] text-white/80">
          {!preview ? (
            <p style={{ color: MUTED }}>Checking the drop-offs…</p>
          ) : (
            <>
              <p>
                Main driver&apos;s phone last heard from:{' '}
                <span style={{ color: heard(preview.main_last_heard_at).stale ? '#f62626' : 'inherit', fontWeight: 700 }}>
                  {heard(preview.main_last_heard_at).text}
                </span>
                {' · '}second driver&apos;s: {heard(preview.second_last_heard_at).text}
              </p>
              {preview.open_stops.length > 0 ? (
                <div>
                  <p className="font-bold text-white">Drop-offs not yet recorded ({preview.open_stops.length})</p>
                  <ul className="mt-1 flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                    {preview.open_stops.map((o) => (
                      <li key={o.trip_stop_id} className="break-words">
                        Trip {o.trip_number} · Stop {o.stop_number ?? '?'}{o.address ? ` — ${o.address}` : ''}
                        <span style={{ color: MUTED }}>
                          {o.started_at ? ` · started ${formatDateTime(o.started_at)}`
                            : o.arrived_at ? ` · arrived ${formatDateTime(o.arrived_at)}`
                            : !o.trip_loaded ? ' · run not loaded yet' : ' · not started'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p style={{ color: MUTED }}>Every drop-off is recorded.</p>
              )}
              <p style={{ color: MUTED }}>
                If the old main driver&apos;s phone sends a drop-off confirmation later, it is recorded when it was done before the swap,
                within 100 m and with its photo; otherwise it comes to you here to accept or dismiss. Nothing is lost.
                You can also record a drop-off yourself under Complete for the driver.
              </p>
              {preview.pending_late > 0 && (
                <p style={{ color: '#ff7a30' }}>{preview.pending_late === 1 ? '1 late confirmation is' : `${preview.pending_late} late confirmations are`} already waiting for a decision.</p>
              )}
            </>
          )}
        </div>
      </RemarksModal>
    </div>
  )
}
