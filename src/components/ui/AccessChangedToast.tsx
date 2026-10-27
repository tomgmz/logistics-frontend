'use client'

import { ShieldCheck, X } from 'lucide-react'
import { rawToast } from '@/lib/toast'

const TOAST_ID = 'access-changed'

/**
 * Tells a staff member their Manage Access permissions were just changed. It
 * stays until they close it with the X: no timer, and tapping the body does
 * nothing, so the notice can't slip past unread. A second change while it is
 * open replaces it rather than stacking.
 */
export function showAccessChangedToast(): void {
  rawToast(
    (t) => (
      <div className="flex items-start gap-3">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#4df9ed]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">Your access has been changed</p>
          <p className="mt-0.5 text-[13px] font-normal leading-snug text-white/60">
            Some pages or actions may now be different. What you can see and do follows your new access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => rawToast.dismiss(t.id)}
          aria-label="Close"
          className="-mr-2 -mt-1.5 shrink-0 rounded-lg p-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    ),
    {
      id:       TOAST_ID,
      duration: Infinity,
      style:    { border: '1px solid rgba(77,249,237,0.25)' },
    },
  )
}
