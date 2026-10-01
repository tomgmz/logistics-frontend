import { createHmac } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * The visitor's approximate location, for the backend's security emails.
 *
 * Requests through the Next proxy reach the backend from Vercel's servers, so
 * the backend's own lookup of req.ip would place every web user in a data
 * centre. Vercel already knows the visitor's city and country (x-vercel-ip-*
 * headers); this passes just those on, never the IP.
 *
 * The header is ALWAYS sent on the routes that use it, because its presence is
 * what tells the backend not to trust req.ip. It is signed with
 * GEO_FORWARD_SECRET (the same value must be set on the backend); without the
 * secret it goes unsigned and the backend simply leaves the location out.
 * See logistics-backend/src/lib/ip-location.ts.
 */
export function forwardedGeoHeaders(req: NextRequest): Record<string, string> {
  const payload = Buffer.from(JSON.stringify({
    city:    decodeHeader(req.headers.get('x-vercel-ip-city')),
    country: req.headers.get('x-vercel-ip-country'),
    ts:      Date.now(),
  })).toString('base64url')

  const secret  = process.env.GEO_FORWARD_SECRET
  const headers: Record<string, string> = { 'X-Client-Geo': payload }
  if (secret) {
    headers['X-Client-Geo-Sig'] = createHmac('sha256', secret).update(payload).digest('base64url')
  }
  return headers
}

/** Vercel URI-encodes the city ("San%20Pablo%20City"). */
function decodeHeader(value: string | null): string | null {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}
