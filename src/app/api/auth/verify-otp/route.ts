import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { API_URL, accessTokenCookieOptions, refreshTokenCookieOptions, getForwardHeaders, handleError } from '../_proxy'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { data } = await axios.post(`${API_URL}/auth/verify-otp`, body, {
      headers: getForwardHeaders(req),
    })

    const res = NextResponse.json(data)
    res.cookies.set('access_token',  data.data.accessToken,  accessTokenCookieOptions)
    res.cookies.set('refresh_token', data.data.refreshToken, refreshTokenCookieOptions)
    return res

  } catch (error: unknown) {
    return handleError(error)
  }
}