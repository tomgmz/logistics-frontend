'use client'

import { useEffect, useState } from 'react'

/** `value`, once it has stopped changing for `ms` — for search boxes that query the server. */
export function useDebouncedValue<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return debounced
}
