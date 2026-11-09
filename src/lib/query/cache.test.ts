import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The auth store persists through encrypted storage; an in-memory store is
// enough here (only `user` matters to the cache).
vi.mock('@/lib/store/auth.store', async () => {
  const { create } = await import('zustand')
  type U = { user_id: string; it_standin?: boolean } | null
  const useAuthStore = create<{ user: U; setUser: (u: U) => void }>()((set) => ({
    user: null,
    setUser: (user) => set({ user }),
  }))
  return { useAuthStore }
})

import { useAuthStore } from '@/lib/store/auth.store'
import { queryClient } from './client'
import { cachedData, storeData } from './useApiQuery'

const setUser = (u: unknown) => (useAuthStore.getState() as unknown as { setUser: (u: unknown) => void }).setUser(u)
const signIn  = (user_id: string, it_standin = false) => setUser({ user_id, it_standin })

describe('TanStack Query cache rules', () => {
  beforeEach(() => { signIn('user-a'); queryClient.clear() })
  afterEach(() => { vi.useRealTimers() })

  it('returns what was stored for the same account', () => {
    storeData(['k'], { rows: [1, 2] })
    expect(cachedData(['k'])).toEqual({ rows: [1, 2] })
  })

  it('keeps nothing while signed out', () => {
    setUser(null)
    storeData(['k'], 1)
    expect(cachedData(['k'])).toBeUndefined()
  })

  it('is emptied when the account changes, and not brought back', () => {
    storeData(['k'], 'a-data')
    signIn('user-b')
    expect(cachedData(['k'])).toBeUndefined()
    signIn('user-a')
    expect(cachedData(['k'])).toBeUndefined()
  })

  it('is emptied on sign-out', () => {
    storeData(['k'], 'a-data')
    setUser(null)
    signIn('user-a')
    expect(cachedData(['k'])).toBeUndefined()
  })

  it('is emptied when the IT stand-in flag changes', () => {
    storeData(['k'], 'self')
    signIn('user-a', true)
    expect(cachedData(['k'])).toBeUndefined()
  })

  it('stops returning data with a file link after 5 minutes', () => {
    vi.useFakeTimers()
    storeData(['files'], { url: 'https://api.example/api/files?t=abc' })
    vi.advanceTimersByTime(4 * 60_000)
    expect(cachedData(['files'])).toBeDefined()
    vi.advanceTimersByTime(61_000)
    expect(cachedData(['files'])).toBeUndefined()
  })

  it('keeps other data past 5 minutes', () => {
    vi.useFakeTimers()
    storeData(['plain'], { rows: [1] })
    vi.advanceTimersByTime(20 * 60_000)
    expect(cachedData(['plain'])).toEqual({ rows: [1] })
  })
})
