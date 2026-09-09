'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Check,
  Lock,
  Plus,
  Repeat,
  Trash2,
  TriangleAlert,
} from 'lucide-react'

import {
  tripService,
  planIsLocked,
  type Trip,
  type TripPlanEntry,
} from '@/lib/services/admin/trip.service'
import type { BookingDetail } from '@/app/types/maps/routemap.types'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'

/**
 * How many runs the assigned vehicle makes, and which drop-offs each one serves.
 *
 * This is the operations half of the shuttle model. When a booking's cargo is
 * larger than the truck body the answer is NOT a second vehicle — it is the same
 * truck going back and forth, and somebody has to decide how many times and with
 * what on board each time. That decision is made here, at the moment a real
 * vehicle is finally attached to the booking, which is also the first moment the
 * question can be answered: until then there is no body to compare the load to.
 *
 * Two rules are enforced, both mirroring the server:
 *   * every run must serve at least one drop-off, and
 *   * every drop-off must be served by at least one run —
 * a bay on no run is a bay nobody is ever sent to, and the booking would sit in
 * transit forever waiting for it.
 *
 * A bay appearing on SEVERAL runs is not an error. It is the whole point: a load
 * too big for one trip is delivered across two, and each delivery gets its own
 * proof photo.
 *
 * The panel goes read-only the moment any run has been loaded. The server
 * refuses a re-plan then, and rightly — a driver holding a truck loaded against
 * run 2 must not have run 2 redefined underneath them.
 */

const MAX_TRIPS = 10

interface Props {
  detail: BookingDetail
  /** Whether this viewer may change the plan at all (RBAC edit right). */
  canEdit: boolean
}

interface Draft {
  /** Local key; the server assigns real trip ids on save. */
  key:             string
  destinationIds:  string[]
}

/** Per-bay load figures, so the split is made against numbers rather than guesswork. */
function loadByDestination(detail: BookingDetail) {
  const totals = new Map<string, { weightKg: number; volumeCbm: number; items: number }>()

  for (const item of detail.booking_cargo_items ?? []) {
    const id = (item as { destination_id?: string | null }).destination_id
    if (!id) continue
    const qty  = item.quantity ?? 1
    const prev = totals.get(id) ?? { weightKg: 0, volumeCbm: 0, items: 0 }
    totals.set(id, {
      weightKg:  prev.weightKg  + (item.weight_kg  ?? 0) * qty,
      volumeCbm: prev.volumeCbm + (item.volume_cbm ?? 0) * qty,
      items:     prev.items     + qty,
    })
  }

  return totals
}

const fmtNum = (n: number, digits = 2) =>
  n === 0 ? '0' : n.toLocaleString('en-PH', { maximumFractionDigits: digits })

export default function TripPlanner({ detail, canEdit }: Props) {
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
  const load = useMemo(() => loadByDestination(detail), [detail])

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

  const locked = planIsLocked(trips)
  const active = trips.filter((t) => t.status !== 'cancelled')

  const beginEdit = () => {
    setDrafts(
      active.length > 0
        ? active
            .slice()
            .sort((a, b) => a.trip_number - b.trip_number)
            .map((t, i) => ({
              key: `t${i}`,
              destinationIds: (t.booking_trip_stops ?? [])
                .slice()
                .sort((a, b) => a.sequence_order - b.sequence_order)
                .map((s) => s.destination_id),
            }))
        : [{ key: 't0', destinationIds: destinations.map((d) => d.destination_id) }],
    )
    setEditing(true)
  }

  const toggleStop = (draftKey: string, destinationId: string) => {
    setDrafts((prev) => prev.map((d) => {
      if (d.key !== draftKey) return d
      const on = d.destinationIds.includes(destinationId)
      return {
        ...d,
        destinationIds: on
          ? d.destinationIds.filter((id) => id !== destinationId)
          : [...d.destinationIds, destinationId],
      }
    }))
  }

  const addTrip = () => {
    setDrafts((prev) =>
      prev.length >= MAX_TRIPS
        ? prev
        // A new run starts EMPTY rather than pre-filled. Pre-filling it would
        // silently duplicate the whole load onto a second trip, which is a real
        // and expensive plan to publish by accident.
        : [...prev, { key: `t${Date.now()}`, destinationIds: [] }],
    )
  }

  const removeTrip = (key: string) =>
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)))

  /* ── Validation, mirroring the server ─────────────────────────────────── */

  const emptyTrips = drafts.filter((d) => d.destinationIds.length === 0)
  const servedIds  = new Set(drafts.flatMap((d) => d.destinationIds))
  const unserved   = destinations.filter((d) => !servedIds.has(d.destination_id))
  const valid      = drafts.length > 0 && emptyTrips.length === 0 && unserved.length === 0

  const save = async () => {
    if (!valid) return
    setSaving(true)
    try {
      const plan: TripPlanEntry[] = drafts.map((d, i) => ({
        trip_number:     i + 1,
        destination_ids: d.destinationIds,
      }))
      setTrips(await tripService.setTripPlan(bookingId, plan))
      setEditing(false)
      appToast.success(
        plan.length === 1
          ? 'Planned as a single trip.'
          : `Planned as ${plan.length} trips of the assigned vehicle.`,
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

        {!editing && canEdit && !locked && !loading && !loadError && (
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
        to the pickup point and goes out again — it is never crewed with a second vehicle.
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
          <div className="space-y-2">
            {drafts.map((draft, i) => {
              const isEmpty = draft.destinationIds.length === 0
              const totals  = draft.destinationIds.reduce(
                (acc, id) => {
                  const t = load.get(id)
                  return t
                    ? { weightKg: acc.weightKg + t.weightKg, volumeCbm: acc.volumeCbm + t.volumeCbm }
                    : acc
                },
                { weightKg: 0, volumeCbm: 0 },
              )

              return (
                <div
                  key={draft.key}
                  className="rounded-lg border p-2.5 space-y-2 bg-black/25"
                  style={{ borderColor: isEmpty ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.08)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                      Trip {i + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      {(totals.weightKg > 0 || totals.volumeCbm > 0) && (
                        <span className="text-[10px] text-white/35">
                          {totals.weightKg  > 0 ? `${fmtNum(totals.weightKg)} kg`   : ''}
                          {totals.weightKg  > 0 && totals.volumeCbm > 0 ? ' · ' : ''}
                          {totals.volumeCbm > 0 ? `${fmtNum(totals.volumeCbm, 4)} CBM` : ''}
                        </span>
                      )}
                      {drafts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTrip(draft.key)}
                          disabled={saving}
                          aria-label={`Remove trip ${i + 1}`}
                          className="p-1 rounded-md text-white/30 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {destinations.map((dest, di) => {
                      const on = draft.destinationIds.includes(dest.destination_id)
                      const t  = load.get(dest.destination_id)
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
                          <span className="flex items-center gap-1.5">
                            {on && <Check size={11} className="shrink-0" />}
                            <span className="truncate max-w-[180px]">
                              Drop-off {di + 1} — {dest.address}
                            </span>
                          </span>
                          {t && (
                            <span className="block text-[10px] font-normal opacity-60">
                              {fmtNum(t.weightKg)} kg · {fmtNum(t.volumeCbm, 4)} CBM
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {isEmpty && (
                    <p className="text-[11px] text-red-300/80">
                      A trip with no drop-off is a run to nowhere. Pick at least one.
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {drafts.length < MAX_TRIPS && (
            <button
              type="button"
              onClick={addTrip}
              disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed
                         border-white/15 text-[11px] font-bold text-white/45
                         hover:text-white hover:border-white/30 transition-colors disabled:opacity-40"
            >
              <Plus size={13} /> Add another trip
            </button>
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
            A drop-off may appear on more than one trip — that is how a load too big for a single
            run is delivered, and each visit gets its own proof photo.
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
              {saving ? 'Saving…' : `Save plan (${drafts.length} trip${drafts.length > 1 ? 's' : ''})`}
            </button>
          </div>
        </>
      ) : (
        <>
          {locked && (
            <div className="flex items-start gap-2 text-[11px] text-white/40">
              <Lock size={12} className="mt-0.5 shrink-0" />
              <span>
                The driver has started this plan, so it can no longer be changed — a truck already
                loaded against a run must not have that run redefined underneath it.
              </span>
            </div>
          )}

          <ul className="space-y-2">
            {active
              .slice()
              .sort((a, b) => a.trip_number - b.trip_number)
              .map((trip) => (
                <li key={trip.trip_id} className="rounded-lg border border-white/[0.08] p-2.5 space-y-2 bg-black/25">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                      Trip {trip.trip_number}
                    </span>
                    <TripStatusPill status={trip.status} />
                  </div>

                  <ul className="space-y-1">
                    {(trip.booking_trip_stops ?? [])
                      .slice()
                      .sort((a, b) => a.sequence_order - b.sequence_order)
                      .map((stop) => (
                        <li key={stop.trip_stop_id} className="flex items-start justify-between gap-2">
                          <span className="text-[12px] text-white/70 leading-snug min-w-0">
                            {stop.booking_destinations?.address ?? '—'}
                          </span>
                          <span
                            className="shrink-0 text-[10px] font-bold uppercase"
                            style={{
                              color: stop.status === 'delivered' ? 'var(--color-cyan)'
                                   : stop.status === 'failed'    ? '#f87171'
                                   : 'rgba(255,255,255,0.3)',
                            }}
                          >
                            {stop.status}
                          </span>
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
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}`
                        : ''}
                    </a>
                  ) : trip.status !== 'pending' ? (
                    <p className="text-[11px] text-white/30">No proof of loading on file.</p>
                  ) : null}
                </li>
              ))}
          </ul>

          {active.length === 1 && !locked && (
            <p className="text-[11px] text-white/30">
              Currently one run over every drop-off. Split it only if the load will not fit the
              vehicle in a single trip.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function TripStatusPill({ status }: { status: Trip['status'] }) {
  const tone =
    status === 'completed'  ? { label: 'Completed',  color: 'var(--color-cyan)' } :
    status === 'in_transit' ? { label: 'Out now',    color: '#fbbf24'           } :
    status === 'cancelled'  ? { label: 'Cancelled',  color: '#f87171'           } :
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
