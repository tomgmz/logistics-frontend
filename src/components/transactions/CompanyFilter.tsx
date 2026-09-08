'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Search, X } from 'lucide-react'
import type { CompanyOption } from '@/lib/services/admin/transaction-history.service'

/**
 * Multi-select for the company filter.
 *
 * Written rather than pulled in: nothing in the app is a multi-select yet, and
 * the admin pages are plain Tailwind with native selects, so a dependency (or
 * MUI, which only the client portal uses) would be the odd one out here.
 */

export default function CompanyFilter({ options, selected, onChange, loading }: {
  options:  CompanyOption[]
  selected: string[]
  onChange: (next: string[]) => void
  loading?: boolean
}) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on an outside click or Escape — a popover that traps the page is
  // worse than no popover.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.companyName.toLowerCase().includes(q))
  }, [options, search])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  function toggle(clientId: string) {
    onChange(
      selectedSet.has(clientId)
        ? selected.filter((id) => id !== clientId)
        : [...selected, clientId],
    )
  }

  const label = loading
    ? 'Loading companies…'
    : selected.length === 0
    ? 'All companies'
    : selected.length === 1
    ? options.find((o) => o.clientId === selected[0])?.companyName ?? '1 company'
    : `${selected.length} companies`

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2
                   text-xs font-bold text-white/80 outline-none transition-colors
                   hover:bg-white/5 focus:border-[var(--color-cyan)]/50 disabled:opacity-50
                   cursor-pointer max-w-[240px]"
      >
        <Building2 size={14} className="shrink-0 text-white/40" />
        <span className="truncate">{label}</span>
        {selected.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear company filter"
            onClick={(e) => { e.stopPropagation(); onChange([]) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange([]) }
            }}
            className="shrink-0 rounded p-0.5 text-white/40 hover:text-white"
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown size={14} className="shrink-0 text-white/40" />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-[300px] overflow-hidden rounded-xl border
                        border-white/10 bg-[#1a1a1a] shadow-xl">
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
            <Search size={14} className="shrink-0 text-white/40" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="flex-1 border-none bg-transparent text-sm text-white/80 outline-none
                         placeholder:text-white/35"
            />
          </div>

          <div className="max-h-[280px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-white/40">No companies found.</p>
            ) : (
              filtered.map((o) => {
                const active = selectedSet.has(o.clientId)
                return (
                  <button
                    key={o.clientId}
                    type="button"
                    onClick={() => toggle(o.clientId)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm
                               transition-colors hover:bg-white/5 cursor-pointer"
                  >
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                      style={
                        active
                          ? { background: 'var(--color-cyan)', borderColor: 'var(--color-cyan)' }
                          : { borderColor: 'rgba(255,255,255,0.2)' }
                      }
                    >
                      {active && <Check size={11} className="text-black" />}
                    </span>
                    <span className="flex-1 truncate text-white/80">{o.companyName}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-white/35">{o.count}</span>
                  </button>
                )
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className="border-t border-white/[0.07] px-3 py-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] font-bold uppercase tracking-wider text-red-400
                           transition-opacity hover:opacity-70 cursor-pointer"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
