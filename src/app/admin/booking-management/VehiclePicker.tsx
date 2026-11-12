'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Check, Truck } from 'lucide-react'
import type { BookingDetail } from '@/app/types/maps/routemap.types'
import type { Truck as TruckType } from '@/app/types/truck.types'
import { assessFit, floorPositions, type FitAssessment, type VehicleCapacity } from '@/lib/cargo/capacity'
import { EMPTY_CARGO_SUMMARY, type CargoSummary } from '@/lib/cargo/summary'
import type { CodingFlag } from '@/lib/number-coding'
import { ProtectedImg } from '@/components/ui/FileViewer'
import Pagination from '@/components/ui/Pagination'

/**
 * The vehicle choice that used to be the client's "Vehicle" booking step.
 *
 * The client no longer picks a vehicle: operations chooses one here, against
 * the load the client recorded. Fit is the same advisory check the client step
 * ran (lib/cargo/capacity) — it flags, it never blocks, and the server repeats
 * it on assignment as `capacity_warning`.
 */

const FALLBACK_IMAGE = '/landingpage/aboutSection/wingvan.png'

/** Cards per page (user 2026-11-13: not every vehicle at once). Two columns on desktop. */
const PAGE_SIZE = 6
const ALL = '__all__'

/** The tab a vehicle sits under: its vehicle type. */
function typeOf(t: TruckType): string {
  return (t.vehicle_type ?? t.truck_model?.vehicle_type ?? '').trim() || 'Other'
}

/**
 * The load as recorded on the booking.
 *
 * The totals come from the booking; the footprints from its cargo lines, so the
 * floor-space and roof checks run here as they do on the server
 * (logistics-backend lib/cargo-capacity). Read the same way it does: a line with
 * no size is skipped, every item may be turned onto another face (no per-line
 * tilt flag is stored), and nothing double-decks on a booking marked non-stackable.
 */
export function cargoSummaryFromBooking(detail: BookingDetail): CargoSummary {
  const extra = detail as BookingDetail & { required_net_weight_kg?: number | null }
  const gross  = detail.required_weight_kg  ?? 0
  const volume = detail.required_volume_cbm ?? 0
  const stackable = detail.non_stackable_cargo !== true
  const footprints = (detail.booking_cargo_items ?? []).flatMap((i) => {
    const count = i.quantity ?? 0
    if (!i.length_cm || !i.width_cm || !i.height_cm || count <= 0) return []
    return [{
      lengthCm: Number(i.length_cm), widthCm: Number(i.width_cm), heightCm: Number(i.height_cm),
      count, stackable, tiltable: true,
    }]
  })
  return {
    ...EMPTY_CARGO_SUMMARY,
    footprints,
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

/**
 * Why this vehicle may not take the load, one sentence each, for the assign
 * confirmation. Empty when it fits or there is no capacity on file to judge by.
 * The stacking note is left out: it is a caution, not a reason the load won't go.
 */
export function fitProblems(truck: TruckType, cargo: CargoSummary): string[] {
  const cap = capacityOf(truck)
  if (!cap) return []
  const fit = assessFit(cap, cargo)
  const problems: string[] = []
  if (fit.overLength) {
    problems.push(`Longest item is ${cargo.maxDimensionCm} cm; the body takes ${cap.maxLengthCM} cm.`)
  } else if (fit.doesNotFit) {
    const item = cap.bedLengthMM && cap.bedWidthMM
      ? cargo.footprints.find((f) => floorPositions(cap.bedLengthMM!, cap.bedWidthMM!, f, cap.bedHeightMM) === 0)
      : undefined
    problems.push(item
      ? `An item of ${item.lengthCm}x${item.widthCm}x${item.heightCm} cm does not fit inside this body in any position.`
      : 'An item will not fit inside this body in any position.')
  }
  if (fit.overWeight) {
    problems.push(`Load is ${cargo.grossWeightKg.toLocaleString()} kg; this vehicle carries ${cap.maxWeightKG.toLocaleString()} kg.`)
  }
  if (fit.overVolume) {
    problems.push(`Load is ${cargo.volumeCbm} CBM; usable capacity is ${fit.usableVolumeCBM.toFixed(1)} CBM.`)
  }
  if (fit.overFloorSpace) {
    problems.push(`Cargo needs ${fit.positionsNeeded} floor positions; the bed holds ${fit.positionsAvailable}.`)
  }
  return problems
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
  const [tab, setTab]   = useState<string>(ALL)
  const [page, setPage] = useState(1)

  // Best fits first, so the likely pick is at the top.
  const rows = useMemo(() => trucks
    .map((t) => {
      const cap = capacityOf(t)
      return { truck: t, cap, fit: cap ? assessFit(cap, cargo) : null }
    })
    .sort((a, b) => rank(a.fit) - rank(b.fit) || a.truck.plate_number.localeCompare(b.truck.plate_number)),
  [trucks, cargo])

  // One tab per vehicle type, alphabetical, with how many of each.
  const tabs = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(typeOf(r.truck), (counts.get(typeOf(r.truck)) ?? 0) + 1)
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

  // A tab that no longer has vehicles (the list changed) reads as All.
  const activeTab  = tab !== ALL && tabs.some(([t]) => t === tab) ? tab : ALL
  const inTab      = activeTab === ALL ? rows : rows.filter((r) => typeOf(r.truck) === activeTab)
  const totalPages = Math.max(1, Math.ceil(inTab.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = inTab.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const selectedRow = rows.find((r) => r.truck.truck_id === selectedId) ?? null
  const selectedOffPage = !!selectedRow && !pageRows.includes(selectedRow)

  const chooseTab = (t: string) => { setTab(t); setPage(1) }

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

  return (
    <div className="space-y-2.5">
      {/* Vehicle type tabs. Scroll sideways on a phone instead of wrapping. */}
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Vehicle type" className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
          {[[ALL, rows.length] as [string, number], ...tabs].map(([t, n]) => {
            const active = t === activeTab
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => chooseTab(t)}
                className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-bold transition-colors disabled:opacity-50"
                style={active
                  ? { background: 'rgba(77,249,237,0.14)', borderColor: 'rgba(77,249,237,0.45)', color: 'var(--color-cyan)' }
                  : { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.55)' }}
              >
                {t === ALL ? 'All' : t} <span className="opacity-60 tabular-nums">{n}</span>
              </button>
            )
          })}
        </div>
      )}

      {selectedOffPage && selectedRow && (
        <p className="text-[11px] text-white/50">
          Selected: <span className="font-bold text-white/80">{selectedRow.truck.plate_number}</span>
          {' '}({typeOf(selectedRow.truck)})
        </p>
      )}

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {pageRows.map(({ truck, cap, fit }) => {
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
                : fit?.isOverloaded ? 'rgba(246,38,38,0.35)' : 'rgba(255,255,255,0.08)',
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
                {/* A stored model picture loads through a pass (lib/files/fileAccess). */}
                <ProtectedImg
                  src={m?.image_url || FALLBACK_IMAGE}
                  alt={m?.name ?? truck.plate_number}
                  className="absolute inset-0 h-full w-full object-contain"
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

      {inTab.length > PAGE_SIZE && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={inTab.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          disabled={disabled}
          bar={false}
          jump={false}
        />
      )}
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
      style={{ borderColor: over ? 'rgba(246,38,38,0.45)' : 'rgba(255,255,255,0.08)' }}
    >
      <p className={`text-[9px] uppercase tracking-wider ${over ? 'text-red-400' : 'text-white/35'}`}>{label}</p>
      <p className={`text-[11px] font-bold truncate ${over ? 'text-red-400' : 'text-white/80'}`}>{value}</p>
    </div>
  )
}

const TONES = {
  cyan:  { color: 'var(--color-bg)', background: 'var(--color-cyan)', borderColor: 'transparent' },
  red:   { color: '#f62626', background: 'rgba(246,38,38,0.12)', borderColor: 'rgba(246,38,38,0.35)' },
  amber: { color: '#ffea00', background: 'rgba(255,122,48,0.12)', borderColor: 'rgba(255,122,48,0.35)' },
  muted: { color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.10)' },
} as const

function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className="inline-flex text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border" style={TONES[tone]}>
      {children}
    </span>
  )
}
