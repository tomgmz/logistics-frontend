'use client'

/**
 * Delivery Stops as Booking Management's design draws it (Figma "delivery
 * stops", 2026-11-14): one card with "Pick up point" (pending / picked up /
 * failed, "Trip 1 of 2", the proof of pickup) and "Drop-off Point(s)" (pending /
 * delivered / failed, each with its proof of delivery).
 *
 * The pickup is per run: a booking split into trips loads at the same pickup
 * once per run, so the card shows the run in progress (or the next one to load).
 */

import { useEffect, useState, type ReactNode } from 'react'

import { tripService, type Trip } from '@/lib/services/admin/trip.service'
import { cachedFetch } from '@/lib/query/useApiQuery'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { usePanelSection } from '@/components/ui/PanelReady'
import { FileViewButton, ProtectedImg } from '@/components/ui/FileViewer'
import { formatPhDateTime } from '@/lib/office-hours'
import { PALETTE } from '@/lib/palette'
import { CARD_CLASS, MUTED, Tag } from './BookingDetailParts'

const PICKUP_STATUSES = [
  { key: 'pending',   label: 'Pending',   color: PALETTE.yellow },
  { key: 'picked_up', label: 'Picked up', color: PALETTE.green },
  { key: 'failed',    label: 'Failed',    color: PALETTE.red },
] as const
const DROP_STATUSES = [
  { key: 'pending',   label: 'Pending',   color: PALETTE.yellow },
  { key: 'delivered', label: 'Delivered', color: PALETTE.green },
  { key: 'failed',    label: 'Failed',    color: PALETTE.red },
] as const

/** Trips exist once a vehicle is on the booking. */
const HAS_TRIPS = ['assigned', 'in_transit', 'delivered', 'completed', 'failed']

export interface DeliveryStop {
  destination_id:   string
  address:          string
  status:           string
  proof_photo_url?: string | null
  proof_at?:        string | null
  delivered_at?:    string | null
}

function when(at: string | null | undefined): string {
  if (!at) return 'Photo on file'
  try { return formatPhDateTime(at) } catch { return at }
}

/** The dark row with the photo thumbnail: "Proof of pick up", date and time. */
export function ProofRow({ url, at, label }: { url: string; at?: string | null; label: string }) {
  return (
    <FileViewButton
      url={url}
      name={label}
      title={`${label} — open full size`}
      className="w-full flex items-center gap-4 rounded-[8px] bg-[#141414] p-2.5 text-left group"
    >
      <ProtectedImg src={url} alt={label} className="h-[46px] w-[46px] shrink-0 rounded-[4px] object-cover bg-[#d9d9d9]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-white [@media(hover:hover)]:group-hover:text-[#4DF9ED] transition-colors">{label}</span>
        <span className="block text-xs font-bold" style={{ color: MUTED }}>{when(at)}</span>
      </span>
    </FileViewButton>
  )
}

function PointBox({ address, bright, statuses, current, right, children }: {
  address: string
  bright:  boolean
  statuses: ReadonlyArray<{ key: string; label: string; color: string }>
  current: string
  right?:  ReactNode
  children?: ReactNode
}) {
  return (
    <div className="rounded-[10px] border border-[#818181]/70 bg-[#2a2828] px-3 pt-2.5 pb-3 flex flex-col gap-2.5">
      <p className="text-sm font-bold leading-snug break-words" style={{ color: bright ? '#ffffff' : MUTED }}>{address || '—'}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {statuses.map((s) => (
          <Tag key={s.key} color={current === s.key ? s.color : null}>{s.label}</Tag>
        ))}
        {right && <span className="ml-auto text-sm font-bold text-white whitespace-nowrap">{right}</span>}
      </div>
      {children}
    </div>
  )
}

export default function DeliveryStopsCard({ bookingId, status, origin, stops, pickupProofUrl, pickupProofAt }: {
  bookingId: string
  /** Normalised booking status. */
  status:    string
  origin:    string
  stops:     DeliveryStop[]
  /** The booking-level proof (older single-run bookings). */
  pickupProofUrl?: string | null
  pickupProofAt?:  string | null
}) {
  const wantTrips = HAS_TRIPS.includes(status)
  const [trips, setTrips]   = useState<Trip[] | null>(null)
  usePanelSection(wantTrips && trips === null)

  useEffect(() => {
    if (!wantTrips) return
    let cancelled = false
    cachedFetch(['booking', bookingId, 'trips'], () => tripService.getTrips(bookingId), (t) => setTrips(t ?? []))
      .then((t) => { if (!cancelled) setTrips(t ?? []) })
      .catch(() => { if (!cancelled) setTrips([]) })
    return () => { cancelled = true }
  }, [bookingId, wantTrips, status])
  useLiveTable(['live:bookings'], () => {
    if (!wantTrips) return
    tripService.getTrips(bookingId).then(setTrips).catch(() => {})
  }, { enabled: wantTrips, debounceMs: 1000 })

  const runs = [...(trips ?? [])].filter((t) => t.status !== 'cancelled').sort((a, b) => a.trip_number - b.trip_number)
  // The run in progress, else the next one to load, else the last one.
  const active = runs.find((t) => t.status === 'in_transit')
    ?? runs.find((t) => t.status === 'pending')
    ?? runs[runs.length - 1]
    ?? null
  const loaded = runs.filter((t) => t.status === 'in_transit' || t.status === 'completed')
  const anyLoaded = loaded.length > 0 || !!pickupProofUrl

  const pickupStatus =
    active && active.status === 'pending'
      ? (status === 'failed' && !anyLoaded ? 'failed' : 'pending')
      : active
        ? 'picked_up'
        : status === 'failed' && !anyLoaded ? 'failed'
        : anyLoaded ? 'picked_up' : 'pending'

  // Newest loading photo: the run in progress or the last one loaded.
  const proofRun = [...loaded].reverse().find((t) => t.pickup_proof_photo_url) ?? null
  const proofUrl = proofRun?.pickup_proof_photo_url ?? pickupProofUrl ?? null
  const proofAt  = proofRun?.pickup_proof_at ?? pickupProofAt ?? null
  const multi = runs.length > 1

  return (
    <div className={`${CARD_CLASS} px-3.5 sm:px-4 pt-3 pb-4 flex flex-col gap-3`}>
      <h4 className="text-sm font-bold" style={{ color: PALETTE.cyan }}>Pick up point</h4>
      <PointBox
        address={origin}
        bright
        statuses={PICKUP_STATUSES}
        current={pickupStatus}
        right={multi && active ? `Trip ${active.trip_number} of ${runs.length}` : null}
      >
        {proofUrl && (
          <ProofRow url={proofUrl} at={proofAt}
            label={multi && proofRun ? `Proof of pick up (trip ${proofRun.trip_number})` : 'Proof of pick up'} />
        )}
      </PointBox>

      <h4 className="text-sm font-bold mt-1" style={{ color: PALETTE.cyan }}>Drop-off Point(s)</h4>
      {stops.length === 0 ? (
        <p className="text-sm text-white/40">No stops on this booking.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {stops.map((s) => (
            <li key={s.destination_id}>
              <PointBox
                address={s.address}
                bright={s.status === 'delivered'}
                statuses={DROP_STATUSES}
                current={s.status}
              >
                {s.proof_photo_url
                  ? <ProofRow url={s.proof_photo_url} at={s.proof_at ?? s.delivered_at} label="Proof of delivery" />
                  : s.status === 'delivered' && <p className="text-xs font-bold text-white/30">No proof photo on file.</p>}
              </PointBox>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
