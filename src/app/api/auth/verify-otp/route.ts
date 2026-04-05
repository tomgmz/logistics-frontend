import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL!

export async function POST(req: NextRequest) {
  const body = await req.json()

  const upstream = await fetch(`${API_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
    body: JSON.stringify(body),
  })

  const data = await upstream.json()

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status })
  }

  const res = NextResponse.json(data)

  const isProd = process.env.NODE_ENV === 'production'

  const cookieOptions = {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'lax' as const,
    path:     '/',
    maxAge:   7 * 24 * 60 * 60,
  }

  res.cookies.set('access_token',  data.data.accessToken,  cookieOptions)
  res.cookies.set('refresh_token', data.data.refreshToken, cookieOptions)

  return res
}