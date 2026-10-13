'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'

/**
 * "Delete this message?" — asked before any message is removed. Deleting is
 * only ever for the person doing it: everyone else in the conversation keeps
 * the message, and the dialog says so.
 */
export default function ConfirmDeleteDialog({ open, onConfirm, onCancel }: {
  open:      boolean
  onConfirm: () => void
  onCancel:  () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter')  onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onConfirm, onCancel])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={e => { if (e.target === e.currentTarget) onCancel() }}
          role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-xs bg-[var(--color-bg)] border border-white/[0.09] rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
          >
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-11 h-11 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <h3 id="confirm-delete-title" className="ff-body text-sm font-semibold text-white">Delete this message?</h3>
              <p className="ff-body text-xs text-white/50 leading-relaxed">
                It will be deleted for you only. Everyone else in this conversation will still see it.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onCancel}
                className="flex-1 py-2 rounded-xl border border-white/10 ff-body text-sm text-white/70 hover:text-white transition-colors">
                Cancel
              </button>
              <button type="button" onClick={onConfirm} autoFocus
                className="flex-1 py-2 rounded-xl bg-red-500/85 hover:bg-red-500 ff-body text-sm font-medium text-white transition-colors">
                Delete for me
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
