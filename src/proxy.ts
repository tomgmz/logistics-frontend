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

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const token = req.cookies.get('access_token')?.value

  if (!token) {
    const homeUrl = req.nextUrl.clone()
    homeUrl.pathname = '/'
    homeUrl.search = ''
    return NextResponse.redirect(homeUrl)
  }

  const role = getRoleFromToken(token)

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

  if (!allowedPrefix) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!pathname.startsWith(allowedPrefix)) {
    const dashboardUrl = req.nextUrl.clone()
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

export default proxy