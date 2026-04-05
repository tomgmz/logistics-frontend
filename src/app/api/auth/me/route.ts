import axios from 'axios'
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL!

export async function GET(req: NextRequest) {
  try {
    const { data } = await axios.get(`${API_URL}/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        cookie:         req.headers.get('cookie') ?? '',
      },
    })

    return NextResponse.json(data)

  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(error.response.data, { status: error.response.status })
    }
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
}