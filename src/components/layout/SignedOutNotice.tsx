'use client'

import { useEffect } from 'react'
import { SIGNED_OUT_PARAM, SIGNED_OUT_REASON_PARAM } from '@/lib/auth-redirect'
import { appToast } from '@/lib/toast'

/**
 * Explains an involuntary sign-out on the page the user is dropped onto.
 *
 * goHomeSignedOut() sends everyone here with '?signedout=1', which previously
 * said nothing about why. A user whose account was deactivated saw the ordinary
 * landing page and, having no reason to think otherwise, tried their password
 * again — and again — because nothing told them the account itself was off.
 *
 * Shown as the app's own toast (lib/toast), so it fades out by itself like
 * every other notice. Read from window rather than useSearchParams so this does
 * not force the marketing page into a Suspense boundary; it fires after
 * hydration, which is soon enough for a message nobody is waiting on.
 */
const INACTIVE_MESSAGE =
  'Your account is no longer active. Signing in again will not restore access — please contact your Administrator.'

const DEFAULT_MESSAGE = 'You have been signed out.'

export default function SignedOutNotice() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get(SIGNED_OUT_PARAM) !== '1') return

    // The fixed key keeps React's dev double-run of this effect from stacking
    // two toasts.
    const reason = params.get(SIGNED_OUT_REASON_PARAM)
    if (reason === 'inactive') {
      // Longer than a routine error: it is the one that changes what the user
      // should do next, and it takes a moment to read.
      appToast.error(INACTIVE_MESSAGE, { action: 'signed-out', duration: 8000 })
    } else {
      appToast.info(DEFAULT_MESSAGE, { action: 'signed-out' })
    }

    // Drop the markers so a refresh or a shared link does not replay the
    // notice. The proxy has already consumed '?signedout=1' by this point.
    params.delete(SIGNED_OUT_PARAM)
    params.delete(SIGNED_OUT_REASON_PARAM)
    const qs = params.toString()
    window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }, [])

  return null
}
