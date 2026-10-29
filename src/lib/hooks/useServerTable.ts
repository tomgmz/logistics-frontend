'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTablePageSize } from './useTablePageSize'
import { getApiErrorMessage } from '@/lib/api-error'

/**
 * Server-side pagination for a web table: the server filters, sorts and counts,
 * and only the page on screen comes back (backend lib/paginate.ts).
 *
 * - `fetchPage` asks for one page; it may close over the table's filters.
 * - `filterKey` is anything that identifies the current filters (search, tab,
 *   sort…). When it changes the table goes back to page 1 in the same render,
 *   so the old page number is never requested with the new filters.
 * - A response that arrives after a newer request is dropped, so typing fast or
 *   clicking through pages never shows an older page over a newer one.
 * - The server answers a page past the end with the last page; the table
 *   follows `meta.page`.
 *
 * `loading` is only the first load (or a retry after an error); later fetches
 * keep the rows on screen and set `fetching`, so paging does not flash a spinner.
 */

export interface PageMeta {
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface PagedResponse<T, X extends object = object> {
  data: T[]
  meta: PageMeta & X
}

export interface PageRequest {
  page:  number
  limit: number
}

export function useServerTable<T, X extends object = object>(
  fetchPage: (q: PageRequest) => Promise<PagedResponse<T, X>>,
  filterKey: string,
  {
    enabled = true,
    errorMessage = 'Could not load this list. Please try again.',
  }: { enabled?: boolean; errorMessage?: string } = {},
) {
  const pageSize = useTablePageSize()
  const [page, setPage]         = useState(1)
  const [rows, setRows]         = useState<T[]>([])
  const [meta, setMeta]         = useState<(PageMeta & X) | null>(null)
  const [loading, setLoading]   = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // New filters or a new page size start again from page 1 — set during render
  // so the fetch below never runs with the old page and the new filters.
  const resetKey = `${filterKey}::${pageSize}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setPage(1)
  }

  const fetchRef = useRef(fetchPage)
  useEffect(() => { fetchRef.current = fetchPage })
  const seq       = useRef(0)
  const loadedRef = useRef(false)
  const errorRef  = useRef<string | null>(null)

  // `quiet` re-reads in place (live updates, polling): no spinner, and a failed
  // re-read keeps the rows already on screen instead of showing an error.
  const reload = useCallback(async (quiet = false) => {
    const id = ++seq.current
    if (!quiet) {
      if (!loadedRef.current || errorRef.current) setLoading(true)
      setFetching(true)
      setError(null)
      errorRef.current = null
    }
    try {
      const res = await fetchRef.current({ page, limit: pageSize })
      if (id !== seq.current) return
      loadedRef.current = true
      setRows(res.data)
      setMeta(res.meta)
      if (res.meta.page && res.meta.page !== page) setPage(res.meta.page)
    } catch (e) {
      if (id !== seq.current || quiet) return
      const msg = getApiErrorMessage(e, errorMessage)
      errorRef.current = msg
      setError(msg)
    } finally {
      if (id === seq.current) {
        setLoading(false)
        setFetching(false)
      }
    }
    // filterKey: fetchPage closes over the filters, so a new key means a new read.
  }, [page, pageSize, filterKey, errorMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (enabled) void reload() }, [reload, enabled])

  return {
    rows,
    setRows,
    meta,
    total:      meta?.total ?? 0,
    totalPages: Math.max(1, meta?.totalPages ?? 1),
    page,
    setPage,
    pageSize,
    loading,
    fetching,
    error,
    reload,
  }
}
