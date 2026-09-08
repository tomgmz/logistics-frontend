'use client'

import {
  MapPin, Truck, Clock, CheckCircle2, XCircle, AlertCircle, Loader2,
} from 'lucide-react'

import { type BookingStatus, asBookingStatus } from '@/app/types/maps/routemap.types'
import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { formatDateTime } from './transaction-format'
import { CYAN, MUTED, ERROR, AMBER, GREEN, BORDER_C } from './transaction-theme'

/**
 * Status vocabulary for transaction history — badges and the lifecycle
 * timeline. Shared so a client and a member of staff looking at the same
 * booking see the same colour and the same wording for its state.
 */

export const STATUS_META: Record<
  BookingStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  BOOKED:     { label: 'Booked',     color: CYAN,  bg: `${CYAN}18`,  icon: <CheckCircle2 size={12} /> },
  APPROVED:   { label: 'Approved',   color: CYAN,  bg: `${CYAN}18`,  icon: <CheckCircle2 size={12} /> },
  PENDING:    { label: 'Pending',    color: AMBER, bg: `${AMBER}18`, icon: <Clock        size={12} /> },
  ASSIGNED:   { label: 'Assigned',   color: CYAN,  bg: `${CYAN}18`,  icon: <CheckCircle2 size={12} /> },
  IN_TRANSIT: { label: 'In Transit', color: GREEN, bg: `${GREEN}18`, icon: <Truck        size={12} /> },
  ARRIVED:    { label: 'Arrived',    color: GREEN, bg: `${GREEN}18`, icon: <MapPin       size={12} /> },
  COMPLETED:  { label: 'Completed',  color: CYAN,  bg: `${CYAN}18`,  icon: <CheckCircle2 size={12} /> },
  CANCELLED:  { label: 'Cancelled',  color: ERROR, bg: `${ERROR}18`, icon: <XCircle      size={12} /> },
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

export const STATUS_ORDER: BookingStatus[] = ['PENDING', 'APPROVED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED']

export const TIMELINE_LABELS: Record<BookingStatus, string> = {
  BOOKED:     'Booking Created',
  APPROVED:   'Booking Approved',
  PENDING:    'Booking Placed',
  ASSIGNED:   'Driver Assigned',
  IN_TRANSIT: 'In Transit',
  ARRIVED:    'Arrived',
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

  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const resolvedStatus = currentStatus === 'UNKNOWN' ? 'PENDING' : currentStatus
        const state  = getStepState(step.status, resolvedStatus)
        const isLast = i === steps.length - 1
        const meta   = STATUS_META[step.status]

        return (
          <div key={step.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border transition-all"
                style={
                  state === 'done'
                    ? { background: `${CYAN}22`,       borderColor: `${CYAN}60`,       color: CYAN }
                    : state === 'active'
                    ? { background: `${meta.color}22`, borderColor: `${meta.color}80`, color: meta.color }
                    : { background: 'transparent',     borderColor: BORDER_C,          color: MUTED }
                }>
                {state === 'done'
                  ? <CheckCircle2 size={14} />
                  : state === 'active'
                  ? meta.icon
                  : <div className="w-1.5 h-1.5 rounded-full" style={{ background: BORDER_C }} />}
              </div>
              {!isLast && (
                <div className="w-px flex-1 my-1"
                  style={{ background: state === 'done' ? `${CYAN}40` : BORDER_C, minHeight: 20 }} />
              )}
            </div>

            <div className="flex flex-col gap-0.5 pb-4">
              <span className="text-sm font-bold" style={{ color: state === 'upcoming' ? MUTED : '#fff' }}>
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
          </div>
        )
      })}
    </div>
  )
}
