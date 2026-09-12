import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { API_URL, cookieClearOptions, getForwardHeaders } from '../_proxy'

export async function POST(req: NextRequest) {
  try {
    await axios.post(`${API_URL}/auth/logout`, {}, {
      headers: getForwardHeaders(req),
    })
  } catch {
    // Whatever the backend said — or failed to say — the cookies still go. An
    // early return here used to leave them behind, and cookies that outlive the
    // client's session are what proxy.ts bounces back to the portal forever.
  }

  const res = NextResponse.json({ status: 'success', message: 'Logged out successfully' })
  res.cookies.set('access_token',  '', cookieClearOptions)
  res.cookies.set('refresh_token', '', cookieClearOptions)
  res.cookies.set('must_change_pw', '', { ...cookieClearOptions, httpOnly: false })
  return res
}