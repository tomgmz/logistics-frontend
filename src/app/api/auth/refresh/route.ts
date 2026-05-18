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
    if (axios.isAxiosError(error) && error.response) {
      const res = NextResponse.json(error.response.data, { status: error.response.status })
      res.cookies.set('access_token',  '', cookieClearOptions)
      res.cookies.set('refresh_token', '', cookieClearOptions)
      return res
    }
    return handleError(error)
  }
}