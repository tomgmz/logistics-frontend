'use client'

import { useCallback } from 'react'
import { useApiQuery } from '@/lib/query/useApiQuery'

/**
 * One read (a picker list, a dashboard summary) through TanStack Query: the
 * last answer for `key` shows at once and a fresh read always follows.
 * `reload(true)` re-reads quietly (live updates); a failed re-read keeps what
 * is on screen.
 */
export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const query = useApiQuery<T>(['fetch', key], fetcher, { enabled })
  const refetch = query.refetch
  const reload = useCallback(async (quiet?: boolean) => { void quiet; await refetch() }, [refetch])
  return {
    data:    query.data,
    loading: query.isPending,
    error:   query.data === undefined ? query.error : null,
    reload,
  }
}
