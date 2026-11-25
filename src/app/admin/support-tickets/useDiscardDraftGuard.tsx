'use client'

import { useCallback, useState } from 'react'
import ReusableModal from '@/components/layout/ReusableModal'

/**
 * Asks before an unsent reply is thrown away (user 2026-11-25): closing the
 * side panel or opening another row while the reply box has text shows
 * "Discard your reply?" first. The reply box reports its text with setDirty.
 *
 *   const draft = useDiscardDraftGuard()
 *   onClose={() => draft.guard(() => setSelectedId(null))}
 *   {draft.modal}
 */
export function useDiscardDraftGuard() {
  const [dirty,   setDirty]   = useState(false)
  const [pending, setPending] = useState<(() => void) | null>(null)

  const guard = useCallback((action: () => void) => {
    if (dirty) setPending(() => action)
    else action()
  }, [dirty])

  const modal = (
    <ReusableModal
      open={!!pending}
      title="Discard your reply?"
      description="You have a reply that hasn't been sent. If you leave, it will be lost."
      confirmLabel="Discard"
      cancelLabel="Keep writing"
      onConfirm={() => {
        const action = pending
        setPending(null)
        setDirty(false)
        action?.()
      }}
      onCancel={() => setPending(null)}
    />
  )

  return { setDirty, guard, modal }
}
