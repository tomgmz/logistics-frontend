/**
 * Leaving for the landing page after the session has gone bad.
 *
 * The marker in the URL is the point. src/proxy.ts routes on the session
 * cookies alone, so whenever those cookies outlive the client's idea of the
 * session it answers this navigation with a redirect back to the portal we are
 * trying to leave — which mounts the app, which gives up on the session again,
 * which navigates here again: a full page reload roughly once a second.
 *
 * '?signedout=1' tells the middleware to let '/' through once and drop the
 * cookies on the way, so the disagreement is settled instead of repeated.
 */
export const SIGNED_OUT_PARAM = 'signedout'

/**
 * Why the session ended, so the landing page can say something truthful.
 *
 * 'inactive' means the backend refused the request with ACCOUNT_INACTIVE: the
 * account was deactivated or its role changed while the user was still signed
 * in. That is not an expired session, and telling someone their session timed
 * out when an admin has actually disabled their account sends them to retry
 * their password over and over.
 */
export const SIGNED_OUT_REASON_PARAM = 'reason'
export type SignedOutReason = 'inactive'

export function goHomeSignedOut(reason?: SignedOutReason): void {
  if (typeof window === 'undefined') return
  const suffix = reason ? `&${SIGNED_OUT_REASON_PARAM}=${reason}` : ''
  window.location.replace(`/?${SIGNED_OUT_PARAM}=1${suffix}`)
}
