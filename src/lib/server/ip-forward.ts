import { createHmac } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * The visitor's own IP address, for the backend's rate limits.
 *
 * Requests through the Next proxy reach the backend from Vercel's servers, so
 * every web visitor would otherwise share Vercel's address — one person's
 * failed sign-ins could lock everyone else out ("Too many requests from this
 * network"). Vercel sets x-real-ip / x-forwarded-for to the visitor's address
 * and overwrites anything a browser sends in them, so they can be passed on.
 *
 * Signed with GEO_FORWARD_SECRET (the same value must be set on the backend),
 * with an "ip:" prefix so a signed location header can never pass as one of
 * these. Without the secret nothing is sent and the backend keys on the
 * connecting address as before. See logistics-backend/src/lib/client-ip.ts.
 * The address is only forwarded, never stored or logged.
 */
export function forwardedIpHeaders(req: NextRequest): Record<string, string> {
  const secret = process.env.GEO_FORWARD_SECRET
  const ip     = req.headers.get('x-real-ip')?.trim()
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (!secret || !ip) return {}

  const payload = Buffer.from(JSON.stringify({ ip, ts: Date.now() })).toString('base64url')
  return {
    'X-Client-Ip':     payload,
    'X-Client-Ip-Sig': createHmac('sha256', secret).update(`ip:${payload}`).digest('base64url'),
  }
}
