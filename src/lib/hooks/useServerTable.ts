'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type SetStateAction } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import { useTablePageSize } from './useTablePageSize'
import { getApiErrorMessage } from '@/lib/api-error'
import { queryClient } from '@/lib/query/client'
import { useApiQuery, useAccountScope, scopedKey } from '@/lib/query/useApiQuery'

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
 *
 * Built on TanStack Query (lib/query). `cacheKey` (a name unique to this
 * table) keeps its pages after the screen closes: a page seen before shows at
 * once while it is re-read behind it. Two tables on one screen need different
 * names; a table without one keeps nothing.
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
    cacheKey,
  }: { enabled?: boolean; errorMessage?: string; cacheKey?: string } = {},
) {
  const pageSize = useTablePageSize()
  const [page, setPage] = useState(1)

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

  // A table without a name gets one of its own, so two tables never share data.
  const ownId = useId()
  const key   = ['table', cacheKey ?? `unnamed:${ownId}`, filterKey, page, pageSize] as const

  const query = useApiQuery<PagedResponse<T, X>>(
    key,
    () => fetchRef.current({ page, limit: pageSize }),
    {
      enabled,
      // Paging and filtering keep the previous rows on screen (no spinner).
      placeholderData: keepPreviousData,
      ...(cacheKey ? {} : { gcTime: 0 }),
    },
  )

  const data = query.data
  const meta = (data?.meta ?? null) as (PageMeta & X) | null
  const rows = useMemo(() => data?.data ?? [], [data])

  // The server answers a page past the end with the last page; follow it
  // (during render, like the reset above; placeholder rows belong to the
  // previous page, so they are not followed).
  const serverPage = query.isPlaceholderData ? undefined : meta?.page
  if (serverPage && serverPage !== page) setPage(serverPage)

  const scope   = useAccountScope()
  const fullKey = JSON.stringify(scopedKey(scope, key))
  // Local edits to the rows on screen (e.g. after a save), kept in the cache.
  const setRows = useCallback((next: SetStateAction<T[]>) => {
    queryClient.setQueryData<PagedResponse<T, X>>(JSON.parse(fullKey), (cur) => {
      if (!cur) return cur
      const rowsNow = typeof next === 'function' ? (next as (p: T[]) => T[])(cur.data) : next
      return { ...cur, data: rowsNow }
    })
  }, [fullKey])

  // `quiet` re-reads in place (live updates): no spinner, and a failed re-read
  // keeps the rows on screen. A plain reload (Refresh) shows as `fetching`.
  const refetch = query.refetch
  const [manualReloads, setManualReloads] = useState(0)
  const reload = useCallback(async (quiet = false) => {
    if (quiet) { await refetch(); return }
    setManualReloads((n) => n + 1)
    try { await refetch() } finally { setManualReloads((n) => n - 1) }
  }, [refetch])

  const error = query.isError && data === undefined
    ? getApiErrorMessage(query.error, errorMessage)
    : null

  return {
    rows,
    setRows,
    meta,
    total:      meta?.total ?? 0,
    totalPages: Math.max(1, meta?.totalPages ?? 1),
    page,
    setPage,
    pageSize,
    loading:    query.isPending,
    // As before TanStack: a visible load only (a new page or filter, a
    // Refresh, or nothing on screen yet), never the quiet background re-read
    // behind cached rows; screens show their skeleton while this is true.
    fetching:   query.isFetching && (query.isPlaceholderData || data === undefined || manualReloads > 0),
    error,
    reload,
  }
}
