/**
 * A booking's progress as seven steps, for the step-by-step card at the top of
 * the Booking Management panel (user 2026-11-24).
 *
 * Industry pattern: a vertical stepper whose current step carries the one
 * action that moves the job on (Shopify's order timeline, Stripe's onboarding
 * checklist, Onfleet's task states, SAP TM's "ready for execution" checks).
 * Done steps keep their time, the next step says who acts, later steps are
 * greyed. A cancelled, rejected or failed booking stops at the step it reached.
 *
 * Pure: the panel passes the booking, this works out each step's state.
 */

export type StepKey =
  | 'submitted'
  | 'approval'
  | 'assignment'
  | 'call_time'
  | 'on_the_road'
  | 'delivered'
  | 'completed'

export type StepState = 'done' | 'current' | 'upcoming' | 'stopped' | 'skipped'

/** How the stopped step ended. */
export type StopKind = 'rejected' | 'cancelled' | 'failed'

export const STEP_ORDER: StepKey[] = [
  'submitted', 'approval', 'assignment', 'call_time', 'on_the_road', 'delivered', 'completed',
]

/** The booking fields the steps read. Everything optional: older rows lack some. */
export interface ProgressInput {
  status:              string | null | undefined
  gm_status?:          string | null
  gm_reviewed_at?:     string | null
  ops_assigned_at?:    string | null
  driver_call_time?:   string | null
  pickup_proof_at?:    string | null
  delivered_at?:       string | null
  completion_confirmed_at?: string | null
  cancelled_at?:       string | null
  /** A driver or vehicle is on the booking (assignment record or booking's own). */
  hasCrew?:            boolean
}

export interface ProgressResult {
  states:  Record<StepKey, StepState>
  /** The step to act on next; null when the booking is finished or stopped. */
  current: StepKey | null
  /** Set when the booking ended early. */
  stop:    { at: StepKey; kind: StopKind } | null
  /** Steps done, for "Step N of 7" and the bar. */
  doneCount: number
}

/** How far the lifecycle status alone has got: index of the first step not done. */
const STATUS_REACH: Record<string, number> = {
  pending:    1,
  approved:   2,
  assigned:   3, // call time decides 3 or 4 below
  in_transit: 4,
  delivered:  6,
  completed:  7,
}

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, '_')
}

/** Where a cancelled booking had got to, from what it has on record. */
function cancelledReach(b: ProgressInput): number {
  if (b.pickup_proof_at) return 4
  if (b.ops_assigned_at || b.hasCrew) return b.driver_call_time ? 4 : 3
  if (norm(b.gm_status) === 'approved' || b.gm_reviewed_at) return 2
  return 1
}

export function bookingProgress(b: ProgressInput): ProgressResult {
  const status = norm(b.status)
  const rejected = norm(b.gm_status) === 'rejected' || status === 'rejected'

  let reach: number
  let stop: ProgressResult['stop'] = null

  if (rejected) {
    reach = 1
    stop = { at: 'approval', kind: 'rejected' }
  } else if (status === 'cancelled') {
    reach = cancelledReach(b)
    stop = { at: STEP_ORDER[reach], kind: 'cancelled' }
  } else if (status === 'failed') {
    reach = 4
    stop = { at: 'on_the_road', kind: 'failed' }
  } else {
    reach = STATUS_REACH[status] ?? 1
    // Assigned with the call time saved: the call-time step is done too.
    if (status === 'assigned' && b.driver_call_time) reach = 4
  }

  const states = {} as Record<StepKey, StepState>
  STEP_ORDER.forEach((key, i) => {
    if (i < reach) states[key] = 'done'
    else if (stop) states[key] = i === reach ? 'stopped' : 'skipped'
    else states[key] = i === reach ? 'current' : 'upcoming'
  })

  return {
    states,
    current: stop || reach >= STEP_ORDER.length ? null : STEP_ORDER[reach],
    stop,
    doneCount: Math.min(reach, STEP_ORDER.length),
  }
}
