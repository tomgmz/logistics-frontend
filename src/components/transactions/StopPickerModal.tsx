'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Check, MapPin, Search, X } from 'lucide-react'

import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import SearchClearButton from '@/components/ui/SearchClearButton'
import { PALETTE } from '@/lib/palette'

export interface StopOption {
  id:       string
  /** "Drop-off 3 · trip 2", "Pickup · trip 1 of 2", "The yard (vehicle return)". */
  title:    string
  /** The full address, wrapped under the title; never cut. */
  address?: string | null
}

/** Show the search box from this many stops (a short list is read at a glance). */
const SEARCH_FROM = 6

const noopSubscribe = () => () => {}

/**
 * "Complete for the driver" → Location (user 2026-11-27): drop-off addresses are
 * too long for a dropdown, so the choice opens this list. Each row is the stop's
 * label with its full address wrapped underneath (Material's list dialog / Apple's
 * sheet with a list, for long options). A search box appears on a long run.
 */
export default function StopPickerModal({ open, options, value, onPick, onClose }: {
  open:    boolean
  options: StopOption[]
  value:   string
  onPick:  (id: string) => void
  onClose: () => void
}) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const [query, setQuery] = useState('')
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.title} ${o.address ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  if (!mounted || !open) return null

  const close = () => { setQuery(''); onClose() }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="stop-picker-title" onClick={close}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 sm:items-center sm:p-4">
      <div onClick={(e) => e.stopPropagation()}
        className="flex w-full max-h-[90dvh] flex-col overflow-hidden rounded-t-[18px] border border-[#424242] bg-[#141414] sm:max-w-[520px] sm:rounded-[16px]">
        <div className="shrink-0 flex flex-col gap-3 px-4 pt-4 pb-3 border-b border-[#424242]">
          <div className="flex items-center justify-between gap-2">
            <h2 id="stop-picker-title" className="text-base font-bold text-white">Choose the location</h2>
            <button type="button" onClick={close} aria-label="Close"
              className="flex size-8 items-center justify-center rounded-full text-[#818181] [@media(hover:hover)]:hover:bg-white/10 [@media(hover:hover)]:hover:text-white">
              <X size={18} />
            </button>
          </div>
          {options.length >= SEARCH_FROM && (
            <div className="relative">
              <Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#818181]" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a stop or address" aria-label="Search a stop or address"
                className="w-full min-h-[44px] rounded-[10px] border border-[#424242] bg-black/40 pl-9 pr-9 text-base sm:text-sm text-white outline-none focus:border-[#4df9ed]/60" />
              <SearchClearButton value={query} onClear={() => setQuery('')} />
            </div>
          )}
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          {shown.length === 0 && (
            <li className="px-4 py-6 text-center text-sm font-bold text-[#818181]">No stop matches your search.</li>
          )}
          {shown.map((o) => {
            const selected = o.id === value
            return (
              <li key={o.id}>
                <button type="button" onClick={() => { onPick(o.id); close() }} aria-pressed={selected}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left border-b border-[#424242]/60 last:border-b-0 ${selected ? 'bg-white/[0.06]' : '[@media(hover:hover)]:hover:bg-white/[0.04]'}`}>
                  <MapPin aria-hidden size={18} className="mt-0.5 shrink-0" style={{ color: PALETTE.orange }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white break-words">{o.title}</span>
                    {o.address && <span className="block text-sm text-white/70 break-words whitespace-normal">{o.address}</span>}
                  </span>
                  {selected && <Check aria-hidden size={18} className="mt-0.5 shrink-0" style={{ color: PALETTE.cyan }} />}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="shrink-0 border-t border-[#424242] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={close}
            className="w-full min-h-[44px] rounded-[10px] border border-[#818181] text-sm font-bold text-white">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
