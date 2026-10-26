'use client'

import {
  MapPin, Truck, Clock, Check, CheckCircle2, XCircle, AlertCircle, Loader2, PackageCheck,
} from 'lucide-react'

import { type BookingStatus, asBookingStatus } from '@/app/types/maps/routemap.types'
import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { bookingStatusColor } from '@/lib/palette'
import { formatDateTime } from './transaction-format'
import { CYAN, MUTED, ERROR, AMBER, GREEN, BORDER_C } from './transaction-theme'

/**
 * Status vocabulary for transaction history — badges and the lifecycle
 * timeline. Shared so a client and a member of staff looking at the same
 * booking see the same colour and the same wording for its state.
 */

const S = Object.fromEntries(
  (['BOOKED', 'APPROVED', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'COMPLETED', 'CANCELLED'] as const)
    .map((k) => [k, bookingStatusColor(k)]),
) as Record<BookingStatus, string>

export const STATUS_META: Record<
  BookingStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  BOOKED:     { label: 'Booked',     color: S.BOOKED, bg: `${S.BOOKED}18`,  icon: <CheckCircle2 size={12} /> },
  APPROVED:   { label: 'Approved',   color: S.APPROVED, bg: `${S.APPROVED}18`,  icon: <CheckCircle2 size={12} /> },
  PENDING:    { label: 'Pending',    color: S.PENDING, bg: `${S.PENDING}18`, icon: <Clock        size={12} /> },
  ASSIGNED:   { label: 'Assigned',   color: S.ASSIGNED, bg: `${S.ASSIGNED}18`,  icon: <CheckCircle2 size={12} /> },
  IN_TRANSIT: { label: 'In Transit', color: S.IN_TRANSIT, bg: `${S.IN_TRANSIT}18`, icon: <Truck        size={12} /> },
  ARRIVED:    { label: 'Arrived',    color: S.ARRIVED, bg: `${S.ARRIVED}18`, icon: <MapPin       size={12} /> },
  DELIVERED:  { label: 'Delivered',  color: S.DELIVERED, bg: `${S.DELIVERED}18`, icon: <PackageCheck size={12} /> },
  COMPLETED:  { label: 'Completed',  color: S.COMPLETED, bg: `${S.COMPLETED}18`,  icon: <CheckCircle2 size={12} /> },
  CANCELLED:  { label: 'Cancelled',  color: S.CANCELLED, bg: `${S.CANCELLED}18`, icon: <XCircle      size={12} /> },
}

const UNKNOWN_META = {
  label: 'Unknown', color: MUTED, bg: `${MUTED}18`, icon: <AlertCircle size={12} />,
}

export function getStatusMeta(status: string) {
  const normalized = asBookingStatus(status)
  return normalized !== 'UNKNOWN'
    ? STATUS_META[normalized]
    : UNKNOWN_META
}

export const STATUS_ORDER: BookingStatus[] = ['PENDING', 'APPROVED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED']

export const TIMELINE_LABELS: Record<BookingStatus, string> = {
  BOOKED:     'Booking Created',
  APPROVED:   'Booking Approved',
  PENDING:    'Booking Placed',
  ASSIGNED:   'Driver Assigned',
  IN_TRANSIT: 'In Transit',
  ARRIVED:    'Arrived',
  DELIVERED:  'Delivered — Awaiting Confirmation',
  COMPLETED:  'Completed',
  CANCELLED:  'Cancelled',
}

export function getStepState(
  stepStatus: BookingStatus,
  currentStatus: BookingStatus,
): 'done' | 'active' | 'upcoming' {
  if (currentStatus === 'CANCELLED') {
    return stepStatus === 'CANCELLED' ? 'active' : 'upcoming'
  }
  const stepIdx    = STATUS_ORDER.indexOf(stepStatus)
  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  if (stepIdx < currentIdx)   return 'done'
  if (stepIdx === currentIdx) return 'active'
  return 'upcoming'
}

export function StatusBadge({ status }: { status: string }) {
  const m = getStatusMeta(status)
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}40` }}
    >
      {m.icon}{m.label}
    </span>
  )
}

export function StatusTimeline({ booking }: { booking: BookingWithRelations }) {
  const currentStatus = asBookingStatus(booking.status)
  const isCancelled   = currentStatus === 'CANCELLED'
  const createdAt     = booking.created_at as string | undefined
  const updatedAt     = booking.updated_at as string | undefined

  const steps = isCancelled
    ? [
        { status: 'PENDING'   as BookingStatus, timestamp: formatDateTime(createdAt) },
        { status: 'CANCELLED' as BookingStatus, timestamp: formatDateTime(updatedAt) },
      ]
    : STATUS_ORDER.map((s, idx) => ({
        status: s,
        timestamp: idx === 0
          ? formatDateTime(createdAt)
          : currentStatus !== 'UNKNOWN' && STATUS_ORDER.indexOf(currentStatus) >= idx
          ? formatDateTime(updatedAt)
          : null,
      }))

  // Untitled UI's progress steps, "Icon with number" (Progress.IconsWithText,
  // type "number", size sm, vertical): a numbered circle per step, a tick on the
  // success colour once done, a ring round the current one, and a connector
  // that fills as the booking moves on. brand-solid → cyan, success-solid →
  // green, ring-secondary → #424242; a cancelled booking's current step is red.
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const resolvedStatus = currentStatus === 'UNKNOWN' ? 'PENDING' : currentStatus
        const state  = getStepState(step.status, resolvedStatus)
        const isLast = i === steps.length - 1
        const accent = step.status === 'CANCELLED' ? ERROR : CYAN

        return (
          <li key={step.status} className="flex gap-3" aria-current={state === 'active' ? 'step' : undefined}>
            <div className="flex flex-col items-center gap-1 pb-1">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                style={
                  state === 'done'
                    ? { background: GREEN, color: '#0a0a0a' }
                    : state === 'active'
                    ? { background: accent, color: '#0a0a0a', boxShadow: `0 0 0 4px ${accent}3d` }
                    : { background: '#1b1b1b', color: MUTED, boxShadow: 'inset 0 0 0 1px #424242' }
                }
              >
                {state === 'done' ? <Check size={14} strokeWidth={3} aria-label="Done" /> : i + 1}
              </span>
              {!isLast && (
                <span
                  aria-hidden
                  className="w-0.5 flex-1 rounded-sm"
                  style={{ background: state === 'done' ? GREEN : '#424242', minHeight: 20 }}
                />
              )}
            </div>

            <div className={`flex flex-col gap-0.5 pt-0.5 ${isLast ? '' : 'pb-6'}`}>
              <span className="text-sm font-semibold" style={{ color: state === 'active' ? accent : state === 'upcoming' ? MUTED : '#e5e5e5' }}>
                {TIMELINE_LABELS[step.status]}
              </span>
              {step.timestamp ? (
                <span className="text-xs" style={{ color: MUTED }}>{step.timestamp}</span>
              ) : state === 'active' ? (
                <span className="text-xs flex items-center gap-1" style={{ color: AMBER }}>
                  <Loader2 size={10} className="animate-spin" />In progress
                </span>
              ) : (
                <span className="text-xs" style={{ color: BORDER_C }}>Pending</span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
