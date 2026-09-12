import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import {
  API_URL,
  accessTokenCookieOptions,
  cookieClearOptions,
  getForwardHeaders,
  handleError,
} from '../_proxy'

export async function POST(req: NextRequest) {
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, {
      headers: getForwardHeaders(req),
    })

    const res = NextResponse.json(data)
    res.cookies.set('access_token', data.data.accessToken, accessTokenCookieOptions)
    return res

  } catch (error: unknown) {
    // Clear the session cookies on *any* failure, not just the ones the backend
    // answered. An unreachable backend used to leave access_token/refresh_token
    // in place while the client had already given up on the session — and
    // proxy.ts reads those cookies alone, so it bounced every "go home"
    // redirect straight back to the portal and the page reloaded in a loop.
    const res = handleError(error)
    res.cookies.set('access_token',  '', cookieClearOptions)
    res.cookies.set('refresh_token', '', cookieClearOptions)
    return res
  }
}
