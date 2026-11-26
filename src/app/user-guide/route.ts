import { readFile } from 'fs/promises'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { openToken } from '@/lib/server/token-cookies'
import { roleLabel } from '@/lib/roles'

/**
 * The user guide PDF for the signed-in person's role, opened in a new tab from
 * the Profile page. Shown inline so the browser's own PDF viewer opens it.
 *
 * One guide per role (2026-11-26; before that everyone got the whole-system
 * guide, staff procedures included). The role comes from the session token: the
 * cookie is sealed by this server (AES-GCM, token-cookies.ts), so it cannot be
 * forged or swapped for another role. A role with no guide gets a 404, never
 * someone else's guide.
 *
 * Signed-in people only. The files live in /private, not /public, so the only
 * way to them is this handler. A session revoked elsewhere can still open the
 * guide until its token runs out, which is accepted (a guide holds no account
 * data). Signed out: back to the landing page.
 *
 * To update the guides: rebuild them (t:\CP\docs\user-guide\roles\build_roles.py
 * writes t:\CP\User Guides) and copy each PDF over private/user-guides/<role>.pdf.
 * next.config.js lists the folder for the server bundle (outputFileTracingIncludes).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DIR = path.join(process.cwd(), 'private', 'user-guides')

/** Roles with a guide; the file is `<role>.pdf`. A fixed list, so the role never builds a path. */
const GUIDE_ROLES = new Set([
  'it_admin', 'admin', 'general_manager', 'operations_manager', 'fleet_manager', 'client', 'driver',
])

/** The token's role while its `exp` is still ahead. Unreadable or expired = null. */
function liveRole(jwt: string | null): string | null {
  if (!jwt) return null
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf-8'))
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function text(status: number, body: string) {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  const access  = await openToken('access_token',  req.cookies.get('access_token')?.value)
  const refresh = await openToken('refresh_token', req.cookies.get('refresh_token')?.value)
  const role = liveRole(access) ?? liveRole(refresh)
  if (!role) return NextResponse.redirect(new URL('/', req.url))

  if (!GUIDE_ROLES.has(role)) return text(404, 'There is no user guide for your role yet.')

  let pdf: Buffer
  try {
    pdf = await readFile(path.join(DIR, `${role}.pdf`))
  } catch (err) {
    console.error(`[user-guide] ${role}.pdf missing from the build`, err)
    return text(503, 'The user guide is not available right now.')
  }

  const filename = `8338 User Guide - ${roleLabel(role)}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length':      String(pdf.length),
      // Private: never kept by a shared cache. Short, so a new edition shows soon.
      // Vary on Cookie so a browser shared by two accounts never shows the
      // previous person's guide from its cache.
      'Cache-Control':       'private, max-age=300',
      'Vary':                'Cookie',
      'X-Robots-Tag':        'noindex',
    },
  })
}
