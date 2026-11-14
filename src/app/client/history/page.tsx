import type { Metadata } from 'next'
import BookingHistoryModule from "./BookingHistoryModule"

export const metadata: Metadata = {
  title: 'Transaction History',
}

export default function HistoryPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <BookingHistoryModule />
    </div>
  )
}
 