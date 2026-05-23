import axios from 'axios'
import { NextRequest, NextResponse } from 'next/server'

export const API_URL = process.env.NEXT_PUBLIC_API_URL!
export const isProd  = process.env.NODE_ENV === 'production'

export const accessTokenCookieOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: 'strict' as const,
  path:     '/',
  maxAge:   15 * 60,
}

export const refreshTokenCookieOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: 'strict' as const,
  path:     '/',
  maxAge:   7 * 24 * 60 * 60,
}

export const cookieClearOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: 'strict' as const,
  path:     '/',
  maxAge:   0,
}

export const mustChangePwCookieOptions = {
  httpOnly: false,
  secure:   isProd,
  sameSite: 'strict' as const,
  path:     '/',
  maxAge:   60 * 60,
}

export function getForwardHeaders(req: NextRequest) {
  return {
    'Content-Type':  'application/json',
    cookie:          req.headers.get('cookie') ?? '',
    // Forward CSRF token to backend on all auth routes
    ...(req.headers.get('x-csrf-token')
      ? { 'X-CSRF-Token': req.headers.get('x-csrf-token')! }
      : {}),
  }
}

export function handleError(error: unknown) {
  if (axios.isAxiosError(error) && error.response) {
    return NextResponse.json(error.response.data, { status: error.response.status })
  }
  return NextResponse.json(
    { status: 'error', message: 'Internal server error' },
    { status: 500 },
  )
}