'use client'

import { QueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useAuthStore } from '@/lib/store/auth.store'

/**
 * The one TanStack Query client for the web app. All data that comes from the
 * server lives here; screen state (signed-in user, open chat windows, the
 * booking form) stays in Zustand.
 *
 * Rules (agreed 2026-11-10, same as the hand-made page cache it replaces):
 * - A screen shows what it last had at once and ALWAYS re-reads on open
 *   (refetchOnMount 'always').
 * - A tab shown again re-reads data older than 30 s; so does a reconnect.
 * - One retry, never for a 4xx (a refusal won't change by asking again).
 * - Unused data is dropped after 30 min; data holding file links is never
 *   shown after 5 min (useApiQuery), since those links expire at 10–15.
 * - Every key starts with the account scope, and the whole cache is cleared
 *   when the account or the IT stand-in flag changes or the user signs out,
 *   so the next person on this browser never sees the previous one's data.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            30_000,
      gcTime:               30 * 60_000,
      refetchOnMount:       'always',
      refetchOnWindowFocus: true,
      refetchOnReconnect:   true,
      retry: (count, err) => {
        const status = axios.isAxiosError(err) ? err.response?.status ?? 0 : 0
        if (status >= 400 && status < 500) return false
        return count < 1
      },
    },
    mutations: { retry: false },
  },
})

/** `user:stand-in` of the signed-in account, or null when signed out. */
export function accountScope(): string | null {
  const u = useAuthStore.getState().user
  if (!u?.user_id) return null
  return `${u.user_id}:${u.it_standin ? 'standin' : 'self'}`
}

if (typeof window !== 'undefined') {
  let last = accountScope()
  useAuthStore.subscribe(() => {
    const now = accountScope()
    if (now !== last) {
      last = now
      void queryClient.cancelQueries()
      queryClient.clear()
    }
  })
}
