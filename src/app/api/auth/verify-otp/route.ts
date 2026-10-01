import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import {
  API_URL,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  mustChangePwCookieOptions,
  getForwardHeaders,
  handleError,
} from '../_proxy'
import { setTokenCookie, withoutTokens } from '@/lib/server/token-cookies'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { data } = await axios.post(`${API_URL}/auth/verify-otp`, body, {
      headers: await getForwardHeaders(req),
    })

    const res = NextResponse.json(withoutTokens(data))
    await setTokenCookie(res, 'access_token',  data.data.accessToken,  accessTokenCookieOptions)
    await setTokenCookie(res, 'refresh_token', data.data.refreshToken, refreshTokenCookieOptions)

    if (data.data.user?.must_change_password) {
      res.cookies.set('must_change_pw', '1', mustChangePwCookieOptions)
    }

    return res
  } catch (error: unknown) {
    return handleError(error)
  }
}