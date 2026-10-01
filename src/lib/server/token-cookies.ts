import type { NextRequest, NextResponse } from 'next/server'

/**
 * Encrypted session cookies.
 *
 * The backend issues signed JWTs; a JWT is only *signed*, so anyone who sees the
 * cookie (DevTools, a screenshot, a proxy log) can base64-decode the user id,
 * role and email inside it. This Next server is the only party that ever sets or
 * reads `access_token` / `refresh_token` on the browser's side, so it seals them
 * with AES-256-GCM before they reach the browser and opens them again before
 * they are forwarded to the backend. The backend and the mobile app (which keeps
 * its tokens in the OS keystore) are unaffected.
 *
 * GCM also authenticates: a tampered or forged cookie fails to open and is
 * treated as absent. The cookie name is bound in as associated data, so an
 * access token cannot be replayed in the refresh-token slot or vice versa.
 *
 * The key is COOKIE_ENCRYPTION_KEY — 32 random bytes, base64 — and must never
 * carry the NEXT_PUBLIC_ prefix. Rotating it signs every web user out once.
 */

export const TOKEN_COOKIES = ['access_token', 'refresh_token'] as const
export type TokenCookie = (typeof TOKEN_COOKIES)[number]

const VERSION = 'v1'

let keyPromise: Promise<CryptoKey> | null = null

function getKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise
  const raw = process.env.COOKIE_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('COOKIE_ENCRYPTION_KEY is not set — session cookies cannot be encrypted')
  }
  const bytes = Buffer.from(raw, 'base64')
  if (bytes.length !== 32) {
    throw new Error('COOKIE_ENCRYPTION_KEY must be 32 bytes, base64-encoded')
  }
  keyPromise = crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
  return keyPromise
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = Buffer.from(s, 'base64url')
  const out = new Uint8Array(b.length)
  out.set(b)
  return out
}

/** Encrypt a token for the named cookie: `v1.<iv>.<ciphertext+tag>`. */
export async function sealToken(name: TokenCookie, token: string): Promise<string> {
  const key = await getKey()
  const iv  = crypto.getRandomValues(new Uint8Array(12))
  const ct  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(name) },
    key,
    new TextEncoder().encode(token),
  )
  return `${VERSION}.${b64url(iv)}.${b64url(new Uint8Array(ct))}`
}

/**
 * Decrypt a sealed cookie value. Anything that does not open — a pre-encryption
 * plaintext JWT, a tampered value, a value sealed under an old key — is null,
 * which every caller treats as "no session".
 */
export async function openToken(name: TokenCookie, sealed: string | undefined | null): Promise<string | null> {
  if (!sealed) return null
  const [version, ivPart, ctPart] = sealed.split('.')
  if (version !== VERSION || !ivPart || !ctPart) return null
  try {
    const key = await getKey()
    const pt  = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64url(ivPart), additionalData: new TextEncoder().encode(name) },
      key,
      fromB64url(ctPart),
    )
    return new TextDecoder().decode(pt)
  } catch {
    return null
  }
}

/** Set a token cookie, encrypted. */
export async function setTokenCookie(
  res: NextResponse,
  name: TokenCookie,
  token: string,
  options: Parameters<NextResponse['cookies']['set']>[2],
): Promise<void> {
  res.cookies.set(name, await sealToken(name, token), options)
}

/**
 * The Cookie header to send the backend: every cookie as the browser sent it,
 * except the token cookies, which are replaced by their decrypted values (or
 * dropped when they do not open). The backend only ever sees real JWTs.
 */
export async function backendCookieHeader(req: NextRequest): Promise<string> {
  const parts: string[] = []
  for (const { name, value } of req.cookies.getAll()) {
    if ((TOKEN_COOKIES as readonly string[]).includes(name)) {
      const plain = await openToken(name as TokenCookie, value)
      if (plain) parts.push(`${name}=${plain}`)
    } else {
      parts.push(`${name}=${value}`)
    }
  }
  return parts.join('; ')
}

/**
 * Remove raw tokens from a backend response body before it reaches the browser.
 * The cookies carry the session; page scripts have no use for the tokens, and a
 * token in a JSON body is readable by any script, which defeats httpOnly.
 */
export function withoutTokens<T>(body: T): T {
  const data = (body as { data?: Record<string, unknown> })?.data
  if (!data || typeof data !== 'object') return body
  const rest = { ...data }
  delete rest.accessToken
  delete rest.refreshToken
  return { ...(body as object), data: rest } as T
}
