import { readFile } from 'fs/promises'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { openToken } from '@/lib/server/token-cookies'

/**
 * The system user guide PDF, opened in a new tab from the Profile page
 * (2026-11-23). Shown inline so the browser's own PDF viewer opens it.
 *
 * Signed-in people only. The file lives in /private, not /public, so the only
 * way to it is this handler, and the handler wants one of our sealed session
 * cookies whose token has not expired. A cookie only opens if this server
 * sealed it, so it cannot be forged; a session revoked elsewhere can still open
 * the guide until its token runs out, which is accepted (the guide holds no
 * account data). Signed out: back to the landing page.
 *
 * To update the guide: rebuild it from t:\CP\docs\user-guide and copy the PDF
 * over private/user-guide.pdf. next.config.js lists the file for the server
 * bundle (outputFileTracingIncludes).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = path.join(process.cwd(), 'private', 'user-guide.pdf')

/** True when the JWT's `exp` is still ahead. Unreadable = not live. */
function notExpired(jwt: string | null): boolean {
  if (!jwt) return false
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf-8'))
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const access  = await openToken('access_token',  req.cookies.get('access_token')?.value)
  const refresh = await openToken('refresh_token', req.cookies.get('refresh_token')?.value)
  if (!notExpired(access) && !notExpired(refresh)) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  let pdf: Buffer
  try {
    pdf = await readFile(FILE)
  } catch (err) {
    console.error('[user-guide] PDF missing from the build', err)
    return new NextResponse('The user guide is not available right now.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'inline; filename="8338 System User Guide.pdf"',
      'Content-Length':      String(pdf.length),
      // Private: never kept by a shared cache. Short, so a new edition shows soon.
      'Cache-Control':       'private, max-age=300',
      'X-Robots-Tag':        'noindex',
    },
  })
}
