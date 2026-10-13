'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Trash2, Undo2 } from 'lucide-react'

export type DeleteScope = 'me' | 'everyone'

const COPY: Record<DeleteScope, { title: string; body: string; action: string }> = {
  everyone: {
    title:  'Unsend this message?',
    body:   'It will be removed for everyone in this conversation.',
    action: 'Unsend',
  },
  me: {
    title:  'Delete this message?',
    body:   'It will be deleted for you only. Everyone else in this conversation will still see it.',
    action: 'Delete for me',
  },
}

/**
 * Removing a message, in two steps: choose "Unsend for everyone" (your own
 * messages only) or "Delete for me", then confirm that choice. With only one
 * option open — someone else's message — it goes straight to the confirmation.
 */
export default function ConfirmDeleteDialog({ open, canUnsend, onConfirm, onCancel }: {
  open:      boolean
  /** Your own message: it can be unsent for everyone. */
  canUnsend: boolean
  onConfirm: (scope: DeleteScope) => void
  onCancel:  () => void
}) {
  const [picked, setPicked] = useState<DeleteScope | null>(null)
  // Someone else's message has only one option, so it starts at the confirmation.
  const scope: DeleteScope | null = canUnsend ? picked : 'me'

  // Each opening starts again at the choice.
  const cancel  = () => { setPicked(null); onCancel() }
  const confirm = (s: DeleteScope) => { setPicked(null); onConfirm(s) }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPicked(null); onCancel() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (typeof document === 'undefined') return null

  const copy = scope ? COPY[scope] : null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={e => { if (e.target === e.currentTarget) cancel() }}
          role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title"
        >
          <motion.div
            key={scope ?? 'choose'}
            initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-xs bg-[var(--color-bg)] border border-white/[0.09] rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
          >
            {!copy ? (
              <>
                <h3 id="confirm-delete-title" className="ff-body text-sm font-semibold text-white text-center">Remove this message</h3>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => setPicked('everyone')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 hover:bg-white/[0.04] text-left transition-colors">
                    <Undo2 size={16} className="text-red-400 shrink-0" />
                    <span className="flex flex-col">
                      <span className="ff-body text-sm text-white">Unsend for everyone</span>
                      <span className="ff-body text-[11px] text-white/40">No one in the conversation will see it</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => setPicked('me')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 hover:bg-white/[0.04] text-left transition-colors">
                    <Trash2 size={16} className="text-white/60 shrink-0" />
                    <span className="flex flex-col">
                      <span className="ff-body text-sm text-white">Delete for me</span>
                      <span className="ff-body text-[11px] text-white/40">Others will still see it</span>
                    </span>
                  </button>
                </div>
                <button type="button" onClick={cancel}
                  className="w-full py-2 rounded-xl border border-white/10 ff-body text-sm text-white/70 hover:text-white transition-colors">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-11 h-11 rounded-full bg-red-500/10 flex items-center justify-center">
                    {scope === 'everyone' ? <Undo2 size={18} className="text-red-400" /> : <Trash2 size={18} className="text-red-400" />}
                  </div>
                  <h3 id="confirm-delete-title" className="ff-body text-sm font-semibold text-white">{copy.title}</h3>
                  <p className="ff-body text-xs text-white/50 leading-relaxed">{copy.body}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => (canUnsend ? setPicked(null) : cancel())}
                    className="flex-1 py-2 rounded-xl border border-white/10 ff-body text-sm text-white/70 hover:text-white transition-colors">
                    {canUnsend ? 'Back' : 'Cancel'}
                  </button>
                  <button type="button" onClick={() => confirm(scope!)} autoFocus
                    className="flex-1 py-2 rounded-xl bg-red-500/85 hover:bg-red-500 ff-body text-sm font-medium text-white transition-colors">
                    {copy.action}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
