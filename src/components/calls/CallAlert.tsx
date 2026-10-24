'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, type LucideIcon } from 'lucide-react'

/**
 * The one call alert, after Untitled UI's floating alert
 * (untitledui.com/react/components/alerts), drawn in our palette:
 *
 *   (featured icon)  Title                         (●) (●)
 *                    Description
 *                    Link · Link
 *
 * `error` (red) is the driver's emergency call, `brand` (cyan) a call from
 * Messages. The round buttons on the right are the call's actions (Answer /
 * Decline, Mute / Hang up). It floats over the page instead of covering it, so
 * nothing locks the scroll.
 *
 * Both call providers render into one shared stack at the top centre, 85% of
 * the screen wide, so an emergency and a chat call never overlap; `priority`
 * puts the emergency first.
 */

export type CallAlertColor = 'brand' | 'error'

const TONE: Record<CallAlertColor, string> = {
  brand: '#4df9ed',
  error: '#f62626',
}

const HOST_ID = 'call-alerts'

/** Finds or makes the shared stack. Idempotent, so it is safe as a snapshot. */
function alertHost(): HTMLElement {
  let el = document.getElementById(HOST_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = HOST_ID
    el.className = 'pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[80] flex w-[85vw] -translate-x-1/2 flex-col gap-3'
    document.body.appendChild(el)
  }
  return el
}

const noSubscribe = () => () => {}

/** Null on the server and while hydrating, then the stack. */
function useAlertHost(): HTMLElement | null {
  return useSyncExternalStore(noSubscribe, alertHost, () => null)
}

export function CallAlert({
  color, icon: Icon, title, description, links, actions, onClose, pulse = false, priority = false, label,
}: {
  color:        CallAlertColor
  icon:         LucideIcon
  title:        string
  description?: ReactNode
  /** Text links under the description (Open the report, Open in Google Maps). */
  links?:       ReactNode
  /** The round buttons on the right. */
  actions?:     ReactNode
  /** Shows the × in the corner. */
  onClose?:     () => void
  /** Rings the featured icon while the call is ringing. */
  pulse?:       boolean
  priority?:    boolean
  label:        string
}) {
  const host = useAlertHost()
  if (!host) return null
  const tone = TONE[color]

  return createPortal(
    <div
      role={pulse ? 'alert' : 'status'}
      aria-label={label}
      className={`pointer-events-auto relative flex items-start gap-3 rounded-xl border bg-[var(--color-surface)] p-4 shadow-2xl ${priority ? 'order-first' : ''}`}
      style={{ borderColor: `${tone}66` }}
    >
      <FeaturedIcon icon={Icon} tone={tone} pulse={pulse} />

      <div className={`flex min-w-0 flex-1 flex-col gap-1 pt-0.5 ${onClose && !actions ? 'pr-6' : ''}`}>
        <p className="ff-body break-words text-sm font-bold text-white">{title}</p>
        {description && <div className="ff-body space-y-0.5 text-sm text-white/60">{description}</div>}
        {links && <div className="ff-body mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">{links}</div>}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2 self-center">{actions}</div>}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-lg p-1.5 text-white/40"
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>
      )}
    </div>,
    host,
  )
}

/** Untitled UI's outline featured icon: the icon inside two faint rings. */
function FeaturedIcon({ icon: Icon, tone, pulse }: { icon: LucideIcon; tone: string; pulse: boolean }) {
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
      {pulse && <span className="absolute inset-0 animate-ping rounded-full motion-reduce:hidden" style={{ backgroundColor: `${tone}26` }} />}
      <span className="absolute inset-0 rounded-full border-2" style={{ borderColor: `${tone}1a` }} />
      <span className="absolute inset-[5px] rounded-full border-2" style={{ borderColor: `${tone}4d` }} />
      <Icon size={18} className="relative" style={{ color: tone }} />
    </span>
  )
}

/**
 * A round action button: `answer` is cyan (our blue), `decline` red, `plain` grey.
 * Icon only, so `label` names it for screen readers and the tooltip.
 */
export function CallCircleButton({
  kind, icon: Icon, label, onClick, disabled = false, busy = false,
}: {
  kind:      'answer' | 'decline' | 'plain'
  icon:      LucideIcon
  label:     string
  onClick:   () => void
  disabled?: boolean
  busy?:     boolean
}) {
  const look = kind === 'answer' ? 'bg-[#4df9ed] text-black'
    : kind === 'decline' ? 'bg-[#f62626] text-white'
    : 'bg-white/10 text-white/80'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-50 ${look} ${busy ? 'animate-pulse' : ''}`}
    >
      <Icon size={18} />
    </button>
  )
}
