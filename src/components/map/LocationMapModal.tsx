'use client'

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
import { X } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

const GOOGLE_MAPS_KEY    = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID!

const noopSubscribe = () => () => {}

export interface MapPoint {
  latitude:  number
  longitude: number
  /** Shown in the header, e.g. an address or "Where the truck was". */
  label?:    string | null
}

/**
 * One point on the system's own Google map, in a pop-up. Every "open in Google
 * Maps" in the app opens this instead of sending people out to google.com.
 * Sits above the SOS call alert (z-[80]) because it is opened from it.
 */
export function LocationMapModal({ point, onClose }: { point: MapPoint | null; onClose: () => void }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  useBodyScrollLock(!!point)

  useEffect(() => {
    if (!point) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [point, onClose])

  if (!mounted || !point) return null
  const center = { lat: point.latitude, lng: point.longitude }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Location"
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4 bg-black/65"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-full sm:max-w-[720px] h-[85dvh] sm:h-[70dvh] rounded-t-[18px] sm:rounded-[20px] overflow-hidden border border-white/10"
        style={{ background: 'var(--color-bg)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{point.label || 'Location'}</p>
            <p className="text-[11px] text-white/45 tabular-nums">
              {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center border border-white/15 text-white/70"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <APIProvider apiKey={GOOGLE_MAPS_KEY}>
            <Map
              mapId={GOOGLE_MAPS_MAP_ID}
              defaultCenter={center}
              defaultZoom={16}
              gestureHandling="greedy"
              disableDefaultUI
              fullscreenControl
              className="w-full h-full"
            >
              <AdvancedMarker position={center} title={point.label ?? undefined} />
            </Map>
          </APIProvider>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** A link-styled button that opens a point in {@link LocationMapModal}. */
export function MapPointLink({
  point,
  className,
  children,
}: {
  point:     MapPoint
  className?: string
  children:  ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <LocationMapModal point={open ? point : null} onClose={() => setOpen(false)} />
    </>
  )
}
