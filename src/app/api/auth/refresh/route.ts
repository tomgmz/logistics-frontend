import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import {
  API_URL,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  cookieClearOptions,
  getForwardHeaders,
  handleError,
} from '../_proxy'
import { setTokenCookie, withoutTokens } from '@/lib/server/token-cookies'

export async function POST(req: NextRequest) {
  try {
    // rotate: this build stores the new refresh token the backend hands back
    // (refresh-token rotation, 2026-11-14). The old one stops working.
    const { data } = await axios.post(`${API_URL}/auth/refresh`, { rotate: true }, {
      headers: await getForwardHeaders(req),
    })

    const res = NextResponse.json(withoutTokens(data))
    await setTokenCookie(res, 'access_token', data.data.accessToken, accessTokenCookieOptions)
    if (data.data.refreshToken) {
      // The cookie lives exactly as long as the session: rotating never extends it.
      const endsAt = Date.parse(data.data.refreshExpiresAt ?? '')
      const maxAge = Number.isFinite(endsAt)
        ? Math.max(0, Math.floor((endsAt - Date.now()) / 1000))
        : refreshTokenCookieOptions.maxAge
      await setTokenCookie(res, 'refresh_token', data.data.refreshToken, { ...refreshTokenCookieOptions, maxAge })
    }
    return res

  } catch (error: unknown) {
    // Clear the session cookies only when the backend says the session is over
    // (401). A temporary failure (backend unreachable, slow to wake, 5xx) keeps
    // them: the browser keeps the user signed in too and retries later
    // (isSessionDead in lib/api/auth.api), so cookies and the page never
    // disagree. The reload loop that once made every failure clear the cookies
    // came from the page giving up while the cookies stayed, and it no longer
    // gives up on these.
    const res = handleError(error)
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      res.cookies.set('access_token',  '', cookieClearOptions)
      res.cookies.set('refresh_token', '', cookieClearOptions)
    }
    return res
  }
}
