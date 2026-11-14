'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * A side panel shows nothing until every section in it has its first answer
 * (user 2026-11-14: Booking Management and Transaction History filled in piece
 * by piece). Sections that fetch their own data call usePanelSection(loading);
 * the gate keeps the spinner until none is loading, then shows all at once.
 *
 * - The sections are mounted (hidden) while waiting, so their reads run.
 * - Only the first load counts: once shown, live re-reads never hide it again.
 * - A section that takes longer than `maxWaitMs` is not waited for (the panel
 *   shows, and that section fills in when it arrives).
 * - Outside a gate the hook does nothing, so the sections work anywhere.
 *
 * Give the gate a `key` of the record id so a different record starts over.
 */
type Report = (id: string, loading: boolean) => void
const PanelReadyCtx = createContext<Report | null>(null)

export function PanelReadyGate({ children, fallback, maxWaitMs = 8000, className }: {
  children: ReactNode
  fallback: ReactNode
  maxWaitMs?: number
  /** The wrapper's layout (e.g. the panel's `space-y-…`, which can't reach through it). */
  className?: string
}) {
  const pending = useRef(new Set<string>())
  const mounted = useRef(false)
  const [ready, setReady] = useState(false)
  const readyRef = useRef(false)

  const check = useCallback(() => {
    if (readyRef.current || !mounted.current || pending.current.size > 0) return
    readyRef.current = true
    setReady(true)
  }, [])

  const report = useCallback<Report>((id, loading) => {
    if (readyRef.current) return
    if (loading) pending.current.add(id)
    else pending.current.delete(id)
    check()
  }, [check])

  // Children's effects run before this one, so every section has said whether
  // it is loading by the time the gate first checks.
  useEffect(() => {
    mounted.current = true
    check()
    const t = setTimeout(() => { if (!readyRef.current) { readyRef.current = true; setReady(true) } }, maxWaitMs)
    return () => clearTimeout(t)
  }, [check, maxWaitMs])

  return (
    <PanelReadyCtx.Provider value={report}>
      {!ready && fallback}
      <div hidden={!ready} className={className}>{children}</div>
    </PanelReadyCtx.Provider>
  )
}

/** Inside a PanelReadyGate: hold the panel back while this section's first load runs. */
export function usePanelSection(loading: boolean) {
  const report = useContext(PanelReadyCtx)
  const id = useId()
  useEffect(() => { report?.(id, loading) }, [report, id, loading])
  useEffect(() => () => report?.(id, false), [report, id])
}

/** The side panels' loading state, while the record or its sections load. */
export function PanelSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
      <p className="text-sm text-white/45">Loading…</p>
    </div>
  )
}

/** For a load the panel's own page runs (not a section component). */
export function PanelSectionFlag({ loading }: { loading: boolean }) {
  usePanelSection(loading)
  return null
}
