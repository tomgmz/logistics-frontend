import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import {
  API_URL,
  accessTokenCookieOptions,
  cookieClearOptions,
  getForwardHeaders,
  handleError,
} from '../_proxy'
import { setTokenCookie, withoutTokens } from '@/lib/server/token-cookies'

export async function POST(req: NextRequest) {
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, {
      headers: await getForwardHeaders(req),
    })

    const res = NextResponse.json(withoutTokens(data))
    await setTokenCookie(res, 'access_token', data.data.accessToken, accessTokenCookieOptions)
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
