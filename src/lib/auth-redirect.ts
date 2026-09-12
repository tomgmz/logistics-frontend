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

export function goHomeSignedOut(): void {
  if (typeof window === 'undefined') return
  window.location.replace(`/?${SIGNED_OUT_PARAM}=1`)
}
