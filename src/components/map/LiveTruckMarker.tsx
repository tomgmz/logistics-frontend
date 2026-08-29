'use client'

import { AdvancedMarker } from '@vis.gl/react-google-maps'
import { formatAge, formatEta, type DriverPosition, type StopEta } from '@/lib/hooks/useLiveDriverPosition'

/**
 * The truck, where the truck actually is.
 *
 * What this replaces is worth recording: the marker used to be placed at the
 * next undelivered stop's address, which meant the map showed a vehicle sitting
 * on a building it had not reached yet — a guess rendered as a fact, under a
 * "Live Tracking" label. Nothing is drawn now unless a real fix has arrived.
 *
 * A stale position is still drawn, but visibly demoted: dimmed, no pulse, and
 * labelled with its age. Someone deciding whether to hold a receiving bay open
 * needs to know the difference between "the truck is here" and "the truck was
 * here nine minutes ago and we have not heard from it since".
 */
export function LiveTruckMarker({
  position,
  latest,
  isStale,
  ageMs,
  nextEta,
}: {
  position: { lat: number; lng: number } | null
  latest:   DriverPosition | null
  isStale:  boolean
  ageMs:    number | null
  nextEta?: StopEta | null
}) {
  if (!position || !latest) return null

  const color = isStale ? '#9f9c9c' : 'var(--color-cyan)'

  // The arrival time is the thing anyone watching this map is actually here for,
  // so it goes on the truck rather than only in the side panel. Suppressed when
  // the position is stale: an ETA computed from a position we no longer trust is
  // exactly the kind of confident-sounding wrong answer to avoid.
  const etaLabel = !isStale && nextEta ? formatEta(nextEta.eta_seconds) : null

  return (
    <AdvancedMarker
      position={position}
      title={`Driver position — ${formatAge(ageMs)}`}
      zIndex={10}
    >
      <div className="flex flex-col items-center gap-1">
        <div
          className="px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap border"
          style={{
            background:  'var(--color-bg)',
            borderColor: isStale ? 'rgba(159,156,156,0.4)' : 'rgba(77,249,237,0.4)',
            color,
          }}
        >
          {isStale
            ? `NO SIGNAL · ${formatAge(ageMs)}`
            : etaLabel
              ? `${etaLabel.toUpperCase()} · ${formatAge(ageMs).toUpperCase()}`
              : formatAge(ageMs).toUpperCase()}
        </div>

        <div className="relative flex items-center justify-center">
          {/* The pulse is the "this is live" cue, so it has to stop when it isn't. */}
          {!isStale && (
            <span
              className="absolute w-9 h-9 rounded-full animate-ping"
              style={{ background: 'rgba(77,249,237,0.25)' }}
            />
          )}
          <div
            className="relative w-7 h-7 rounded-full border-2 flex items-center justify-center"
            style={{
              background:   isStale ? '#2a2828' : 'var(--color-cyan)',
              borderColor:  '#ffffff',
              boxShadow:    isStale ? 'none' : '0 0 12px rgba(77,249,237,0.6)',
              opacity:      isStale ? 0.75 : 1,
            }}
          >
            {/*
              Rotated to the reported heading so the truck points where it is
              going. Heading is null when the device could not determine one —
              usually because it is standing still — and an arbitrary rotation
              would read as a turn that never happened, so it stays at north.
            */}
            <svg
              width="14" height="14" viewBox="0 0 24 24"
              style={{
                transform: `rotate(${latest.heading_deg ?? 0}deg)`,
                transition: 'transform 0.6s ease-out',
              }}
              fill={isStale ? '#9f9c9c' : '#000000'}
              aria-hidden
            >
              <path d="M12 2 L19 21 L12 17 L5 21 Z" />
            </svg>
          </div>
        </div>
      </div>
    </AdvancedMarker>
  )
}
