'use client'

import { useCallback, useRef, useState } from 'react'
import ReusableModal from '@/components/layout/ReusableModal'

/**
 * The two questions every data-entry form asks (user 2026-11-27):
 *
 *  - Closing with changes: "Discard changes?" (Material / Apple HIG: ask only
 *    when something would be lost; close quietly when nothing changed).
 *  - Submitting with changes: "Save changes?" / the form's own wording, then
 *    the save runs. With nothing changed there is nothing to confirm; edit
 *    forms keep Save disabled then.
 *
 *   const guard = useFormGuard(isDirty)
 *   onClose={() => guard.requestClose(onClose)}
 *   onClick={() => guard.confirmSubmit(save, { title: 'Save this vehicle?' })}
 *   {guard.modal}
 *
 * `isDirty` is the form's own "differs from what it opened with" check.
 */
export interface SubmitQuestion {
  title?:        string
  description?:  string
  confirmLabel?: string
}

export function useFormGuard(isDirty: boolean, opts: { zClassName?: string } = {}) {
  const [ask, setAsk] = useState<null | { kind: 'close' | 'submit'; q: SubmitQuestion }>(null)
  const action = useRef<(() => void) | null>(null)

  const requestClose = useCallback((close: () => void) => {
    if (!isDirty) { close(); return }
    action.current = close
    setAsk({ kind: 'close', q: {} })
  }, [isDirty])

  const confirmSubmit = useCallback((submit: () => void, q: SubmitQuestion = {}) => {
    if (!isDirty) { submit(); return }
    action.current = submit
    setAsk({ kind: 'submit', q })
  }, [isDirty])

  const done = () => {
    const run = action.current
    action.current = null
    setAsk(null)
    run?.()
  }

  const modal = (
    <ReusableModal
      open={!!ask}
      zClassName={opts.zClassName ?? 'z-[95]'}
      title={ask?.kind === 'close' ? 'Discard changes?' : ask?.q.title ?? 'Save changes?'}
      description={ask?.kind === 'close'
        ? 'Your changes have not been saved. If you close now, they will be lost.'
        : ask?.q.description ?? 'Please check the details before you save.'}
      confirmLabel={ask?.kind === 'close' ? 'Discard' : ask?.q.confirmLabel ?? 'Save'}
      cancelLabel={ask?.kind === 'close' ? 'Keep editing' : 'Go back'}
      onConfirm={done}
      onCancel={() => { action.current = null; setAsk(null) }}
    />
  )

  return { requestClose, confirmSubmit, modal, asking: !!ask }
}
