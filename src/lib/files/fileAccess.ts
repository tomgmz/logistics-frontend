'use client'

import { useEffect, useState } from 'react'
import proxyApi from '@/lib/api/auth.api'

/*
 * Stored files on the web (2026-11-08).
 *
 * The API hands out sealed links (backend lib/file-links.ts) that are tied to
 * the signed-in account and open nothing on their own: a link copied out of
 * the page, the Sources panel or the Network panel is useless. To load one,
 * the browser asks the API (through the Next proxy, which holds the session)
 * for a single-use 60-second pass, fetches the file once with it, and shows
 * it from a page-local blob: URL. Large files never pass through Vercel.
 *
 * Use it for EVERY stored file: <ProtectedImg> for pictures, FileViewButton /
 * FileViewer to open one, downloadFile to save one. A plain <img src={link}>
 * or <a href={link}> no longer works for these links.
 */

/** A sealed link to GET /api/files (as opposed to a blob:, data:, static or legacy link). */
export function isSealedFileLink(url: string | null | undefined): url is string {
  return !!url && url.includes('/api/files/') && url.includes('t=')
}

// ── Passes, batched: every thumbnail on a screen asks in the same tick ───────

type Waiter = { link: string; resolve: (v: string | null) => void; reject: (e: unknown) => void }
let queue: Waiter[] = []
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  timer = null
  const batch = queue
  queue = []
  for (let i = 0; i < batch.length; i += 100) {
    const part  = batch.slice(i, i + 100)
    const links = [...new Set(part.map((w) => w.link))]
    try {
      const { data } = await proxyApi.post<{ data: { grants: Record<string, string | null> } }>('/files/grants', { links })
      const grants = data?.data?.grants ?? {}
      for (const w of part) w.resolve(grants[w.link] ?? null)
    } catch (err) {
      for (const w of part) w.reject(err)
    }
  }
}

function requestPass(link: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    queue.push({ link, resolve, reject })
    if (!timer) timer = setTimeout(() => { void flush() }, 15)
  })
}

/**
 * fetch() for a stored file. A sealed link is fetched with a fresh pass;
 * anything else is fetched as it is. Throws when the file can't be read.
 */
export async function fetchStoredFile(link: string): Promise<Response> {
  let target = link
  if (isSealedFileLink(link)) {
    const pass = await requestPass(link)
    if (!pass) throw new Error('This file link has expired or is not yours. Refresh the page.')
    target = pass
  }
  // no-store: never reuse a copy cached for another request (a pass is single use).
  const res = await fetch(target, { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  return res
}

// ── One in-memory copy per link, shared by thumbnails, the viewer and Download ─

type Loaded = { url: string; blob: Blob }
const cache = new Map<string, Promise<Loaded>>()
const MAX_CACHED = 300

/** The file behind `link` as a page-local blob: URL (loaded once per link). */
export function loadStoredFile(link: string): Promise<Loaded> {
  const hit = cache.get(link)
  if (hit) {
    // Most recently used goes to the back.
    cache.delete(link); cache.set(link, hit)
    return hit
  }
  const p = fetchStoredFile(link)
    .then((r) => r.blob())
    .then((blob) => ({ url: URL.createObjectURL(blob), blob }))
  p.catch(() => { cache.delete(link) })   // a failure is retried next time
  cache.set(link, p)

  while (cache.size > MAX_CACHED) {
    const [oldest, old] = cache.entries().next().value as [string, Promise<Loaded>]
    cache.delete(oldest)
    // Later, not now: a picture still on screen (or Safari mid-download) may be reading it.
    old.then((o) => setTimeout(() => URL.revokeObjectURL(o.url), 120_000), () => {})
  }
  return p
}

export interface StoredFileState {
  /** A blob: URL to put in src, or null while loading / after a failure. */
  src:    string | null
  blob:   Blob | null
  failed: boolean
}

const EMPTY: StoredFileState = { src: null, blob: null, failed: false }

/**
 * A stored file for display. A sealed link is loaded through a pass; any other
 * link (blob:, data:, static) is returned as it is.
 */
export function useStoredFile(link: string | null | undefined): StoredFileState {
  const sealed = isSealedFileLink(link)
  const [state, setState] = useState<StoredFileState & { for: string }>({ ...EMPTY, for: '' })

  useEffect(() => {
    if (!sealed || !link) return
    let alive = true
    loadStoredFile(link).then(
      (o) => { if (alive) setState({ for: link, src: o.url, blob: o.blob, failed: false }) },
      () => { if (alive) setState({ for: link, src: null, blob: null, failed: true }) },
    )
    return () => { alive = false }
  }, [link, sealed])

  if (!link) return EMPTY
  if (!sealed) return { src: link, blob: null, failed: false }
  return state.for === link ? state : EMPTY
}
