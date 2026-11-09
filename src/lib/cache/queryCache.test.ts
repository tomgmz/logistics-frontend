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
import { readCache, writeCache, clearQueryCache } from './queryCache'

const signIn = (user_id: string, it_standin = false) =>
  (useAuthStore.getState() as unknown as { setUser: (u: unknown) => void }).setUser({ user_id, it_standin })
const signOut = () =>
  (useAuthStore.getState() as unknown as { setUser: (u: unknown) => void }).setUser(null)

describe('page cache', () => {
  beforeEach(() => { signIn('user-a'); clearQueryCache() })
  afterEach(() => { vi.useRealTimers() })

  it('returns what was written for the same account', () => {
    writeCache('k', { rows: [1, 2] })
    expect(readCache('k')).toEqual({ rows: [1, 2] })
  })

  it('keeps nothing while signed out', () => {
    signOut()
    writeCache('k', 1)
    expect(readCache('k')).toBeUndefined()
  })

  it('is emptied when the account changes', () => {
    writeCache('k', 'a-data')
    signIn('user-b')
    expect(readCache('k')).toBeUndefined()
    signIn('user-a')
    expect(readCache('k')).toBeUndefined() // not brought back either
  })

  it('is emptied on sign-out', () => {
    writeCache('k', 'a-data')
    signOut()
    signIn('user-a')
    expect(readCache('k')).toBeUndefined()
  })

  it('is emptied when the IT stand-in flag changes', () => {
    writeCache('k', 'self')
    signIn('user-a', true)
    expect(readCache('k')).toBeUndefined()
  })

  it('keeps an answer with a file link for 5 minutes only', () => {
    vi.useFakeTimers()
    writeCache('files', { url: 'https://api.example/api/files?t=abc' })
    vi.advanceTimersByTime(4 * 60_000)
    expect(readCache('files')).toBeDefined()
    vi.advanceTimersByTime(61_000)
    expect(readCache('files')).toBeUndefined()
  })

  it('keeps other answers for 30 minutes', () => {
    vi.useFakeTimers()
    writeCache('plain', { rows: [1] })
    vi.advanceTimersByTime(29 * 60_000)
    expect(readCache('plain')).toBeDefined()
    vi.advanceTimersByTime(61_000)
    expect(readCache('plain')).toBeUndefined()
  })

  it('holds at most 50 answers, dropping the least recently used', () => {
    for (let i = 0; i < 50; i++) writeCache(`k${i}`, i)
    readCache('k0')            // used again, so k1 is now the oldest
    writeCache('k50', 50)
    expect(readCache('k0')).toBe(0)
    expect(readCache('k1')).toBeUndefined()
    expect(readCache('k50')).toBe(50)
  })
})
