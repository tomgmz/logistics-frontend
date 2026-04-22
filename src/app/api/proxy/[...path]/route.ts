import axios, { type AxiosResponse } from 'axios'
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL!


function forwardSetCookieHeaders(nextRes: NextResponse, axiosRes: AxiosResponse) {
  const raw = axiosRes.headers['set-cookie']
  if (!raw) return
  const cookies = Array.isArray(raw) ? raw : [raw]
  for (const cookie of cookies) {
    if (cookie) nextRes.headers.append('Set-Cookie', cookie)
  }
}

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params
  const path = pathSegments.join('/')
  const url  = `${API_URL}/${path}`

  try {
    const bodyText = req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.text()
      : undefined

    const axiosRes = await axios({
      method:  req.method,
      url,
      headers: {
        'Content-Type': 'application/json',
        cookie:         req.headers.get('cookie') ?? '',
        ...(req.headers.get('x-csrf-token')
          ? { 'X-CSRF-Token': req.headers.get('x-csrf-token')! }
          : {}),
      },
      data: bodyText && bodyText.length > 0 ? bodyText : undefined,
    })

    const nextRes = NextResponse.json(axiosRes.data)
    forwardSetCookieHeaders(nextRes, axiosRes)
    return nextRes

  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      const nextRes = NextResponse.json(error.response.data, { status: error.response.status })
      forwardSetCookieHeaders(nextRes, error.response)
      return nextRes
    }
    console.error(`[proxy] error:`, error)
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET    = handler
export const POST   = handler
export const PUT    = handler
export const PATCH  = handler
export const DELETE = handler