'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil, XCircle } from 'lucide-react'

import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { bookingService } from '@/lib/services/client/booking.service'
import { isAwaitingResubmit } from '@/lib/booking-resubmit'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { BORDER_C, CYAN, ERROR, MUTED } from './transaction-theme'

/**
 * A booking 8338 turned down is the client's to act on: correct it and send it
 * back for review (Edit & Resubmit opens the booking wizard filled in with it),
 * or cancel it for good.
 *
 * Renders nothing unless the booking is a rejection still waiting on the client.
 * `compact` is the dashboard's Needs Your Attention row.
 */
export default function RejectionPanel({ booking, onUpdated, compact = false }: {
  booking:   BookingWithRelations
  onUpdated: (next: BookingWithRelations) => void
  compact?:  boolean
}) {
  const [busy,       setBusy]       = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (!isAwaitingResubmit(booking)) return null

  const bookingId = booking.booking_id as string
  const reason    = booking.rejection_reason as string | null | undefined
  const byGm      = booking.gm_status === 'rejected'

  async function close() {
    setBusy(true)
    try {
      const next = await bookingService.closeRejectedBooking(bookingId)
      appToast.success('Booking cancelled.')
      setConfirming(false)
      onUpdated(next)
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not cancel the booking.'))
    } finally {
      setBusy(false)
    }
  }

  const btn = compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'

  const actions = confirming ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-white/80">Cancel this booking for good?</span>
      <button type="button" disabled={busy} onClick={() => void close()}
        className={`rounded-lg font-bold disabled:opacity-40 cursor-pointer ${btn}`}
        style={{ background: ERROR, color: '#000' }}>
        {busy ? 'Cancelling…' : 'Yes, cancel it'}
      </button>
      <button type="button" disabled={busy} onClick={() => setConfirming(false)}
        className={`rounded-lg border font-bold text-white/70 cursor-pointer ${btn}`}
        style={{ borderColor: BORDER_C }}>
        Keep it
      </button>
    </div>
  ) : (
    <div className="flex flex-wrap gap-2">
      <Link href={`/client/booking?resubmit=${encodeURIComponent(bookingId)}`}
        className={`inline-flex items-center gap-1.5 rounded-lg font-bold ${btn}`}
        style={{ background: CYAN, color: '#000' }}>
        <Pencil size={compact ? 12 : 14} /> Edit &amp; Resubmit
      </Link>
      <button type="button" onClick={() => setConfirming(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg border font-bold cursor-pointer ${btn}`}
        style={{ borderColor: `${ERROR}66`, color: ERROR }}>
        <XCircle size={compact ? 12 : 14} /> Cancel Booking
      </button>
    </div>
  )

  if (compact) return actions

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3"
      style={{ borderColor: `${ERROR}55`, background: `${ERROR}0d` }}>
      <div className="flex items-center gap-2">
        <XCircle size={16} style={{ color: ERROR }} />
        <h3 className="text-sm font-bold text-white">
          This booking was not approved{byGm ? ' by the General Manager' : ''}
        </h3>
      </div>
      <div className="flex flex-col gap-1">
        {reason && <p className="text-[13px] text-white/85 whitespace-pre-wrap">Reason: {reason}</p>}
        <span className="text-[11px]" style={{ color: MUTED }}>
          Edit the booking details and resubmit it for another review, or cancel it if you no longer need it.
        </span>
      </div>
      {actions}
    </div>
  )
}
