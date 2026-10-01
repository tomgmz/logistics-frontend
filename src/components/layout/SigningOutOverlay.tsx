'use client'

import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * Full-screen loader shown once the user has confirmed "Sign Out", covering the
 * dashboard until the browser leaves for the landing page — so the confirm
 * modal does not sit there frozen while logout() and web-push cleanup run.
 *
 * Portalled to <body> so no transformed ancestor (the animated sidebar) can
 * turn `fixed` into "fixed to that ancestor".
 */
export default function SigningOutOverlay({ open }: { open: boolean }) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="signing-out"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-[#0a0a0a]/90 backdrop-blur-sm"
        >
          <span className="inline-block w-8 h-8 border-2 border-white/15 border-t-[#4df9ed] rounded-full animate-spin" />
          <span className="font-spartan text-white/50 text-[0.75rem] tracking-[0.2em] uppercase">
            Signing out…
          </span>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
