'use client'

import Link from 'next/link'
import { Clock, Pencil } from 'lucide-react'

import type { BookingWithRelations } from '@/lib/types/booking-relations'
import { isEditablePending } from '@/lib/booking-resubmit'
import { useBookingClosed } from '@/lib/contract-status'
import { bookingQuery } from '@/lib/booking-url'
import { BORDER_C, CYAN, MUTED } from './transaction-theme'

/**
 * A booking still waiting for the General Manager is the client's to change
 * (user 2026-11-27): Edit Booking opens the booking wizard filled in with it
 * (`?edit=`), and saving keeps the same number and its place in the queue. Once
 * it is approved or rejected this disappears; the server refuses an edit then
 * too (POST /booking/:id/edit). Renders nothing for any other booking, or when
 * the contract has ended (no new booking work then).
 */
export default function PendingEditPanel({ booking }: { booking: BookingWithRelations }) {
  const bookingClosed = useBookingClosed()
  if (!isEditablePending(booking) || bookingClosed) return null

  const href = `/client/booking${bookingQuery({
    booking_id:       booking.booking_id as string,
    reference_number: booking.reference_number as string | null | undefined,
  }, 'edit')}`

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: BORDER_C, background: `${CYAN}0a` }}>
      <div className="flex items-start gap-2 min-w-0">
        <Clock size={16} className="shrink-0 mt-0.5" style={{ color: CYAN }} />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">Waiting for approval</h3>
          <span className="text-[11px]" style={{ color: MUTED }}>
            You can still change any detail until it is approved. After that, ask our team through the help assistant.
          </span>
        </div>
      </div>
      <Link href={href}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold min-h-[40px]"
        style={{ background: CYAN, color: '#000' }}>
        <Pencil size={14} /> Edit Booking
      </Link>
    </div>
  )
}
