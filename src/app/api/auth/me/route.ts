import axios from 'axios'
import { NextRequest, NextResponse } from 'next/server'
import { API_URL, getForwardHeaders, handleError } from '../_proxy'

export async function GET(req: NextRequest) {
  try {
    const { data } = await axios.get(`${API_URL}/auth/me`, {
      headers: getForwardHeaders(req),
    })
    return NextResponse.json(data)
  } catch (error) {
    return handleError(error)
  }
}