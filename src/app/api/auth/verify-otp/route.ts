import axios from 'axios'
import { NextRequest, NextResponse } from 'next/server'
import { API_URL, getForwardHeaders, handleError, cookieOptions } from '../_proxy'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { data } = await axios.post(`${API_URL}/auth/verify-otp`, body, {
      headers: getForwardHeaders(req),
    })

    const res = NextResponse.json(data)
    res.cookies.set('access_token',  data.data.accessToken,  cookieOptions)
    res.cookies.set('refresh_token', data.data.refreshToken, cookieOptions)
    return res

  } catch (error) {
    return handleError(error)
  }
}