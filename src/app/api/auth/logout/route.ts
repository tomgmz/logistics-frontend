import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { API_URL, cookieClearOptions, getForwardHeaders, handleError } from '../_proxy'

export async function POST(req: NextRequest) {
  try {
    await axios.post(`${API_URL}/auth/logout`, {}, {
      headers: getForwardHeaders(req),
    })
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status !== 401) {
      return handleError(error)
    }
  }

  const res = NextResponse.json({ status: 'success', message: 'Logged out successfully' })
  res.cookies.set('access_token',  '', cookieClearOptions)
  res.cookies.set('refresh_token', '', cookieClearOptions)
  return res
}