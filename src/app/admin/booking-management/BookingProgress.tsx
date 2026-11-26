'use client'

import { useState, type ReactNode } from 'react'
import {
  AlarmClock, BadgeCheck, Check, ChevronDown, FileText, Navigation, PackageCheck,
  ShieldCheck, Truck, TriangleAlert, X, type LucideIcon,
} from 'lucide-react'

import { PALETTE } from '@/lib/palette'
import { parseDbTimestamp } from '@/lib/office-hours'
import { pauseReasonLabel } from '@/lib/services/admin/pause.service'
import {
  STEP_ORDER, bookingProgress, type ProgressInput, type StepKey, type StepState,
} from '@/lib/booking-progress'
import { CARD_CLASS, MUTED } from './BookingDetailParts'
import { formatCallClock, formatDriverCall } from './DriverCallTime'

/**
 * The booking's step-by-step progress at the top of the panel (user
 * 2026-11-24): Submitted → Approval → Vehicle and driver → Driver call time
 * (required) → On the road → Delivered → Completed.
 *
 * Done steps keep their time and what was decided; the current step opens into
 * a card that says who acts and holds the one action that moves the booking on
 * (passed in by the panel, which owns the handlers); later steps are greyed.
 * A rejected, cancelled or failed booking stops at the step it reached.
 */

export interface ProgressBooking extends ProgressInput {
  created_at?:              string | null
  schedule_date?:           string | null
  call_time?:               string | null
  driver_call_date?:        string | null
  completion_auto?:         boolean | null
  paused_at?:               string | null
  pause_reason?:            string | null
  delay_minutes?:           number | null
  delayed_since?:           string | null
  late_start_for?:          string | null
  client_issue_reported_at?: string | null
  client_issue_resolved_at?: string | null
}

interface Props {
  booking:   ProgressBooking
  /** "ABC 1234, 6-Wheeler · Juan Dela Cruz", once crewed. */
  crewLine:  string | null
  dropoffs:  { done: number; failed: number; total: number }
  /** The action for the current step, when this viewer may take it. */
  actions?:  Partial<Record<StepKey, ReactNode>>
}

const ICONS: Record<StepKey, LucideIcon> = {
  submitted:   FileText,
  approval:    ShieldCheck,
  assignment:  Truck,
  call_time:   AlarmClock,
  on_the_road: Navigation,
  delivered:   PackageCheck,
  completed:   BadgeCheck,
}

/** Who moves each step on. Full role names, never abbreviations. */
const OWNER: Partial<Record<StepKey, string>> = {
  approval:    'General Manager',
  assignment:  'Operations Manager',
  call_time:   'Operations Manager',
  on_the_road: 'Driver',
  completed:   'Client',
}

const RAIL_IDLE = '#424242'
const COMPACT_KEY = 'booking-progress-compact'

/** "Nov 24, 3:12 PM" (year added when it isn't this year), Manila time. */
function shortTime(at: string | null | undefined): string | null {
  if (!at) return null
  const d = parseDbTimestamp(at)
  if (Number.isNaN(d.getTime())) return null
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear()
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit',
  })
}

/** "Tue, Nov 25" from a `YYYY-MM-DD` booking day. */
function dayLabel(day: string | null | undefined): string {
  if (!day) return 'the booking day'
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function join(...parts: (string | null | undefined | false)[]): string | null {
  const p = parts.filter(Boolean) as string[]
  return p.length ? p.join(' · ') : null
}

/** The Delayed mark (delay.scheduler): not at the pick-up by the client's pick-up time. */
function pickupDelayText(b: ProgressBooking): string {
  const late = b.delay_minutes ? ` (about ${b.delay_minutes} min)` : ''
  return `Delayed: the truck is not at the pickup point by the client's pick-up time, ${formatCallClock(b.call_time)}${late}. The client has been told.`
}

interface StepView {
  title: string
  meta:  string | null
}

function describe(key: StepKey, state: StepState, b: ProgressBooking, crewLine: string | null, dropoffs: Props['dropoffs']): StepView {
  const status = String(b.status ?? '').toLowerCase()
  const callText = b.driver_call_time
    ? formatDriverCall(b.driver_call_time, b.driver_call_date, b.schedule_date?.slice(0, 10))
    : null
  const cancelledMeta = join('Cancelled', shortTime(b.cancelled_at))

  switch (key) {
    case 'submitted':
      return { title: 'Booking submitted', meta: shortTime(b.created_at) }

    case 'approval':
      if (state === 'done')    return { title: 'Approved', meta: shortTime(b.gm_reviewed_at) }
      if (state === 'stopped') {
        return String(b.gm_status ?? '').toLowerCase() === 'rejected'
          ? { title: 'Rejected', meta: shortTime(b.gm_reviewed_at) }
          : { title: 'Cancelled before approval', meta: shortTime(b.cancelled_at) }
      }
      return { title: 'Approval', meta: null }

    case 'assignment':
      if (state === 'done')    return { title: 'Vehicle and driver assigned', meta: join(crewLine, shortTime(b.ops_assigned_at)) }
      if (state === 'stopped') return { title: 'Cancelled before assignment', meta: cancelledMeta }
      return { title: state === 'current' ? 'Assign the vehicle and driver' : 'Vehicle and driver', meta: null }

    case 'call_time':
      if (state === 'done') {
        return callText
          ? { title: 'Driver call time set', meta: callText }
          : { title: 'Driver call time', meta: 'Not set: the delivery started without one' }
      }
      if (state === 'stopped') return { title: 'Cancelled before the call time was set', meta: cancelledMeta }
      return { title: state === 'current' ? 'Set the driver call time' : 'Driver call time', meta: null }

    case 'on_the_road':
      if (state === 'done')    return { title: 'Picked up and on the road', meta: shortTime(b.pickup_proof_at) }
      if (state === 'stopped') {
        if (status === 'failed') return { title: 'Delivery failed', meta: join(dropoffs.total ? `${dropoffs.done} of ${dropoffs.total} drop-offs delivered` : null) }
        return { title: b.pickup_proof_at ? 'Cancelled on the road' : 'Cancelled before the start', meta: cancelledMeta }
      }
      if (state === 'current') {
        return status === 'in_transit'
          ? { title: 'On the road', meta: join(b.pickup_proof_at && `Picked up ${shortTime(b.pickup_proof_at)}`) }
          : { title: 'Driver starts the delivery', meta: null }
      }
      return { title: 'On the road', meta: null }

    case 'delivered':
      if (state === 'done') {
        return {
          title: 'Delivered',
          meta: join(
            dropoffs.total ? `${dropoffs.done} of ${dropoffs.total} drop-off${dropoffs.total === 1 ? '' : 's'}` : null,
            dropoffs.failed ? `${dropoffs.failed} failed` : null,
            shortTime(b.delivered_at),
          ),
        }
      }
      return {
        title: 'Delivered',
        meta: status === 'in_transit' && dropoffs.total ? `${dropoffs.done} of ${dropoffs.total} so far` : null,
      }

    case 'completed':
      if (state === 'done') {
        return {
          title: 'Completed',
          meta: join(b.completion_auto ? 'Confirmed automatically after 3 days' : 'Confirmed by the client', shortTime(b.completion_confirmed_at)),
        }
      }
      return { title: state === 'current' ? 'Client confirms the delivery' : 'Completed', meta: null }
  }
}

/** What the current step needs, in plain words, plus any warning. */
function currentBody(key: StepKey, b: ProgressBooking, dropoffs: Props['dropoffs']): { text: string; alerts: { tone: string; text: string }[] } {
  const status = String(b.status ?? '').toLowerCase()
  const alerts: { tone: string; text: string }[] = []
  switch (key) {
    case 'approval':
      return { text: 'Check the pickup, drop-offs, cargo, documents and schedule, then approve or reject. The client is told either way.', alerts }
    case 'assignment':
      if (b.delayed_since && !b.paused_at) alerts.push({ tone: PALETTE.red, text: pickupDelayText(b) })
      return { text: `Pick the vehicle and the driver for ${dayLabel(b.schedule_date)}. The drivers are notified once it is saved.`, alerts }
    case 'call_time':
      if (b.delayed_since && !b.paused_at) alerts.push({ tone: PALETTE.red, text: pickupDelayText(b) })
      return {
        text: `Required. When the driver should leave so the truck is at the pickup by the client's pick-up time (${formatCallClock(b.call_time)}): before it, on the booking day or the night before. The driver is reminded 1 hour before.`,
        alerts,
      }
    case 'on_the_road': {
      if (status === 'in_transit') {
        if (b.paused_at) alerts.push({ tone: PALETTE.orange, text: `Paused${b.pause_reason ? `: ${pauseReasonLabel(b.pause_reason as never)}` : ''}. Resume it under Booking Status.` })
        if (b.delayed_since && !b.paused_at) alerts.push({ tone: PALETTE.yellow, text: pickupDelayText(b) })
        return {
          text: dropoffs.total
            ? `${dropoffs.done} of ${dropoffs.total} drop-off${dropoffs.total === 1 ? '' : 's'} delivered. Live position and stop times are below.`
            : 'The driver is on the way. Live position and stop times are below.',
          alerts,
        }
      }
      const call = b.driver_call_time
        ? formatDriverCall(b.driver_call_time, b.driver_call_date, b.schedule_date?.slice(0, 10))
        : 'not set'
      if (b.late_start_for) alerts.push({ tone: PALETTE.red, text: 'Not started on time. The drivers and the office are being reminded every 30 minutes.' })
      if (b.delayed_since && !b.paused_at) alerts.push({ tone: PALETTE.red, text: pickupDelayText(b) })
      return { text: `The driver starts the delivery in the app. Driver call time: ${call}. Client's pick-up time: ${formatCallClock(b.call_time)}.`, alerts }
    }
    case 'completed': {
      const issueOpen = !!b.client_issue_reported_at && !b.client_issue_resolved_at
      if (issueOpen) alerts.push({ tone: PALETTE.red, text: 'The client reported a problem. Resolve it under Booking Status; the 3 days start again after.' })
      return { text: 'The client confirms the delivery in their portal. If they don’t, it completes on its own 3 days after delivery.', alerts }
    }
    default:
      return { text: '', alerts }
  }
}

function StepNode({ state, Icon, n }: { state: StepState; Icon: LucideIcon; n: number }) {
  const base = 'relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold'
  if (state === 'done') {
    return (
      <span className={base} style={{ background: PALETTE.cyan, borderColor: PALETTE.cyan, color: '#0a0a0a' }}>
        <Check size={15} strokeWidth={3} />
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span className={base} style={{ background: `${PALETTE.cyan}1f`, borderColor: PALETTE.cyan, color: PALETTE.cyan }}>
        {/* A soft ring that breathes; off for reduced motion. */}
        <span aria-hidden className="absolute inset-[-5px] rounded-full motion-safe:animate-ping" style={{ border: `1.5px solid ${PALETTE.cyan}55`, animationDuration: '2.2s' }} />
        <Icon size={14} strokeWidth={2.25} />
      </span>
    )
  }
  if (state === 'stopped') {
    return (
      <span className={base} style={{ background: `${PALETTE.red}1f`, borderColor: PALETTE.red, color: PALETTE.red }}>
        <X size={15} strokeWidth={3} />
      </span>
    )
  }
  return (
    <span className={`${base} ${state === 'skipped' ? 'border-dashed' : ''}`} style={{ borderColor: RAIL_IDLE, color: state === 'skipped' ? `${MUTED}99` : MUTED, background: '#1b1b1b' }}>
      {n}
    </span>
  )
}

export default function BookingProgress({ booking, crewLine, dropoffs, actions = {} }: Props) {
  const p = bookingProgress(booking)

  // Compact = only the step that matters now. A per-viewer preference.
  // The panel only renders after the booking is fetched in the browser, so
  // reading storage in the initializer can't mismatch a server render.
  const [compact, setCompact] = useState(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem(COMPACT_KEY) === '1' } catch { return false }
  })
  const toggle = () => {
    setCompact((v) => {
      try { window.localStorage.setItem(COMPACT_KEY, v ? '0' : '1') } catch { /* private mode */ }
      return !v
    })
  }

  const focusKey: StepKey | null = p.current ?? p.stop?.at ?? null
  const total = STEP_ORDER.length

  const headline = p.current
    ? describe(p.current, 'current', booking, crewLine, dropoffs).title
    : p.stop
      ? p.stop.kind === 'rejected' ? 'Rejected' : p.stop.kind === 'failed' ? 'Delivery failed' : 'Cancelled'
      : 'Completed'
  const counter = p.current
    ? `Step ${p.doneCount + 1} of ${total}`
    : p.stop ? `Stopped at step ${p.doneCount + 1}` : `${total} of ${total}`
  const counterColor = p.stop ? PALETTE.red : p.current ? PALETTE.cyan : PALETTE.green

  const visible = compact && focusKey ? STEP_ORDER.filter((k) => k === focusKey) : STEP_ORDER

  return (
    <section data-jump="Progress" aria-label="Booking progress" className={`${CARD_CLASS} overflow-hidden`}>
      <div className="flex items-start gap-3 px-3.5 sm:px-4 pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase text-[#818181] leading-tight">
            {p.current ? 'Next step' : 'Progress'}
          </p>
          <p className="text-base font-bold text-white leading-snug break-words">{headline}</p>
        </div>
        <span className="shrink-0 text-xs font-bold whitespace-nowrap tabular-nums mt-0.5" style={{ color: counterColor }}>
          {counter}
        </span>
      </div>

      {/* One segment per step: done cyan, the current one half-lit, a stop red. */}
      <div className="flex gap-1 px-3.5 sm:px-4 pt-2.5" aria-hidden>
        {STEP_ORDER.map((k) => {
          const s = p.states[k]
          const bg = s === 'done' ? PALETTE.cyan : s === 'current' ? `${PALETTE.cyan}59` : s === 'stopped' ? PALETTE.red : RAIL_IDLE
          return <span key={k} className="h-1.5 flex-1 rounded-full transition-colors duration-500" style={{ background: bg }} />
        })}
      </div>

      <ol className="m-0 list-none px-3.5 sm:px-4 pt-3.5 pb-1">
        {visible.map((key) => {
          const i = STEP_ORDER.indexOf(key)
          const state = p.states[key]
          const last = compact || i === total - 1
          const view = describe(key, state, booking, crewLine, dropoffs)
          const lineLit = state === 'done' && p.states[STEP_ORDER[i + 1]] !== 'skipped'
          const isFocus = state === 'current'
          const titleColor = state === 'done' ? 'text-white/85' : isFocus ? 'text-white' : state === 'stopped' ? '' : 'text-[#818181]'
          const body = isFocus ? currentBody(key, booking, dropoffs) : null
          const action = isFocus ? actions[key] : null
          const owner = OWNER[key]
          return (
            <li key={key} aria-current={isFocus ? 'step' : undefined} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepNode state={state} Icon={ICONS[key]} n={i + 1} />
                {!last && (
                  <span aria-hidden className="w-0.5 flex-1 min-h-3 my-1 rounded-full transition-colors duration-500"
                    style={{ background: lineLit ? `${PALETTE.cyan}80` : RAIL_IDLE }} />
                )}
              </div>

              <div className={`min-w-0 flex-1 ${last ? 'pb-3' : 'pb-3.5'}`}>
                <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className={`text-sm font-bold leading-tight ${titleColor} ${state === 'skipped' ? 'opacity-60' : ''}`}
                    style={state === 'stopped' ? { color: PALETTE.red } : undefined}>
                    {view.title}
                  </p>
                  {key === 'call_time' && isFocus && (
                    <span className="rounded-[5px] border px-1 py-0.5 text-[11px] font-bold leading-none"
                      style={{ color: PALETTE.yellow, borderColor: PALETTE.yellow, background: `${PALETTE.yellow}1a` }}>
                      Required
                    </span>
                  )}
                  {key === 'on_the_road' && isFocus && String(booking.status).toLowerCase() === 'in_transit' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold leading-none" style={{ color: PALETTE.cyan }}>
                      <span className="relative flex size-1.5">
                        <span aria-hidden className="absolute inset-0 rounded-full motion-safe:animate-ping" style={{ background: PALETTE.cyan }} />
                        <span className="relative size-1.5 rounded-full" style={{ background: PALETTE.cyan }} />
                      </span>
                      Live
                    </span>
                  )}
                </div>
                {view.meta && (
                  <p className="text-xs text-[#818181] leading-snug break-words -mt-0.5">{view.meta}</p>
                )}

                {isFocus && body && (
                  <div className="mt-2.5 rounded-xl border p-3 space-y-3"
                    style={{ borderColor: `${PALETTE.cyan}40`, background: `linear-gradient(180deg, ${PALETTE.cyan}0d, transparent 70%)` }}>
                    {owner && (
                      <p className="text-[11px] font-bold uppercase leading-none">
                        {action
                          ? <span style={{ color: PALETTE.cyan }}>Your step</span>
                          : <span className="text-[#818181]">Waiting on the {owner}</span>}
                        {action && <span className="text-[#818181]"> · {owner}</span>}
                      </p>
                    )}
                    <p className="text-[13px] leading-snug text-white/75">{body.text}</p>
                    {body.alerts.map((a) => (
                      <p key={a.text} className="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[13px] leading-snug text-white/85"
                        style={{ borderColor: `${a.tone}55`, background: `${a.tone}12` }}>
                        <TriangleAlert size={14} className="mt-0.5 shrink-0" style={{ color: a.tone }} />
                        <span>{a.text}</span>
                      </p>
                    ))}
                    {action}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {focusKey && (
        <button type="button" onClick={toggle} aria-expanded={!compact}
          className="flex w-full items-center justify-center gap-1.5 border-t border-[#424242] py-2 text-xs font-bold text-[#818181] transition-colors [@media(hover:hover)]:hover:text-white">
          {compact ? `Show all ${total} steps` : 'Show only the current step'}
          <ChevronDown size={14} className={`transition-transform ${compact ? '' : 'rotate-180'}`} />
        </button>
      )}
    </section>
  )
}
