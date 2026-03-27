import { NextRequest, NextResponse } from 'next/server'

const ROLE_ROUTES: Record<string, string> = {
  super_admin:   '/superadmin',
  admin:         '/admin',
  driver:        '/driver',
  helper:        '/helper',
  client:        '/client',
  subcontractor: '/subcontractor',
}

const PUBLIC_PATHS = ['/login', '/favicon.ico', '/_next', '/api']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
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

// Must be exported as `middleware` for Next.js to pick it up
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const token = req.cookies.get('access_token')?.value

  if (!token) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = getRoleFromToken(token)

  if (!role) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    const res = NextResponse.redirect(loginUrl)
    res.cookies.delete('access_token')
    res.cookies.delete('refresh_token')
    return res
  }

  const allowedPrefix = ROLE_ROUTES[role]

  if (!allowedPrefix) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!pathname.startsWith(allowedPrefix)) {
    const dashboardUrl = req.nextUrl.clone()
    dashboardUrl.pathname = allowedPrefix
    return NextResponse.redirect(dashboardUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}