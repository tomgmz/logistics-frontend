'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { readCache, writeCache } from '@/lib/cache/queryCache'

/**
 * One read (a picker list, a dashboard summary) through the page cache
 * (lib/cache/queryCache): the last answer for `key` shows at once and a fresh
 * read always follows. `reload(true)` re-reads quietly (live updates).
 *
 * - `key` names the read and everything it depends on; a new key is a new read.
 * - A response that arrives after a newer request is dropped.
 * - A failed quiet re-read keeps what is on screen.
 */
export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const [data, setData]       = useState<T | undefined>(() => readCache<T>(key))
  const [loading, setLoading] = useState(data === undefined)
  const [error, setError]     = useState<unknown>(null)

  const fetchRef = useRef(fetcher)
  useEffect(() => { fetchRef.current = fetcher })
  const seq = useRef(0)

  const reload = useCallback(async (quiet = false) => {
    const id = ++seq.current
    const cached = quiet ? undefined : readCache<T>(key)
    if (cached !== undefined) { setData(cached); quiet = true }
    if (!quiet) { setLoading(true); setError(null) }
    try {
      const res = await fetchRef.current()
      if (id !== seq.current) return
      writeCache(key, res)
      setData(res)
      setError(null)
    } catch (e) {
      if (id !== seq.current || quiet) return
      setError(e)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [key])

  useEffect(() => { if (enabled) void reload() }, [reload, enabled])

  return { data, loading, error, reload, setData }
}
