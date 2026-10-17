'use client'

import { Check, Truck, X } from 'lucide-react'

/**
 * The route as a stepper: the pickup, then every drop-off in route order.
 *
 * A drop-off is marked done only when it really is: `booking_destinations.status`
 * turns 'delivered' once EVERY trip bound for it has unloaded there, each with
 * its own proof photo (trip.service rollUpDestination). A drop-off split across
 * several trips shows how many of its loads are in ("2/3 loads") and a half
 * filled dot until the last one arrives.
 *
 * `compact` is the list-row version: dots on one line, no labels, since the
 * row prints the addresses itself.
 */

export type StepState = 'done' | 'partial' | 'failed' | 'current' | 'upcoming'

export interface RouteStep {
  key:    string
  label:  string
  /** Full address, for the tooltip. */
  title?: string
  state:  StepState
  /** Loads for this drop-off across trips; shown when there is more than one. */
  loads?: { done: number; total: number }
  /** The driver is driving to this one now (they may have chosen it out of order). */
  heading?: boolean
  /** The step being worked now: the heading, or the first one still owed anything. */
  active?:  boolean
}

interface StopLike {
  key:          string
  address:      string
  status?:      string | null
  loads_total?: number | null
  loads_done?:  number | null
}

/** Booking statuses where the truck has left the pickup point. */
const PAST_PICKUP = new Set(['in_transit', 'delivered', 'completed'])

/**
 * Turn a booking's pickup and drop-offs into steps.
 *
 * The current step is the drop-off the driver is actually heading to when the
 * server says so (`headingTo`, which follows the driver's own choice of order).
 * Without it — before loading, between runs, or on a list row — it falls back
 * to the first drop-off still owed anything, or the pickup before departure.
 */
export function routeSteps(
  bookingStatus: string | null | undefined,
  origin:        string,
  stops:         StopLike[],
  headingTo?:    string | null,
): RouteStep[] {
  const status     = (bookingStatus ?? '').toLowerCase()
  const cancelled  = status === 'cancelled'
  const leftPickup = PAST_PICKUP.has(status) ||
    stops.some((s) => s.status === 'delivered' || s.status === 'failed' || (s.loads_done ?? 0) > 0)

  const heading = headingTo && stops.some((s) => s.key === headingTo && s.status !== 'delivered' && s.status !== 'failed')
    ? headingTo
    : null

  // Only one step is ever current; a cancelled booking has none, and a known
  // heading claims it for that drop-off.
  let currentTaken = cancelled || !!heading
  let pickupState: StepState = 'upcoming'
  if (leftPickup) pickupState = 'done'
  else if (!cancelled) { pickupState = 'current'; currentTaken = true }

  const dropSteps = stops.map((s): RouteStep => {
    const total = Math.max(1, s.loads_total ?? 1)
    const done  = Math.min(total, s.loads_done ?? (s.status === 'delivered' ? total : 0))
    let state: StepState
    let active = false
    if (s.status === 'delivered')    state = 'done'
    else if (s.status === 'failed')  state = 'failed'
    else if (s.key === heading)      { state = done > 0 ? 'partial' : 'current'; active = true }
    else if (!currentTaken)          { state = done > 0 ? 'partial' : 'current'; currentTaken = true; active = true }
    else                             state = done > 0 ? 'partial' : 'upcoming'
    return {
      key: s.key, label: placeName(s.address), title: s.address, state,
      loads: total > 1 ? { done, total } : undefined,
      heading: s.key === heading,
      active,
    }
  })

  return [
    { key: 'pickup', label: placeName(origin) || 'Pick up', title: origin, state: pickupState, active: pickupState === 'current' },
    ...dropSteps,
  ]
}

/** A booking list row's route as steps: its pickup and drop-offs in stop order. */
export function bookingRouteSteps(booking: {
  status:  string
  origin?: string | null
  booking_destinations?: Array<{
    destination_id?: string; address: string; status?: string | null; sequence_order?: number | null
    booking_trip_stops?: { status: string }[] | null
  }> | null
}): RouteStep[] {
  const stops = [...(booking.booking_destinations ?? [])]
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
  return routeSteps(
    booking.status,
    booking.origin ?? '',
    stops.map((d, i) => {
      const visits = d.booking_trip_stops ?? []
      return {
        key:         d.destination_id ?? String(i),
        address:     d.address,
        status:      d.status,
        loads_total: visits.length || undefined,
        loads_done:  visits.length ? visits.filter((v) => v.status === 'delivered').length : undefined,
      }
    }),
  )
}

/** "1/3 drop-offs" — how many drop-offs are fully done, for a list row. */
export function dropoffSummary(steps: RouteStep[]): string {
  const drops = steps.slice(1)
  const done  = drops.filter((s) => s.state === 'done').length
  return `${done}/${drops.length} drop-off${drops.length === 1 ? '' : 's'}`
}

/** Steps from counts alone, for places that only know "n of m stops done". */
export function countSteps(done: number, total: number): RouteStep[] {
  return Array.from({ length: total }, (_, i) => ({
    key:   String(i),
    label: `Stop ${i + 1}`,
    state: i < done ? 'done' : i === done ? 'current' : 'upcoming',
  }))
}

function placeName(address: string | null | undefined): string {
  return (address ?? '').split(',')[0]?.trim() ?? ''
}

const CYAN  = 'var(--color-cyan)'
const RED   = '#f62626'
const IDLE  = '#4a4a4a'

/** Colour of the line leading INTO this step: travelled, failed or not yet. */
function lineInto(step: RouteStep): string {
  if (step.state === 'failed')   return 'rgba(246,38,38,0.6)'
  if (step.state === 'upcoming') return '#333333'
  return CYAN
}

/**
 * The step being worked now: the drop-off the driver is heading to when known,
 * otherwise the 'current' step. A partially delivered drop-off further down the
 * route is not "now" just because some of its loads are in.
 */
function isActive(step: RouteStep): boolean {
  return step.active ?? step.state === 'current'
}

function Dot({ step, size, live, showContent }: {
  step: RouteStep; size: number; live: boolean; showContent: boolean
}) {
  const ring =
    step.state === 'failed' ? RED :
    step.state === 'upcoming' ? IDLE : CYAN
  const background =
    step.state === 'done'    ? CYAN :
    step.state === 'failed'  ? RED :
    step.state === 'partial' ? `linear-gradient(90deg, ${CYAN} 50%, transparent 50%)` :
    'var(--color-bg, #0a0a0a)'
  const pulse = live && isActive(step)

  return (
    <span
      className="relative z-[1] flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size, height: size,
        border: `2px solid ${ring}`,
        background,
        boxShadow: pulse ? '0 0 0 4px rgba(77,249,237,0.18)' : undefined,
      }}
    >
      {showContent && (
        step.state === 'done'   ? <Check size={size * 0.55} strokeWidth={3} color="#04201e" /> :
        step.state === 'failed' ? <X size={size * 0.55} strokeWidth={3} color="#ffffff" /> :
        null
      )}
    </span>
  )
}

export function RouteStepper({
  steps,
  compact = false,
  live    = false,
}: {
  steps:    RouteStep[]
  compact?: boolean
  /** The truck is on the road: mark the current step with it. */
  live?:    boolean
}) {
  if (steps.length === 0) return null

  // List rows: dots evenly spaced on one continuous line.
  if (compact) {
    return (
      <div className="flex w-full items-center" role="list" aria-label="Route progress">
        {steps.map((step, i) => (
          <div key={step.key} className={`flex items-center ${i === 0 ? '' : 'flex-1'}`} role="listitem" title={step.title ?? step.label}>
            {i > 0 && (
              <span className="mx-1 h-[2px] flex-1 rounded-full" style={{ background: lineInto(step) }} />
            )}
            <Dot step={step} size={isActive(step) ? 10 : 8} live={live} showContent={false} />
          </div>
        ))}
      </div>
    )
  }

  // Panel: equal columns, so the connector between two centres is always the
  // same length and the labels sit squarely under their dots.
  const size = 22
  return (
    <div className="w-full overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/10">
      <ol
        className="grid pt-5"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(76px, 1fr))` }}
        aria-label="Route progress"
      >
        {steps.map((step, i) => {
          const next = steps[i + 1]
          return (
            <li
              key={step.key}
              className="relative flex flex-col items-center px-1"
              title={step.title ?? step.label}
              aria-current={isActive(step) ? 'step' : undefined}
            >
              {next && (
                <span
                  aria-hidden
                  className="absolute h-[2px] rounded-full"
                  style={{
                    top:        size / 2 - 1,
                    left:       `calc(50% + ${size / 2 + 4}px)`,
                    width:      `calc(100% - ${size + 8}px)`,
                    background: lineInto(next),
                  }}
                />
              )}

              {live && isActive(step) && (
                <Truck size={14} strokeWidth={1.75} className="absolute -top-5" style={{ color: CYAN }} aria-hidden />
              )}

              <Dot step={step} size={size} live={live} showContent />

              <span
                className="mt-1.5 w-full truncate text-center text-[10px] leading-tight"
                style={{ color: step.state === 'upcoming' ? 'var(--color-muted)' : '#ffffff' }}
              >
                {i === 0 ? 'Pick up' : `Drop-off ${i}`}
              </span>
              <span className="w-full truncate text-center text-[10px] leading-tight text-white/45">
                {step.label}
              </span>
              {step.heading && (
                <span className="mt-0.5 text-[10px] font-semibold" style={{ color: CYAN }}>Heading here</span>
              )}
              {step.loads && (
                <span
                  className="mt-0.5 text-[10px] font-semibold tabular-nums"
                  style={{ color: step.loads.done === step.loads.total ? CYAN : '#ffea00' }}
                >
                  {step.loads.done}/{step.loads.total} loads
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
