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

  const search = req.nextUrl.search
  const url    = `${API_URL}/${path}${search}`

  const contentType = req.headers.get('content-type') ?? ''
  const isMultipart = contentType.includes('multipart/form-data')

  try {
    let body: string | FormData | undefined
    let forwardedContentType: string = 'application/json'

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (isMultipart) {
        body = await req.formData()
        // Don't set Content-Type — axios will set multipart + boundary automatically
        forwardedContentType = ''
      } else {
        const text = await req.text()
        body = text.length > 0 ? text : undefined
        forwardedContentType = 'application/json'
      }
    }

    const axiosRes = await axios({
      method:  req.method,
      url,
      headers: {
        ...(forwardedContentType ? { 'Content-Type': forwardedContentType } : {}),
        cookie: req.headers.get('cookie') ?? '',
        ...(req.headers.get('x-csrf-token')
          ? { 'X-CSRF-Token': req.headers.get('x-csrf-token')! }
          : {}),
      },
      data: body,
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