'use client'

import { useCallback, useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { CARD_TOGGLE, ToggleBox } from '@/components/ui/accordion'

import proxyApi from '@/lib/api/auth.api'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { PALETTE } from '@/lib/palette'
import { formatDateTime } from './transaction-format'
import { MUTED } from './transaction-theme'
import { usePanelSection } from '@/components/ui/PanelReady'

/**
 * Everything that changed on the road, in one list, oldest first: runs loaded,
 * drop-offs delivered or failed (and by whom), drivers swapped, driver or
 * vehicle replaced, pauses, late confirmations and how each was decided.
 * Open by default (Figma "booking detail frame", 2026-11-14); read-only.
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
  // Every change of driver, second driver, helper or vehicle (2026-11-21).
  crew_changed:    PALETTE.purple,
  navigation_moved: PALETTE.cyan,
  paused:          PALETTE.yellow,
  resumed:         PALETTE.yellow,
  late_received:   PALETTE.orange,
  late_accepted:   PALETTE.green,
  late_dismissed:  PALETTE.red,
  late_superseded: 'rgba(255,255,255,0.5)',
}

export default function DeliveryEventsPanel({ bookingId }: { bookingId: string }) {
  const [events, setEvents] = useState<DeliveryEvent[]>([])
  const [open,   setOpen]   = useState(true)

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
    <ToggleBox
      open={open}
      onOpenChange={setOpen}
      {...CARD_TOGGLE}
      chevronStyle={{ color: PALETTE.cyan }}
      title={
        <span className="flex items-center gap-2 text-base font-bold text-white leading-tight">
          <TriangleAlert size={20} strokeWidth={2} className="shrink-0" style={{ color: PALETTE.cyan }} />
          What happened
        </span>
      }
    >
        <ol className="flex flex-col gap-2.5">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DOT[e.kind] ?? PALETTE.green }} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white break-words leading-tight">{e.title}</p>
                <p className="text-xs font-bold break-words leading-snug" style={{ color: MUTED }}>
                  {formatDateTime(e.at)}{e.by ? ` · ${e.by}` : ''}{e.detail ? ` · ${e.detail}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
    </ToggleBox>
  )
}
