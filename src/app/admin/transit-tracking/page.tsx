import type { Metadata } from 'next'
import TransitTrackingView from './TransitTrackingView'

export const metadata: Metadata = {
  title: 'Transit Tracking',
}

export default function AdminTransitTrackingPage() {
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[var(--color-bg)]">
      <TransitTrackingView />
    </div>
  )
}
