"use client"

import Link from "next/link"
import BookingWizard from "../components/booking/BookingWizard"
import { useBookingClosed } from "@/lib/contract-status"
import { PALETTE } from "@/lib/palette"

export default function BookingPage() {
  // Contract ended (read-only period): no wizard, the server would refuse it anyway.
  const closed = useBookingClosed()

  if (closed) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border p-6 text-center" style={{ borderColor: `${PALETTE.red}66` }}>
          <h2 className="ff-regular text-lg font-bold text-white">Booking is closed</h2>
          <p className="ff-regular mt-2 text-sm leading-relaxed text-white/70">
            Your company&apos;s contract with 8338 has expired, so new bookings and resubmissions are closed until it is renewed.
            Contact 8338 to renew it.
          </p>
          <Link href="/client/history" className="mt-4 inline-block text-sm font-semibold underline underline-offset-2" style={{ color: PALETTE.cyan }}>
            View your Transaction History
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <BookingWizard />
    </div>
  )
}
