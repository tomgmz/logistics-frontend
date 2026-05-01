import axios from 'axios'
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL!
const isProd  = process.env.NODE_ENV === 'production'

const accessCookieOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: 'lax' as const,
  path:     '/',
  maxAge:   15 * 60,
}

const refreshCookieOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: 'lax' as const,
  path:     '/',
  maxAge:   7 * 24 * 60 * 60,
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { data } = await axios.post(`${API_URL}/auth/verify-otp`, body, {
      headers: {
        'Content-Type': 'application/json',
        cookie:         req.headers.get('cookie') ?? '',
      },
    })

    const res = NextResponse.json(data)
    res.cookies.set('access_token',  data.data.accessToken,  accessCookieOptions)
    res.cookies.set('refresh_token', data.data.refreshToken, refreshCookieOptions)
    return res

  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(error.response.data, { status: error.response.status })
    }
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}