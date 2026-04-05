'use client'

import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'

const RouteMap = dynamic(() => import('./RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--color-bg)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="text-center"
      >
        <div
          className="w-14 h-14 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4"
          style={{ borderColor: 'var(--color-cyan)' }}
        />
        <p className="ff-body text-gray-400 text-sm font-medium tracking-wide">Loading tracking…</p>
      </motion.div>
    </div>
  ),
})

export default function RouteMapWrapper({ initialBookingId }: { initialBookingId?: string }) {
  return <RouteMap initialBookingId={initialBookingId} />
}