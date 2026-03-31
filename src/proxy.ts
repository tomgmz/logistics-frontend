import { NextRequest, NextResponse } from 'next/server'

const ROLE_ROUTES: Record<string, string> = {
  super_admin:   '/superadmin',
  admin:         '/admin',
  driver:        '/driver',
  helper:        '/helper',
  client:        '/client',
  subcontractor: '/subcontractor',
}

const PUBLIC_PATHS = ['/', '/favicon.ico', '/_next', '/api']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function getRoleFromToken(token: string): string | null {
  try {
    const [, payloadB64] = token.split('.')
    if (!payloadB64) return null

    const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(base64, 'base64').toString('utf-8')
    const payload = JSON.parse(json)

    if (payload.type !== 'access') return null
    if (!payload.exp || Date.now() / 1000 > payload.exp) return null

    return payload.role ?? null
  } catch {
    return null
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow public paths through
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const token = req.cookies.get('access_token')?.value

  console.log('MIDDLEWARE DEBUG:', {
    pathname,
    hasToken: !!token,
    tokenPreview: token?.slice(0, 20),
    allCookies: req.cookies.getAll().map((c) => c.name),
  })

  // No tokenredirect to landing page
  if (!token) {
    const homeUrl = req.nextUrl.clone()
    homeUrl.pathname = '/'
    homeUrl.search = ''
    return NextResponse.redirect(homeUrl)
  }

  const role = getRoleFromToken(token)

  // Invalid or expired token clear cookies and redirect to landing page
  if (!role) {
    const homeUrl = req.nextUrl.clone()
    homeUrl.pathname = '/'
    homeUrl.search = ''
    const res = NextResponse.redirect(homeUrl)
    res.cookies.delete('access_token')
    res.cookies.delete('refresh_token')
    return res
  }

  const allowedPrefix = ROLE_ROUTES[role]

  // Role exists but has no mapped route block access
  if (!allowedPrefix) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Role is trying to access a route they're not allowed redirect to their dashboard
  if (!pathname.startsWith(allowedPrefix)) {
    const dashboardUrl = req.nextUrl.clone()
    dashboardUrl.pathname = allowedPrefix
    return NextResponse.redirect(dashboardUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|proxy|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.svg$|.*\\.ico$|.*\\.webp$).*)',
  ],
}