'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import { Check, Truck } from 'lucide-react'
import type { BookingDetail } from '@/app/types/maps/routemap.types'
import type { Truck as TruckType } from '@/app/types/truck.types'
import { assessFit, type FitAssessment, type VehicleCapacity } from '@/lib/cargo/capacity'
import { EMPTY_CARGO_SUMMARY, type CargoSummary } from '@/lib/cargo/summary'
import type { CodingFlag } from '@/lib/number-coding'

/**
 * The vehicle choice that used to be the client's "Vehicle" booking step.
 *
 * The client no longer picks a vehicle: operations chooses one here, against
 * the load the client recorded. Fit is the same advisory check the client step
 * ran (lib/cargo/capacity) — it flags, it never blocks, and the server repeats
 * it on assignment as `capacity_warning`.
 */

const FALLBACK_IMAGE = '/landingpage/aboutSection/wingvan.png'

/**
 * The load as recorded on the booking.
 *
 * Only the booking-level totals are stored, not the per-group footprints the
 * wizard measured, so the floor-position check has nothing to place and is
 * skipped; weight, volume and the longest item are all still compared.
 */
export function cargoSummaryFromBooking(detail: BookingDetail): CargoSummary {
  const extra = detail as BookingDetail & { required_net_weight_kg?: number | null }
  const gross  = detail.required_weight_kg  ?? 0
  const volume = detail.required_volume_cbm ?? 0
  return {
    ...EMPTY_CARGO_SUMMARY,
    totalPieces:     (detail.booking_cargo_items ?? []).reduce((n, i) => n + (i.quantity ?? 0), 0),
    grossWeightKg:   gross,
    netWeightKg:     extra.required_net_weight_kg ?? 0,
    volumeCbm:       volume,
    densityKgCbm:    volume > 0 ? gross / volume : 0,
    maxDimensionCm:  detail.required_length_cm ?? 0,
    hasNonStackable: detail.non_stackable_cargo === true,
  }
}

function capacityOf(truck: TruckType): VehicleCapacity | null {
  const m = truck.truck_model
  if (!m) return null
  return {
    maxWeightKG:       m.max_weight_kg  ?? 0,
    maxVolumeCBM:      m.max_volume_cbm ?? 0,
    maxLengthCM:       m.max_length_cm  ?? null,
    bedLengthMM:       m.length_mm      ?? null,
    bedWidthMM:        m.width_mm       ?? null,
    bedHeightMM:       m.height_mm      ?? null,
    stackableFriendly: m.stackable_friendly,
  }
}

export default function VehiclePicker({
  trucks,
  selectedId,
  cargo,
  disabled,
  codingOf,
  onSelect,
}: {
  trucks:     TruckType[]
  selectedId: string
  cargo:      CargoSummary
  disabled?:  boolean
  codingOf:   (plate: string | null | undefined) => CodingFlag | null
  onSelect:   (truckId: string) => void
}) {
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] px-4 py-6 text-center">
        <Truck size={20} className="mx-auto mb-2 text-white/30" />
        {/* Vehicles are gated on the Fleet Manager's inspection: only a vehicle
            whose latest BLOWBAGETS check passed is offered. */}
        <p className="text-xs text-white/50">No vehicle has a passing BLOWBAGETS inspection on file.</p>
      </div>
    )
  }

  // Best fits first, so the likely pick is at the top.
  const rows = trucks
    .map((t) => {
      const cap = capacityOf(t)
      return { truck: t, cap, fit: cap ? assessFit(cap, cargo) : null }
    })
    .sort((a, b) => rank(a.fit) - rank(b.fit))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {rows.map(({ truck, cap, fit }) => {
        const selected = truck.truck_id === selectedId
        const coded    = codingOf(truck.plate_number)
        const m        = truck.truck_model
        return (
          <button
            key={truck.truck_id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(selected ? '' : truck.truck_id)}
            aria-pressed={selected}
            className="relative text-left rounded-xl border p-3 transition-colors disabled:opacity-50 bg-black/20 hover:bg-white/[0.03]"
            style={{
              borderColor: selected
                ? 'var(--color-cyan)'
                : fit?.isOverloaded ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.08)',
              boxShadow: selected ? '0 0 0 1px var(--color-cyan) inset' : undefined,
            }}
          >
            {selected && (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center bg-[var(--color-cyan)]">
                <Check size={12} strokeWidth={3} className="text-[var(--color-bg)]" />
              </span>
            )}

            <div className="flex gap-3">
              <div className="relative w-20 h-14 shrink-0">
                <Image
                  src={m?.image_url || FALLBACK_IMAGE}
                  alt={m?.name ?? truck.plate_number}
                  fill
                  sizes="80px"
                  className="object-contain"
                />
              </div>
              <div className="min-w-0 flex-1 pr-5">
                <p className="text-sm font-bold text-white truncate">{truck.plate_number}</p>
                <p className="text-[11px] text-white/55 truncate">
                  {[m?.name ?? truck.model_name, truck.vehicle_type ?? m?.vehicle_type].filter(Boolean).join(' · ') || 'No model on file'}
                </p>
                {truck.assigned_driver && (
                  <p className="text-[10px] text-white/35 truncate">
                    Usual driver: {`${truck.assigned_driver.first_name ?? ''} ${truck.assigned_driver.last_name ?? ''}`.trim()}
                  </p>
                )}
              </div>
            </div>

            {cap && (
              <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                <Cap label="Weight" value={cap.maxWeightKG  > 0 ? `${cap.maxWeightKG.toLocaleString()} KG` : '—'} over={!!fit?.overWeight} />
                <Cap label="Volume" value={cap.maxVolumeCBM > 0 ? `${cap.maxVolumeCBM} CBM` : '—'}               over={!!fit?.overVolume} />
                <Cap label="Length" value={cap.maxLengthCM       ? `${cap.maxLengthCM} CM` : '—'}                 over={!!fit?.overLength} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <FitBadges fit={fit} cargo={cargo} maxLengthCM={cap?.maxLengthCM ?? null} />
              {coded && <Badge tone="amber">Coding day</Badge>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function rank(fit: FitAssessment | null): number {
  if (!fit) return 2
  if (fit.isSuggested) return 0
  if (!fit.isOverloaded) return 1
  return 3
}

function FitBadges({
  fit, cargo, maxLengthCM,
}: { fit: FitAssessment | null; cargo: CargoSummary; maxLengthCM: number | null }) {
  if (!fit) return <Badge tone="muted">No capacity on file</Badge>
  return (
    <>
      {fit.isSuggested && <Badge tone="cyan">Suggested</Badge>}
      {fit.doesNotFit ? (
        <Badge tone="red">
          {fit.overLength
            ? `Item is ${cargo.maxDimensionCm} cm — body takes ${maxLengthCM} cm`
            : 'Item will not fit this body'}
        </Badge>
      ) : (
        <>
          {fit.isOverloaded && <Badge tone="red">Overloaded</Badge>}
          {fit.tripsNeeded > 1 && <Badge tone="muted">{fit.tripsNeeded} trips needed</Badge>}
        </>
      )}
      {fit.stackingMismatch && <Badge tone="amber">Not stackable-friendly</Badge>}
    </>
  )
}

function Cap({ label, value, over }: { label: string; value: string; over: boolean }) {
  return (
    <div
      className="rounded-md border px-1.5 py-1"
      style={{ borderColor: over ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.08)' }}
    >
      <p className={`text-[9px] uppercase tracking-wider ${over ? 'text-red-400' : 'text-white/35'}`}>{label}</p>
      <p className={`text-[11px] font-bold truncate ${over ? 'text-red-400' : 'text-white/80'}`}>{value}</p>
    </div>
  )
}

const TONES = {
  cyan:  { color: 'var(--color-bg)', background: 'var(--color-cyan)', borderColor: 'transparent' },
  red:   { color: '#fca5a5', background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.35)' },
  amber: { color: '#fbbf24', background: 'rgba(246,159,38,0.12)', borderColor: 'rgba(246,159,38,0.35)' },
  muted: { color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.10)' },
} as const

function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className="inline-flex text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border" style={TONES[tone]}>
      {children}
    </span>
  )
}
