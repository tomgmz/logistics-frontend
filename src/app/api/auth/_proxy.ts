import axios from 'axios'
import { NextRequest, NextResponse } from 'next/server'
import { backendCookieHeader } from '@/lib/server/token-cookies'
import { forwardedIpHeaders } from '@/lib/server/ip-forward'

export const API_URL = process.env.NEXT_PUBLIC_API_URL!
export const isProd  = process.env.NODE_ENV === 'production'

// Browser tests serve the BUILT app on plain http://localhost, where WebKit
// drops `Secure` cookies (Chrome and Firefox make an exception for localhost).
// Only that setup turns Secure off: it needs the test flag AND a localhost API,
// so a deployed build (https API, no flag) always sets Secure.
const localHttpTest = process.env.E2E_LOCAL_HTTP === '1' && /^http:\/\/localhost[:/]/.test(API_URL ?? '')
const secureCookies = isProd && !localHttpTest

export const accessTokenCookieOptions = {
  httpOnly: true,
  secure:   secureCookies,
  sameSite: 'strict' as const,
  path:     '/',
  maxAge:   15 * 60,
}

export const refreshTokenCookieOptions = {
  httpOnly: true,
  secure:   secureCookies,
  sameSite: 'strict' as const,
  path:     '/',
  maxAge:   7 * 24 * 60 * 60,
}

export const cookieClearOptions = {
  httpOnly: true,
  secure:   secureCookies,
  sameSite: 'strict' as const,
  path:     '/',
  maxAge:   0,
}

export const mustChangePwCookieOptions = {
  httpOnly: false,
  secure:   secureCookies,
  sameSite: 'strict' as const,
  path:     '/',
  maxAge:   60 * 60,
}

// The session cookies are encrypted in the browser; the backend gets them
// decrypted (see lib/server/token-cookies).
export async function getForwardHeaders(req: NextRequest) {
  return {
    'Content-Type':  'application/json',
    cookie:          await backendCookieHeader(req),
    // Forward CSRF token to backend on all auth routes
    ...(req.headers.get('x-csrf-token')
      ? { 'X-CSRF-Token': req.headers.get('x-csrf-token')! }
      : {}),
    // Rate limits key on the visitor, not on Vercel. See lib/server/ip-forward.
    ...forwardedIpHeaders(req),
  }
}

export function handleError(error: unknown) {
  if (axios.isAxiosError(error) && error.response) {
    return NextResponse.json(error.response.data, { status: error.response.status })
  }
  // Not the backend answering — e.g. a missing COOKIE_ENCRYPTION_KEY. Say so in
  // the server log; the browser only needs to know it failed.
  console.error('[auth proxy] error:', error)
  return NextResponse.json(
    { status: 'error', message: 'Internal server error' },
    { status: 500 },
  )
}