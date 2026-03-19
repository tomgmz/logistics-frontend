'use client'

import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'

const RouteMap = dynamic(
  () => import('./RouteMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-[#1a1a1a]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center"
        >
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 font-medium">Loading map...</p>
        </motion.div>
      </div>
    ),
  }
)

export default function RouteMapWrapper({ bookingId }: { bookingId: string }) {
  return <RouteMap bookingId={bookingId} />
}