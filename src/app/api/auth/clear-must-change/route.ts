import { NextRequest, NextResponse } from 'next/server'
import { cookieClearOptions } from '../_proxy'

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('must_change_pw', '', { ...cookieClearOptions, httpOnly: false })
  return res
}