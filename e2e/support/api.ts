import fs from 'node:fs'
import path from 'node:path'
import { request, expect, type APIRequestContext } from '@playwright/test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedPassword, seedEmail } = require('./env.cjs')

/**
 * Direct calls to the TEST backend (http://localhost:4100/api), signed in as a
 * seeded account with a Bearer token, the way the mobile app calls it (no
 * cookies, so no CSRF token needed). Used to set up data and to play the
 * driver, whose app is not a website.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const API = `http://localhost:${require('./env.cjs').API_PORT}/api/`
const FIXTURES = path.join(__dirname, '..', 'fixtures')

export interface Api {
  ctx: APIRequestContext
  get<T = any>(url: string): Promise<T>
  post<T = any>(url: string, data?: unknown): Promise<T>
  patch<T = any>(url: string, data?: unknown): Promise<T>
  put<T = any>(url: string, data?: unknown): Promise<T>
  /** Raw call that may fail; returns { status, body } instead of throwing. */
  tryCall(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, data?: unknown): Promise<{ status: number; body: any }>
  upload<T = any>(url: string, field: string, file: string, mimeType: string): Promise<T>
  dispose(): Promise<void>
}

export async function apiAs(tag: string): Promise<Api> {
  const anon = await request.newContext({ baseURL: API })
  // Only drivers may sign in as the mobile app; everyone else signs in as the
  // web does (the token also comes back in the body).
  const isDriver = /^(driver|vendor)\d{3}$/.test(tag)
  const login = await anon.post('auth/login', {
    data: { email: seedEmail(tag), password: seedPassword(), ...(isDriver ? { platform: 'mobile' } : {}) },
  })
  const body = await login.json()
  expect(login.ok(), `API sign-in as ${tag}: ${body?.message}`).toBeTruthy()
  await anon.dispose()
  const token = body.data?.accessToken
  expect(token, `no access token for ${tag}`).toBeTruthy()

  const ctx = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  const call = async (method: string, url: string, data?: unknown) => {
    const res = await ctx.fetch(url, { method, data })
    const json = await res.json().catch(() => ({}))
    expect(res.ok(), `${method} ${url} as ${tag} → ${res.status()}: ${json?.message ?? JSON.stringify(json).slice(0, 300)}`).toBeTruthy()
    return json.data ?? json
  }
  return {
    ctx,
    get: (u) => call('GET', u),
    post: (u, d) => call('POST', u, d),
    patch: (u, d) => call('PATCH', u, d),
    put: (u, d) => call('PUT', u, d),
    async tryCall(method, url, data) {
      const res = await ctx.fetch(url, { method, data })
      return { status: res.status(), body: await res.json().catch(() => ({})) }
    },
    async upload(url, field, file, mimeType) {
      const res = await ctx.post(url, {
        multipart: { [field]: { name: file, mimeType, buffer: fs.readFileSync(path.join(FIXTURES, file)) } },
      })
      const json = await res.json().catch(() => ({}))
      expect(res.ok(), `upload ${file} to ${url} as ${tag} → ${res.status()}: ${json?.message}`).toBeTruthy()
      return json.data ?? json
    },
    dispose: () => ctx.dispose(),
  }
}

/** A Philippine calendar day `offset` days from today (YYYY-MM-DD). */
export function phDay(offset = 0): string {
  return new Date(Date.now() + 8 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)
}

/** Real Metro Manila places, close together (well under the 30 km second-driver threshold). */
export const PLACES = {
  pickup:  { address: 'Ayala Triangle Gardens, Paseo de Roxas, Makati City, Metro Manila', latitude: 14.5568, longitude: 121.0244 },
  dropoff: { address: 'Bonifacio High Street, 9th Ave, Taguig City, Metro Manila',        latitude: 14.5509, longitude: 121.0509 },
}
