import { NextRequest, NextResponse } from 'next/server'
import { ROLE_ROUTES } from './constants/roles'

const PUBLIC_PATHS = ['/', '/favicon.ico', '/_next', '/api', '/change-password']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function getRoleFromToken(token: string): string | null {
  try {
    const [, payloadB64] = token.split('.')
    if (!payloadB64) return null

    const base64  = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
    const json    = Buffer.from(base64, 'base64').toString('utf-8')
    const payload = JSON.parse(json)

    // NOTE: This decodes without signature verification — used for routing only.
    // Every sensitive API route must independently verify the token server-side.
    if (payload.type !== 'access' && payload.type !== 'refresh') return null

    return payload.role ?? null
  } catch {
    return null
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // IMPORTANT: must_change_pw check must come before all other checks.
  // If reordered, a user with must_change_pw=1 could be redirected to their
  // portal first, requiring a second redirect to catch them.
  const mustChangePw = req.cookies.get('must_change_pw')?.value === '1'
  if (mustChangePw && !isPublicPath(pathname)) {
    const accessToken = req.cookies.get('access_token')?.value
    const role        = accessToken ? getRoleFromToken(accessToken) : null
    const portal      = role ? (ROLE_ROUTES[role] ?? '/') : '/'
    const dest        = req.nextUrl.clone()
    dest.pathname     = '/change-password'
    dest.search       = `?redirect=${encodeURIComponent(portal)}`
    return NextResponse.redirect(dest)
  }

  // Redirect authenticated users away from landing page
  if (pathname === '/') {
    const accessToken  = req.cookies.get('access_token')?.value
    const refreshToken = req.cookies.get('refresh_token')?.value
    const sessionToken = accessToken ?? refreshToken
    if (sessionToken) {
      const role          = getRoleFromToken(sessionToken)
      const allowedPrefix = role ? ROLE_ROUTES[role] : null
      if (allowedPrefix) {
        const dest    = req.nextUrl.clone()
        dest.pathname = allowedPrefix
        return NextResponse.redirect(dest)
      }
    }
    return NextResponse.next()
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const accessToken  = req.cookies.get('access_token')?.value
  const refreshToken = req.cookies.get('refresh_token')?.value

  // No tokens — redirect to landing page
  if (!accessToken && !refreshToken) {
    const homeUrl    = req.nextUrl.clone()
    homeUrl.pathname = '/'
    homeUrl.search   = ''
    return NextResponse.redirect(homeUrl)
  }

  // Let page load for AuthRehydrator to refresh when access token is gone.
  // AuthRehydrator will call /api/auth/refresh and retry getMe().
  if (!accessToken && refreshToken) {
    return NextResponse.next()
  }

  const role = getRoleFromToken(accessToken!)

  // Let AuthRehydrator refresh if refresh token exists
  if (!role && refreshToken) {
    return NextResponse.next()
  }

  // Access token invalid and no refresh token — clear and redirect
  if (!role) {
    const homeUrl    = req.nextUrl.clone()
    homeUrl.pathname = '/'
    homeUrl.search   = ''
    const res        = NextResponse.redirect(homeUrl)
    res.cookies.delete('access_token')
    return res
  }

  // Role not mapped
  const allowedPrefix = ROLE_ROUTES[role]
  if (!allowedPrefix) {
    const homeUrl    = req.nextUrl.clone()
    homeUrl.pathname = '/'
    homeUrl.search   = ''
    const res        = NextResponse.redirect(homeUrl)
    res.cookies.delete('access_token')
    res.cookies.delete('refresh_token')
    return res
  }

  // User is on the wrong portal for their role — redirect
  if (!pathname.startsWith(allowedPrefix)) {
    const dashboardUrl    = req.nextUrl.clone()
    dashboardUrl.pathname = allowedPrefix
    return NextResponse.redirect(dashboardUrl)
  }

  const res = NextResponse.next()
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|proxy|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.svg$|.*\\.ico$|.*\\.webp$).*)',
  ],
}