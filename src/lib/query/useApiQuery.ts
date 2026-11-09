'use client'

import { useState } from 'react'
import { useQuery, type QueryKey, type UseQueryOptions } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/store/auth.store'
import { queryClient } from './client'

const FILE_LINK_MARK   = '/api/files'
const FILE_DATA_MAX_MS = 5 * 60_000

function holdsFileLink(value: unknown): boolean {
  try { return JSON.stringify(value)?.includes(FILE_LINK_MARK) ?? false } catch { return true }
}

/** The account part of every key (see client.ts). */
export function useAccountScope(): string | null {
  return useAuthStore((s) => (s.user?.user_id ? `${s.user.user_id}:${s.user.it_standin ? 'standin' : 'self'}` : null))
}

/** Full key for `key` under the signed-in account. */
export function scopedKey(scope: string | null, key: QueryKey): QueryKey {
  return [scope ?? 'signed-out', ...key]
}

/**
 * useQuery under the account scope, with the file-link rule: cached data
 * holding /api/files links older than 5 min is dropped before it can show
 * (those links stop working 10–15 min after they were issued).
 * Disabled while signed out.
 */
export function useApiQuery<T>(
  key: QueryKey,
  queryFn: () => Promise<T>,
  options: Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn'> = {},
) {
  const scope = useAccountScope()
  const queryKey = scopedKey(scope, key)
  // When this screen opened; data read before it and holding file links that
  // are over 5 min old is hidden until the fresh read (always made) lands.
  const [openedAt] = useState(() => Date.now())

  const query = useQuery<T, Error, T, QueryKey>({
    ...options,
    queryKey,
    queryFn,
    enabled: !!scope && (options.enabled ?? true),
  })

  const tooOld = query.data !== undefined
    && query.dataUpdatedAt < openedAt
    && openedAt - query.dataUpdatedAt > FILE_DATA_MAX_MS
    && holdsFileLink(query.data)
  if (!tooOld) return query
  return { ...query, data: undefined, isPending: true, isSuccess: false, status: 'pending' } as unknown as typeof query
}

/** Invalidate every query under the signed-in account whose key starts with `prefix`. */
export function invalidateScoped(prefix: QueryKey) {
  const u = useAuthStore.getState().user
  const scope = u?.user_id ? `${u.user_id}:${u.it_standin ? 'standin' : 'self'}` : null
  return queryClient.invalidateQueries({ queryKey: scopedKey(scope, prefix) })
}
