import axios from 'axios'
import { NextRequest, NextResponse } from 'next/server'
import { API_URL, getForwardHeaders, handleError, cookieOptions } from '../_proxy'

export async function POST(req: NextRequest) {
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, {
      headers: getForwardHeaders(req),
    })

    const res = NextResponse.json(data)
    res.cookies.set('access_token', data.data.accessToken, cookieOptions)
    return res

  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const res = NextResponse.json(error.response.data, { status: error.response.status })
      res.cookies.delete('access_token')
      res.cookies.delete('refresh_token')
      return res
    }
    return handleError(error)
  }
}