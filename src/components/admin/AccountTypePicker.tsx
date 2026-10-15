'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight } from 'lucide-react'

export interface AccountTypeOption<K extends string> {
  key:   K
  label: string
  hint:  string
}

interface AccountTypePickerProps<K extends string> {
  open:     boolean
  options:  AccountTypeOption<K>[]
  onPick:   (key: K) => void
  onClose:  () => void
}

/**
 * First step of "Add User": choose the kind of account, then the matching form
 * opens. Keeps the create form to the fields that kind actually needs.
 */
export default function AccountTypePicker<K extends string>({
  open, options, onPick, onClose,
}: AccountTypePickerProps<K>) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div key="picker" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-4">
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#4df9ed]">New Account</p>
                <h2 className="mt-0.5 text-lg font-bold text-white">What type of account?</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-2 px-6 py-5">
              {options.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onPick(opt.key)}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-[#424242] px-4 py-3 text-left transition hover:border-[#4df9ed] hover:bg-[#4df9ed]/10"
                >
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-[#4df9ed]">{opt.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#818181]">{opt.hint}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-[#555] group-hover:text-[#4df9ed]" />
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
