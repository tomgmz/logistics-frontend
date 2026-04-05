import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL!

export async function POST(req: NextRequest) {
  const upstream = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
  })

  const data = await upstream.json()

  if (!upstream.ok) {
    const res = NextResponse.json(data, { status: upstream.status })
    res.cookies.delete('access_token')
    res.cookies.delete('refresh_token')
    return res
  }

  const res = NextResponse.json(data)

  const isProd = process.env.NODE_ENV === 'production'

  res.cookies.set('access_token', data.data.accessToken, {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'lax',
    path:     '/',
    maxAge:   7 * 24 * 60 * 60,
  })

  return res
}