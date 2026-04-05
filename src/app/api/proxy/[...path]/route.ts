import axios from 'axios'
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL!

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params
  const path = pathSegments.join('/')
  const url  = `${API_URL}/${path}`

  console.log(`[proxy] ${req.method} ${path}`)

  try {
    const body = req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.text()
      : undefined

    const { data } = await axios({
      method:  req.method,
      url,
      headers: {
        'Content-Type': 'application/json',
        cookie:         req.headers.get('cookie') ?? '',
        ...(req.headers.get('x-csrf-token')
          ? { 'X-CSRF-Token': req.headers.get('x-csrf-token')! }
          : {}),
      },
      data: body,
    })

    return NextResponse.json(data)

  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(error.response.data, { status: error.response.status })
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