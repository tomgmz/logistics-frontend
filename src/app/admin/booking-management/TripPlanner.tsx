'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Check,
  Divide,
  Lock,
  Minus,
  Plus,
  Repeat,
  Trash2,
  TriangleAlert,
} from 'lucide-react'

import {
  tripService,
  isStartedTrip,
  type Trip,
  type TripPlanEntry,
} from '@/lib/services/admin/trip.service'
import type { BookingDetail } from '@/app/types/maps/routemap.types'
import { appToast } from '@/lib/toast'
import { formatArrivalClock, formatArrivalWindow } from '@/lib/arrival-window'
import { getApiErrorMessage } from '@/lib/api-error'
import { STOWAGE_FACTOR } from '@/lib/cargo/capacity'

/**
 * How many runs the assigned vehicle makes, which drop-offs each serves, and
 * how much of each cargo line goes on each.
 *
 * This is the operations half of the shuttle model. When a booking's cargo is
 * larger than the truck body the answer is NOT a second vehicle — it is the same
 * truck going back and forth. Operations splits the goods here ("10 of the 20
 * cartons for drop-off 1 now, the other 10 with drop-offs 2 and 3 on the next
 * run"); the driver can load more or less at the pickup and the server moves the
 * difference onto the following runs.
 *
 * Rules, mirroring the server (trip-cargo.ts):
 *   * every cargo line adds up exactly to its booked quantity over all runs,
 *   * every run carries something, and every drop-off is on at least one run,
 *   * a line with no booked quantity is one piece and goes whole on one run.
 *
 * Runs already loaded or finished are history: shown, counted, never changed.
 * The runs still to come can be re-planned at any time before they are loaded.
 */

const MAX_TRIPS = 10
const EPS = 1e-9

/** The assigned vehicle's limits, when known — for the per-trip warning. */
export interface TripCapacity {
  maxWeightKg:  number
  maxVolumeCbm: number
}

interface Props {
  detail: BookingDetail
  /** Whether this viewer may change the plan at all (RBAC edit right). */
  canEdit: boolean
  capacity?: TripCapacity | null
}

/** One cargo line as the planner works with it. */
interface Line {
  itemId:        string
  destinationId: string
  label:         string
  unit:          string
  /** Booked quantity; a line with none is one indivisible piece. */
  total:         number
  divisible:     boolean
  weightKg:      number
  volumeCbm:     number
}

interface Draft {
  /** Local key; the server assigns real trip ids on save. */
  key:            string
  destinationIds: string[]
  /** item id → quantity on this run. */
  qty:            Record<string, number>
}

const fmtNum = (n: number, digits = 2) =>
  n === 0 ? '0' : n.toLocaleString('en-PH', { maximumFractionDigits: digits })

function linesOf(detail: BookingDetail): Line[] {
  return (detail.booking_cargo_items ?? []).flatMap((item) => {
    const destinationId = item.destination_id
    if (!destinationId) return []
    const q = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : null
    return [{
      itemId:    item.item_id,
      destinationId,
      label:     item.products?.name || item.product_text || item.commodities?.name || item.commodity_text || 'Cargo',
      unit:      item.products?.unit || (q ? 'pcs' : 'lot'),
      total:     q ?? 1,
      divisible: q != null,
      // Stored per LINE (the wizard sends the group's totals), so a share of the
      // line carries the same share of its weight — never weight × quantity.
      weightKg:  item.weight_kg  ?? 0,
      volumeCbm: item.volume_cbm ?? 0,
    }]
  })
}

/** What a run carries of each line: loaded once loaded, else planned. */
function tripQty(trip: Trip): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of trip.booking_trip_stops ?? []) {
    for (const c of s.booking_trip_cargo ?? []) {
      out.set(c.item_id, (out.get(c.item_id) ?? 0) + Number(c.loaded_qty ?? c.planned_qty))
    }
  }
  return out
}

function loadOf(lines: Line[], qty: (itemId: string) => number) {
  let weightKg = 0, volumeCbm = 0
  for (const l of lines) {
    const share = qty(l.itemId) / l.total
    weightKg  += l.weightKg  * share
    volumeCbm += l.volumeCbm * share
  }
  return { weightKg, volumeCbm }
}

export default function TripPlanner({ detail, canEdit, capacity }: Props) {
  const bookingId = detail.booking_id

  const [trips, setTrips]     = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts]   = useState<Draft[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const destinations = useMemo(
    () => (detail.booking_destinations ?? []).slice().sort((a, b) => a.sequence_order - b.sequence_order),
    [detail.booking_destinations],
  )
  const destNo = useMemo(
    () => new Map(destinations.map((d, i) => [d.destination_id, i + 1])),
    [destinations],
  )
  const lines = useMemo(() => linesOf(detail), [detail])
  const linesFor = useCallback(
    (destinationId: string) => lines.filter((l) => l.destinationId === destinationId),
    [lines],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setTrips(await tripService.getTrips(bookingId))
      setLoadError(null)
    } catch (e) {
      setLoadError(getApiErrorMessage(e, 'The trip plan could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => { void refresh() }, [refresh])

  const active  = useMemo(
    () => trips.filter((t) => t.status !== 'cancelled').sort((a, b) => a.trip_number - b.trip_number),
    [trips],
  )
  const started = active.filter(isStartedTrip)
  const pending = active.filter((t) => !isStartedTrip(t))
  const canPlan = canEdit && (pending.length > 0 || started.length === 0)

  /** Of each line, how much the loaded/finished runs took. */
  const takenByStarted = useMemo(() => {
    const out = new Map<string, number>()
    for (const t of started) for (const [id, q] of tripQty(t)) out.set(id, (out.get(id) ?? 0) + q)
    return out
  }, [started])

  /* ── Editing ──────────────────────────────────────────────────────────── */

  const beginEdit = () => {
    let next: Draft[]
    if (pending.length > 0) {
      next = pending.map((t, i) => {
        const stops = (t.booking_trip_stops ?? []).slice().sort((a, b) => a.sequence_order - b.sequence_order)
        const qty: Record<string, number> = {}
        for (const s of stops) for (const c of s.booking_trip_cargo ?? []) qty[c.item_id] = Number(c.planned_qty)
        return { key: `t${i}`, destinationIds: stops.map((s) => s.destination_id), qty }
      })
      // A plan from before quantities existed: give each line's remainder to the
      // first run that serves its drop-off, which is what that plan meant.
      const planned = new Set(next.flatMap((d) => Object.keys(d.qty)))
      for (const l of lines) {
        if (planned.has(l.itemId)) continue
        const left = l.total - (takenByStarted.get(l.itemId) ?? 0)
        const host = next.find((d) => d.destinationIds.includes(l.destinationId))
        if (host && left > EPS) host.qty[l.itemId] = left
      }
    } else {
      const qty: Record<string, number> = {}
      for (const l of lines) {
        const left = l.total - (takenByStarted.get(l.itemId) ?? 0)
        if (left > EPS) qty[l.itemId] = left
      }
      const ids = started.length === 0
        ? destinations.map((d) => d.destination_id)
        : [...new Set(lines.filter((l) => (qty[l.itemId] ?? 0) > 0).map((l) => l.destinationId))]
      next = [{ key: 't0', destinationIds: ids, qty }]
    }
    setDrafts(next)
    setEditing(true)
  }

  const allocated = (itemId: string, except?: string) =>
    (takenByStarted.get(itemId) ?? 0) +
    drafts.reduce((n, d) => n + (d.key === except ? 0 : d.qty[itemId] ?? 0), 0)

  const unallocated = (l: Line) => l.total - allocated(l.itemId)

  const setQty = (draftKey: string, line: Line, value: number) => {
    setDrafts((prev) => prev.map((d) => {
      if (d.key !== draftKey) return d
      const others = (takenByStarted.get(line.itemId) ?? 0) +
        prev.reduce((n, x) => n + (x.key === draftKey ? 0 : x.qty[line.itemId] ?? 0), 0)
      const max = Math.max(0, line.total - others)
      const v   = Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0))
      return { ...d, qty: { ...d.qty, [line.itemId]: line.divisible ? v : (v >= 1 ? 1 : 0) } }
    }))
  }

  const toggleStop = (draftKey: string, destinationId: string) => {
    setDrafts((prev) => prev.map((d) => {
      if (d.key !== draftKey) return d
      if (d.destinationIds.includes(destinationId)) {
        const qty = { ...d.qty }
        for (const l of linesFor(destinationId)) delete qty[l.itemId]
        return { ...d, destinationIds: d.destinationIds.filter((id) => id !== destinationId), qty }
      }
      // Turning a drop-off on brings whatever of it is still unplanned.
      const qty = { ...d.qty }
      for (const l of linesFor(destinationId)) {
        const others = (takenByStarted.get(l.itemId) ?? 0) +
          prev.reduce((n, x) => n + (x.key === draftKey ? 0 : x.qty[l.itemId] ?? 0), 0)
        const left = l.total - others
        if (left > EPS) qty[l.itemId] = left
      }
      return { ...d, destinationIds: [...d.destinationIds, destinationId], qty }
    }))
  }

  /** "All remaining": this run takes whatever of the drop-off is not on any run. */
  const takeRemaining = (draftKey: string, destinationId: string) => {
    for (const l of linesFor(destinationId)) {
      const mine = drafts.find((d) => d.key === draftKey)?.qty[l.itemId] ?? 0
      setQty(draftKey, l, mine + Math.max(0, unallocated(l)))
    }
  }

  /** Every line shared out evenly over the runs still to come. */
  const splitEvenly = () => {
    setDrafts((prev) => {
      const n = prev.length
      const next = prev.map((d) => ({ ...d, qty: {} as Record<string, number>, destinationIds: [] as string[] }))
      for (const l of lines) {
        const left = l.total - (takenByStarted.get(l.itemId) ?? 0)
        if (left <= EPS) continue
        if (!l.divisible || !Number.isInteger(left)) {
          if (!l.divisible) { next[0].qty[l.itemId] = left; continue }
          const share = left / n
          next.forEach((d) => { d.qty[l.itemId] = share })
          continue
        }
        const base = Math.floor(left / n)
        let extra  = left - base * n
        next.forEach((d) => {
          const q = base + (extra > 0 ? 1 : 0)
          if (extra > 0) extra--
          if (q > 0) d.qty[l.itemId] = q
        })
      }
      for (const d of next) {
        d.destinationIds = destinations
          .map((x) => x.destination_id)
          .filter((id) => linesFor(id).some((l) => (d.qty[l.itemId] ?? 0) > 0) ||
            (linesFor(id).length === 0 && d === next[0]))
      }
      return next
    })
  }

  const addTrip = () => {
    setDrafts((prev) =>
      started.length + prev.length >= MAX_TRIPS
        ? prev
        // A new run starts EMPTY: pre-filling it would plan goods twice.
        : [...prev, { key: `t${Date.now()}`, destinationIds: [], qty: {} }],
    )
  }

  const removeTrip = (key: string) =>
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)))

  /* ── Validation, mirroring the server ─────────────────────────────────── */

  const servedIds = new Set([
    ...started.flatMap((t) => (t.booking_trip_stops ?? []).map((s) => s.destination_id)),
    ...drafts.flatMap((d) => d.destinationIds),
  ])
  const unserved     = destinations.filter((d) => !servedIds.has(d.destination_id))
  const emptyTrips   = drafts.filter((d) => d.destinationIds.length === 0)
  const emptyStops   = drafts.flatMap((d, i) => d.destinationIds
    .filter((id) => linesFor(id).length > 0 && !linesFor(id).some((l) => (d.qty[l.itemId] ?? 0) > EPS))
    .map((id) => ({ trip: started.length + i + 1, id })))
  const offLines     = lines.filter((l) => Math.abs(unallocated(l)) > EPS)
  const valid        = drafts.length > 0 && emptyTrips.length === 0 && emptyStops.length === 0 &&
                       unserved.length === 0 && offLines.length === 0

  const save = async () => {
    if (!valid) return
    setSaving(true)
    try {
      const plan: TripPlanEntry[] = drafts.map((d, i) => ({
        trip_number:     started.length + i + 1,
        destination_ids: d.destinationIds,
        stops: d.destinationIds.map((destination_id) => ({
          destination_id,
          items: linesFor(destination_id)
            .filter((l) => (d.qty[l.itemId] ?? 0) > EPS)
            .map((l) => ({ item_id: l.itemId, quantity: d.qty[l.itemId] })),
        })),
      }))
      setTrips(await tripService.setTripPlan(bookingId, plan))
      setEditing(false)
      const totalRuns = started.length + plan.length
      appToast.success(
        totalRuns === 1 ? 'Planned as a single trip.' : `Planned as ${totalRuns} trips of the assigned vehicle.`,
        { action: 'trip-plan', entityId: bookingId },
      )
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'The trip plan could not be saved.'), {
        action: 'trip-plan', entityId: bookingId,
      })
    } finally {
      setSaving(false)
    }
  }

  const overCapacity = (load: { weightKg: number; volumeCbm: number }) => {
    if (!capacity) return null
    const usable = capacity.maxVolumeCbm * STOWAGE_FACTOR
    if (capacity.maxWeightKg > 0 && load.weightKg > capacity.maxWeightKg + EPS) {
      return `Over the vehicle's ${fmtNum(capacity.maxWeightKg)} kg limit`
    }
    if (usable > 0 && load.volumeCbm > usable + EPS) {
      return `Over the vehicle's usable ${fmtNum(usable, 2)} CBM`
    }
    return null
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <div className="rounded-xl border border-white/[0.08] p-3 space-y-3 bg-black/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Repeat size={14} className="text-[var(--color-cyan)] shrink-0" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 truncate">
            Trips of the assigned vehicle
          </h3>
        </div>

        {!editing && canPlan && !loading && !loadError && (
          <button
            type="button"
            onClick={beginEdit}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-white/10
                       text-white/50 hover:text-white hover:border-white/25 transition-colors shrink-0"
          >
            {active.length > 1 ? 'Edit plan' : 'Split into trips'}
          </button>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-white/35">
        One vehicle, one or more runs. When the load is bigger than the body the same truck returns
        to the pickup point and goes out again with the rest — it is never crewed with a second vehicle.
      </p>

      {loading ? (
        <p className="text-sm text-white/40">Loading the trip plan…</p>
      ) : loadError ? (
        <div className="flex items-start gap-2 text-[12px] text-amber-300/90">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      ) : editing ? (
        <>
          {started.length > 0 && (
            <div className="flex items-start gap-2 text-[11px] text-white/40">
              <Lock size={12} className="mt-0.5 shrink-0" />
              <span>
                Trip{started.length > 1 ? 's' : ''} {started.map((t) => t.trip_number).join(', ')}{' '}
                {started.length > 1 ? 'are' : 'is'} already loaded and stay{started.length > 1 ? '' : 's'} as{' '}
                {started.length > 1 ? 'they are' : 'it is'}. You are planning the rest.
              </span>
            </div>
          )}

          <div className="space-y-2">
            {drafts.map((draft, i) => {
              const tripNo  = started.length + i + 1
              const isEmpty = draft.destinationIds.length === 0
              const load    = loadOf(lines, (id) => draft.qty[id] ?? 0)
              const over    = overCapacity(load)

              return (
                <div
                  key={draft.key}
                  className="rounded-lg border p-2.5 space-y-2 bg-black/25"
                  style={{ borderColor: isEmpty || over ? 'rgba(246,38,38,0.35)' : 'rgba(255,255,255,0.08)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                      Trip {tripNo}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      {(load.weightKg > 0 || load.volumeCbm > 0) && (
                        <span className="text-[10px] text-white/35 truncate">
                          {load.weightKg  > 0 ? `${fmtNum(load.weightKg)} kg`   : ''}
                          {load.weightKg  > 0 && load.volumeCbm > 0 ? ' · ' : ''}
                          {load.volumeCbm > 0 ? `${fmtNum(load.volumeCbm, 4)} CBM` : ''}
                        </span>
                      )}
                      {drafts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTrip(draft.key)}
                          disabled={saving}
                          aria-label={`Remove trip ${tripNo}`}
                          className="p-1 rounded-md text-white/30 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {over && (
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-300/90">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {over} — move some to another trip.
                    </p>
                  )}

                  {/* Which drop-offs this run goes to. */}
                  <div className="flex flex-wrap gap-1.5">
                    {destinations.map((dest) => {
                      const on = draft.destinationIds.includes(dest.destination_id)
                      return (
                        <button
                          key={dest.destination_id}
                          type="button"
                          disabled={saving}
                          onClick={() => toggleStop(draft.key, dest.destination_id)}
                          aria-pressed={on}
                          title={dest.address}
                          className="text-left text-[11px] font-semibold px-2 py-1.5 rounded-md border
                                     transition-colors disabled:opacity-40 max-w-full"
                          style={on
                            ? { borderColor: 'var(--color-cyan)', color: 'var(--color-cyan)', background: 'rgba(77,249,237,0.10)' }
                            : { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.35)' }}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {on && <Check size={11} className="shrink-0" />}
                            <span className="truncate max-w-[180px]">
                              Drop-off {destNo.get(dest.destination_id)} — {dest.address}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* How much of each line goes on this run, per drop-off. */}
                  {draft.destinationIds
                    .slice()
                    .sort((a, b) => (destNo.get(a) ?? 0) - (destNo.get(b) ?? 0))
                    .map((destId) => {
                      const destLines = linesFor(destId)
                      const hasLeft   = destLines.some((l) => unallocated(l) > EPS)
                      return (
                        <div key={destId} className="rounded-md border border-white/[0.06] p-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-white/60">Drop-off {destNo.get(destId)}</span>
                            {hasLeft && (
                              <button
                                type="button"
                                onClick={() => takeRemaining(draft.key, destId)}
                                disabled={saving}
                                className="text-[10px] font-bold px-2 py-0.5 rounded border border-white/10
                                           text-white/50 hover:text-white transition-colors disabled:opacity-40"
                              >
                                All remaining
                              </button>
                            )}
                          </div>
                          {destLines.length === 0 ? (
                            <p className="text-[11px] text-white/30">No cargo listed for this drop-off.</p>
                          ) : destLines.map((l) => (
                            <QtyRow
                              key={l.itemId}
                              line={l}
                              value={draft.qty[l.itemId] ?? 0}
                              max={(draft.qty[l.itemId] ?? 0) + Math.max(0, unallocated(l))}
                              disabled={saving}
                              onChange={(v) => setQty(draft.key, l, v)}
                            />
                          ))}
                        </div>
                      )
                    })}

                  {isEmpty && (
                    <p className="text-[11px] text-red-300/80">
                      A trip with no drop-off is a run to nowhere. Pick at least one.
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {started.length + drafts.length < MAX_TRIPS && (
              <button
                type="button"
                onClick={addTrip}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed
                           border-white/15 text-[11px] font-bold text-white/45
                           hover:text-white hover:border-white/30 transition-colors disabled:opacity-40"
              >
                <Plus size={13} /> Add another trip
              </button>
            )}
            {drafts.length > 1 && (
              <button
                type="button"
                onClick={splitEvenly}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed
                           border-white/15 text-[11px] font-bold text-white/45
                           hover:text-white hover:border-white/30 transition-colors disabled:opacity-40"
              >
                <Divide size={13} /> Split evenly across {drafts.length} trips
              </button>
            )}
          </div>

          {/* Still to plan, or planned twice, per line. */}
          {offLines.length > 0 && (
            <div className="rounded-md border border-red-400/25 p-2 space-y-1">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-red-300/90">
                <AlertTriangle size={12} className="shrink-0" /> Not adding up yet
              </p>
              {offLines.map((l) => {
                const left = unallocated(l)
                return (
                  <p key={l.itemId} className="text-[11px] text-red-300/80">
                    Drop-off {destNo.get(l.destinationId)} · {l.label}:{' '}
                    {left > 0
                      ? `${fmtNum(left, 3)} of ${fmtNum(l.total, 3)} ${l.unit} not on any trip`
                      : `${fmtNum(-left, 3)} ${l.unit} more than booked`}
                  </p>
                )
              })}
            </div>
          )}

          {emptyStops.length > 0 && (
            <p className="text-[11px] text-red-300/80">
              {emptyStops.map((s) => `Trip ${s.trip} goes to drop-off ${destNo.get(s.id)} with nothing for it`).join('; ')}.
            </p>
          )}

          {unserved.length > 0 && (
            <div className="flex items-start gap-2 text-[11px] text-red-300/85">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                {unserved.length} drop-off{unserved.length > 1 ? 's are' : ' is'} not on any trip —
                nobody would ever be sent{unserved.length > 1 ? ' to them' : ' to it'}:{' '}
                {unserved.map((d) => d.address).join('; ')}
              </span>
            </div>
          )}

          <p className="text-[11px] text-white/30">
            The driver can load more or less at the pickup; whatever is left goes on the next trip
            automatically, and a drop-off is only delivered once every trip bound for it has unloaded.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="flex-1 py-2 rounded-lg border border-white/10 text-[12px] font-bold
                         text-white/50 hover:text-white hover:border-white/25 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !valid}
              className="flex-1 py-2 rounded-lg text-[12px] font-bold transition-colors disabled:opacity-40"
              style={{ background: 'rgba(77,249,237,0.14)', color: 'var(--color-cyan)' }}
            >
              {saving ? 'Saving…' : `Save plan (${started.length + drafts.length} trip${started.length + drafts.length > 1 ? 's' : ''})`}
            </button>
          </div>
        </>
      ) : (
        <>
          {started.length > 0 && pending.length > 0 && (
            <div className="flex items-start gap-2 text-[11px] text-white/40">
              <Lock size={12} className="mt-0.5 shrink-0" />
              <span>Loaded trips stay as they are. The trips not loaded yet can still be re-planned.</span>
            </div>
          )}

          <ul className="space-y-2">
            {active.map((trip) => {
              const load = loadOf(lines, (id) => tripQty(trip).get(id) ?? 0)
              return (
                <li key={trip.trip_id} className="rounded-lg border border-white/[0.08] p-2.5 space-y-2 bg-black/25">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                      Trip {trip.trip_number}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      {(load.weightKg > 0 || load.volumeCbm > 0) && (
                        <span className="text-[10px] text-white/35 truncate">
                          {load.weightKg  > 0 ? `${fmtNum(load.weightKg)} kg`   : ''}
                          {load.weightKg  > 0 && load.volumeCbm > 0 ? ' · ' : ''}
                          {load.volumeCbm > 0 ? `${fmtNum(load.volumeCbm, 4)} CBM` : ''}
                        </span>
                      )}
                      <TripStatusPill status={trip.status} />
                    </div>
                  </div>

                  {/* Planned by the server from predicted traffic plus unloading and
                      reloading allowances, chained run to run. */}
                  {trip.planned_departure_at && (
                    <p className="text-[11px] text-white/40">
                      {trip.pickup_proof_at ? 'Left' : 'Leaves'} {formatArrivalClock(trip.planned_departure_at)}
                      {trip.planned_return_at && <> · back ~{formatArrivalClock(trip.planned_return_at)}</>}
                    </p>
                  )}

                  <ul className="space-y-1.5">
                    {(trip.booking_trip_stops ?? [])
                      .slice()
                      .sort((a, b) => a.sequence_order - b.sequence_order)
                      .map((stop) => (
                        <li key={stop.trip_stop_id} className="space-y-0.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[12px] text-white/70 leading-snug min-w-0 break-words">
                              Drop-off {destNo.get(stop.destination_id) ?? ''} — {stop.booking_destinations?.address ?? '—'}
                              {stop.status === 'pending' && stop.planned_arrival_at && (
                                <span className="block text-[11px] text-white/35">
                                  Planned {formatArrivalWindow(stop.planned_arrival_at)}
                                </span>
                              )}
                            </span>
                            <span
                              className="shrink-0 text-[10px] font-bold uppercase"
                              style={{
                                color: stop.status === 'delivered' ? 'var(--color-cyan)'
                                     : stop.status === 'failed'    ? '#f62626'
                                     : 'rgba(255,255,255,0.3)',
                              }}
                            >
                              {stop.status}
                            </span>
                          </div>
                          {(stop.booking_trip_cargo ?? []).map((c) => {
                            const line = lines.find((l) => l.itemId === c.item_id)
                            const planned = Number(c.planned_qty)
                            const loadedQ = c.loaded_qty == null ? null : Number(c.loaded_qty)
                            return (
                              <p key={c.trip_cargo_id} className="text-[11px] text-white/45 pl-2">
                                {line?.label ?? 'Cargo'} — {fmtNum(loadedQ ?? planned, 3)} {line?.unit ?? ''}
                                {line && line.total !== (loadedQ ?? planned) && (
                                  <span className="text-white/30"> of {fmtNum(line.total, 3)}</span>
                                )}
                                {loadedQ != null && Math.abs(loadedQ - planned) > EPS && (
                                  <span className="text-amber-300/80"> · planned {fmtNum(planned, 3)}</span>
                                )}
                              </p>
                            )
                          })}
                        </li>
                      ))}
                  </ul>

                  {/* Proof that THIS run was loaded. Each run has its own — a single
                      photo cannot evidence the second time the truck was filled. */}
                  {trip.pickup_proof_photo_url ? (
                    <a
                      href={trip.pickup_proof_photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] text-white/45 hover:text-white transition-colors"
                    >
                      <Camera size={12} /> Proof of loading
                      {trip.pickup_proof_at
                        ? ` · ${new Date(trip.pickup_proof_at).toLocaleString('en-PH', {
                            timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}`
                        : ''}
                    </a>
                  ) : trip.status !== 'pending' ? (
                    <p className="text-[11px] text-white/30">No proof of loading on file.</p>
                  ) : null}
                </li>
              )
            })}
          </ul>

          {active.length === 1 && started.length === 0 && (
            <p className="text-[11px] text-white/30">
              Currently one run carrying everything. Split it only if the load will not fit the
              vehicle in a single trip.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** One cargo line's quantity on a run: − / number / + and what is left of it. */
function QtyRow({ line, value, max, disabled, onChange }: {
  line: Line
  value: number
  max: number
  disabled: boolean
  onChange: (v: number) => void
}) {
  const step = line.divisible && Number.isInteger(line.total) ? 1 : line.divisible ? 0.5 : 1
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-white/60 min-w-0 truncate" title={line.label}>
        {line.label}
        <span className="text-white/30"> · {fmtNum(line.total, 3)} {line.unit} booked</span>
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          aria-label={`Less ${line.label}`}
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - step))}
          className="w-7 h-7 flex items-center justify-center rounded border border-white/10 text-white/50
                     disabled:opacity-30"
        >
          <Minus size={12} />
        </button>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={line.divisible ? 'any' : 1}
          value={Number.isFinite(value) ? value : 0}
          disabled={disabled || !line.divisible && max < 1 && value === 0}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          aria-label={`${line.label} on this trip`}
          className="w-16 h-7 rounded border border-white/10 bg-black/30 text-center text-[16px] sm:text-[12px]
                     text-white tabular-nums focus:outline-none focus:border-[var(--color-cyan)]"
        />
        <button
          type="button"
          aria-label={`More ${line.label}`}
          disabled={disabled || value >= max - EPS}
          onClick={() => onChange(Math.min(max, value + step))}
          className="w-7 h-7 flex items-center justify-center rounded border border-white/10 text-white/50
                     disabled:opacity-30"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}

function TripStatusPill({ status }: { status: Trip['status'] }) {
  const tone =
    status === 'completed'  ? { label: 'Completed',  color: 'var(--color-green)' } :
    status === 'in_transit' ? { label: 'Out now',    color: 'var(--color-cyan)' } :
    status === 'cancelled'  ? { label: 'Cancelled',  color: '#f62626'           } :
                              { label: 'Not loaded', color: 'rgba(255,255,255,0.35)' }

  return (
    <span
      className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border"
      style={{ color: tone.color, borderColor: `${tone.color === 'var(--color-cyan)' ? 'rgba(77,249,237,0.35)' : tone.color}44` }}
    >
      {tone.label}
    </span>
  )
}
