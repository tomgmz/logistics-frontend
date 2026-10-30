'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

/** True below lg, where the side panel covers the page instead of sitting beside the table. */
function useIsOverlayWidth(): boolean {
  const [overlay, setOverlay] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 63.99rem)')
    const update = () => setOverlay(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return overlay
}

/**
 * The right-hand detail panel a table row opens (Reports, Tickets), framed like
 * the Transaction History and Booking Management panels: beside the table from
 * lg up, over the page with a backdrop below that. Place it as the last child
 * of the page's flex row, next to the column that holds the table.
 *
 *   [title · subtitle            X]
 *   [body, scrolls on its own      ]
 *   [footer: the actions           ]
 */
export default function SidePanel({
  open,
  onClose,
  label,
  title,
  subtitle,
  children,
  footer,
}: {
  open:      boolean
  onClose:   () => void
  /** The panel's accessible name. */
  label:     string
  title:     ReactNode
  subtitle?: ReactNode
  children:  ReactNode
  footer?:   ReactNode
}) {
  const overlay = useIsOverlayWidth()
  // Only below lg does the panel cover the page; beside the table the page keeps scrolling.
  useBodyScrollLock(open && overlay)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close panel"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[40] bg-black/60 lg:hidden"
          />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            aria-label={label}
            className="fixed lg:relative z-[50] inset-y-0 right-0 w-full max-w-[455px] shrink-0 h-dvh lg:h-auto
                       border-l border-[#424242] flex flex-col bg-[var(--color-surface)] shadow-2xl lg:shadow-none"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.07] shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white uppercase tracking-widest truncate">{title}</h2>
                {subtitle && <p className="text-[11px] text-white/40 mt-0.5">{subtitle}</p>}
              </div>
              <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-white/50" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 p-4 space-y-4 overflow-y-auto overscroll-contain min-h-0">
              {children}
            </div>
            {footer}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
