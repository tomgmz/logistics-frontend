'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, History } from 'lucide-react'

import proxyApi from '@/lib/api/auth.api'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { PALETTE } from '@/lib/palette'
import { formatDateTime } from './transaction-format'
import { BORDER_C, MUTED } from './transaction-theme'
import { usePanelSection } from '@/components/ui/PanelReady'

/**
 * Everything that changed on the road, in one list, oldest first: runs loaded,
 * drop-offs delivered or failed (and by whom), drivers swapped, driver or
 * vehicle replaced, pauses, late confirmations and how each was decided.
 * Collapsed by default; read-only.
 */

interface DeliveryEvent {
  at:     string
  kind:   string
  title:  string
  detail: string | null
  by:     string | null
}

const DOT: Record<string, string> = {
  pickup:          PALETTE.cyan,
  stop_delivered:  PALETTE.green,
  stop_failed:     PALETTE.red,
  drivers_swapped: PALETTE.purple,
  crew_replaced:   PALETTE.purple,
  paused:          PALETTE.yellow,
  resumed:         PALETTE.yellow,
  late_received:   PALETTE.orange,
  late_accepted:   PALETTE.green,
  late_dismissed:  PALETTE.red,
  late_superseded: 'rgba(255,255,255,0.5)',
}

export default function DeliveryEventsPanel({ bookingId }: { bookingId: string }) {
  const [events, setEvents] = useState<DeliveryEvent[]>([])
  const [open,   setOpen]   = useState(false)

  const [loaded, setLoaded] = useState(false)
  usePanelSection(!loaded)
  const load = useCallback(() => {
    proxyApi.get<{ data: DeliveryEvent[] }>(`/admin/assignments/${bookingId}/events`)
      .then(({ data }) => setEvents(data.data ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [bookingId])
  useEffect(() => { load() }, [load])
  useLiveTable(['live:bookings'], load)

  if (events.length === 0) return null

  return (
    <div className="rounded-xl border p-3.5 flex flex-col gap-2.5" style={{ borderColor: BORDER_C }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex items-center justify-between gap-2 text-left cursor-pointer">
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          <History size={15} style={{ color: PALETTE.cyan }} /> What happened on the road ({events.length})
        </span>
        <ChevronDown size={15} className={`text-white/60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="flex flex-col gap-2">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-2.5">
              <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: DOT[e.kind] ?? 'rgba(255,255,255,0.5)' }} />
              <div className="min-w-0">
                <p className="text-[13px] text-white break-words">{e.title}</p>
                <p className="text-[12px] break-words" style={{ color: MUTED }}>
                  {formatDateTime(e.at)}{e.by ? ` · ${e.by}` : ''}{e.detail ? ` · ${e.detail}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
