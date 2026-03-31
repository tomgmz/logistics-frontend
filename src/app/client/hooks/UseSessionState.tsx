import { useState, useEffect, useCallback } from 'react'

/**
 * Works exactly like useState but persists to sessionStorage.
 * State survives page refresh and back/forward navigation,
 * but clears when the tab is closed.
 */
export function useSessionState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const stored = sessionStorage.getItem(key)
      return stored !== null ? (JSON.parse(stored) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  // Sync to sessionStorage whenever state changes
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state))
    } catch {
      // sessionStorage full or unavailable fail silently
    }
  }, [key, state])

  // Stable setter — same API as useState's dispatch
  const set = useCallback((value: T | ((prev: T) => T)) => {
    setState(value)
  }, [])

  return [state, set] as const
}