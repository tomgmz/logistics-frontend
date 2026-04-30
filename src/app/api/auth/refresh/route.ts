import axios from 'axios'
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL!
const isProd  = process.env.NODE_ENV === 'production'

export async function POST(req: NextRequest) {

  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, {
      headers: {
        'Content-Type': 'application/json',
        cookie:         req.headers.get('cookie') ?? '',
      },
    })

    const res = NextResponse.json(data)
    res.cookies.set('access_token', data.data.accessToken, {
      httpOnly: true,
      secure:   isProd,
      sameSite: 'lax',
      path:     '/',
      maxAge:   15 * 60,
    })
    return res

  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      const res = NextResponse.json(error.response.data, { status: error.response.status })
      res.cookies.delete('access_token')
      res.cookies.delete('refresh_token')
      return res
    }
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}