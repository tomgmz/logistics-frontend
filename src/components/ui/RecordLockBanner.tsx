'use client'

import { Lock, PauseCircle } from 'lucide-react'
import type { RecordLock } from '@/lib/hooks/useRecordLock'

/**
 * The strip a locked record shows above its fields.
 *
 * `locked`: someone else is editing — say who, and that it unlocks by itself.
 * `paused`: this screen let go of the lock after inactivity — offer it back.
 * Nothing for any other state.
 */
export default function RecordLockBanner({
  lock,
  noun = 'record',
  className = '',
}: {
  lock:       RecordLock
  noun?:      string
  className?: string
}) {
  if (lock.status === 'locked') {
    return (
      <div
        role="status"
        className={`flex items-start gap-2.5 rounded-lg border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2.5 text-xs text-amber-200 ${className}`}
      >
        <Lock size={15} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-bold">
            {lock.holderName ?? 'Another user'} is updating this {noun}.
          </p>
          <p className="text-amber-200/70 mt-0.5">
            Editing is locked until they finish. This view refreshes and unlocks by itself.
          </p>
        </div>
      </div>
    )
  }

  if (lock.status === 'paused') {
    return (
      <div
        role="status"
        className={`flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs text-white/70 ${className}`}
      >
        <PauseCircle size={15} className="shrink-0" />
        <p className="flex-1">Editing paused after inactivity so others can work on this {noun}.</p>
        <button
          type="button"
          onClick={lock.resume}
          className="shrink-0 rounded-md border border-[var(--color-cyan)]/40 px-2.5 py-1 font-bold text-[var(--color-cyan)] hover:bg-[var(--color-cyan)]/10"
        >
          Resume editing
        </button>
      </div>
    )
  }

  return null
}

/** Small pill for list rows: "🔒 Maria". */
export function RecordLockBadge({ holder }: { holder: string | undefined }) {
  if (!holder) return null
  return (
    <span
      title={`${holder} is updating this`}
      className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/[0.08] px-1.5 py-0.5 text-[10px] font-bold text-amber-200 max-w-[140px]"
    >
      <Lock size={10} className="shrink-0" />
      <span className="truncate">{holder}</span>
    </span>
  )
}
