import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { API_URL, isProd, getForwardHeaders, handleError } from '../_proxy'

const COOKIE_CLEAR = {
  httpOnly: true,
  secure:   isProd,
  sameSite: 'lax' as const,
  path:     '/',
  maxAge:   0,
}

export async function POST(req: NextRequest) {
  try {
    await axios.post(`${API_URL}/auth/logout-all`, {}, {
      headers: getForwardHeaders(req),
    })
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status !== 401) {
      return handleError(error)
    }
  }

  const res = NextResponse.json({ status: 'success', message: 'Logged out from all devices' })
  res.cookies.set('access_token',  '', COOKIE_CLEAR)
  res.cookies.set('refresh_token', '', COOKIE_CLEAR)
  return res
}