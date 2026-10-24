'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown } from 'lucide-react'

/**
 * The round arrow-down shown in the middle, just above the message box,
 * whenever the newest message is out of view; it scrolls the thread there.
 * Place inside the composer's `relative` box.
 */
export default function JumpToLatest({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15 }}
          onClick={onClick}
          title="Go to the latest message"
          aria-label="Go to the latest message"
          className="absolute bottom-full left-1/2 z-30 mb-3 flex size-9 -translate-x-1/2 items-center justify-center rounded-full bg-[#222] text-white/80 shadow-xl ring-1 ring-white/15 transition-colors hover:bg-[#2c2c2c] hover:text-white"
        >
          <ArrowDown size={17} />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
