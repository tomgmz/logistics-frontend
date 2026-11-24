'use client'

import { useState } from 'react'

import { PALETTE, bookingStatusColor } from '@/lib/palette'
import { formatDuration } from '@/lib/duration'
import { pauseReasonLabel } from '@/lib/pause-reasons'
import { Tip } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { hasOpenClientIssue } from './ProblemReportedBadge'
import { isPartlyFailed } from './PartlyFailedBadge'
import { resubmissionsOf } from './ResubmittedBadge'
import { delayOf } from './DelayedBadge'

/**
 * A booking's status as ONE main tag plus its sub-tags (Figma 3296:28259,
 * user 2026-11-24).
 *
 * Main tags: Pending, Approved, Assigned, In Transit, Delivered, Completed,
 * Failed, and Rejected (a cancelled booking reads "Rejected", user
 * 2026-11-24). Everything else about the booking (resubmitted, delayed,
 * problem reported, partly failed, paused…) is a sub-tag: a small coloured
 * line under the main tag. Only the most important one is written out; the
 * rest are a "+N" that opens the full list on click or tap.
 */

// ── main tag ───────────────────────────────────────────────────────────────

const MAIN_LABEL: Record<string, string> = {
  pending:    'Pending',
  booked:     'Pending',
  approved:   'Approved',
  assigned:   'Assigned',
  in_transit: 'In Transit',
  arrived:    'In Transit',
  delivered:  'Delivered',
  completed:  'Completed',
  failed:     'Failed',
  cancelled:  'Rejected',
  rejected:   'Rejected',
}

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

/** The main tag's wording for a booking status. */
export function mainStatusLabel(status: string | null | undefined): string {
  const k = norm(status)
  return MAIN_LABEL[k] ?? (k ? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unknown')
}

/** The main tag's colour (Rejected = Cancelled's red). */
export function mainStatusColor(status: string | null | undefined): string {
  const k = norm(status)
  return bookingStatusColor(k === 'rejected' ? 'cancelled' : k)
}

/** Figma "tag": 18px high, hairline border in the status colour, 8% fill (Delivered's white 10%). */
export function MainStatusTag({ status, size = 'sm' }: { status: string | null | undefined; size?: 'sm' | 'md' }) {
  const c  = mainStatusColor(status)
  const bg = c.toLowerCase() === '#ffffff' ? 'rgba(255,255,255,0.1)' : `${c}14`
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-[5px] border-[0.5px] border-solid pl-[9px] pr-2 font-[family-name:var(--font-alegreya-sc)] font-medium leading-none ${
        size === 'md' ? 'h-[22px] text-[16px]' : 'h-[18px] text-[14px]'
      }`}
      style={{ color: c, borderColor: c, background: bg }}
    >
      {mainStatusLabel(status)}
    </span>
  )
}

// ── sub-tags ───────────────────────────────────────────────────────────────

export interface SubTag {
  key:   string
  label: string
  color: string
  /** What it means, for the hover hint and the "+N" list. */
  hint:  string
}

const RED    = PALETTE.red
const ORANGE = PALETTE.orange
const YELLOW = PALETTE.yellow

/**
 * The sub-tags a booking row carries, most important first (what needs
 * someone now, then what went wrong, then history). `staff` adds the ones
 * only the office sees (breakdown waiting on a decision, late start); a
 * client never gets those, whatever the row carries.
 */
export function subTagsOf(b: Record<string, unknown>, { staff = false }: { staff?: boolean } = {}): SubTag[] {
  const tags: SubTag[] = []
  const status   = norm(b.status)
  const pausedAt = b.paused_at as string | null | undefined

  if (staff && b.breakdown_reported_at && !pausedAt && status === 'in_transit') {
    tags.push({ key: 'breakdown', label: 'Breakdown · needs decision', color: RED,
      hint: 'The driver reported a breakdown: pause the delivery or close it' })
  }
  if (isPartlyFailed(b)) {
    const dests  = Array.isArray(b.booking_destinations) ? b.booking_destinations as Array<{ status?: string | null }> : []
    const failed = dests.filter((d) => d?.status === 'failed').length
    tags.push({ key: 'partly_failed', label: 'Partly Failed', color: RED,
      hint: dests.length ? `${failed} of ${dests.length} drop-offs could not be delivered` : 'Some drop-offs could not be delivered' })
  }
  if (hasOpenClientIssue(b)) {
    const note = typeof b.client_issue_note === 'string' ? b.client_issue_note : null
    tags.push({ key: 'problem', label: 'Problem Reported', color: RED,
      hint: note ? `Problem reported by the client: ${note}` : 'Problem reported by the client' })
  }
  if (staff && status === 'assigned' && b.late_start_for) {
    tags.push({ key: 'late_start', label: 'Late Start', color: RED,
      hint: 'Still Assigned 15 minutes or more after the call time' })
  }
  if (pausedAt && status === 'in_transit') {
    const reason = typeof b.pause_reason === 'string' ? pauseReasonLabel(b.pause_reason as never) : null
    tags.push({ key: 'paused', label: reason ? `Paused · ${reason}` : 'Paused', color: YELLOW,
      hint: reason ? `Paused: ${reason}` : 'The delivery is paused' })
  }
  const d = delayOf(b)
  if (d) {
    tags.push(d.now
      ? { key: 'delayed', label: `Delayed${d.minutes ? ` · ${formatDuration(d.minutes)}` : ''}`, color: ORANGE,
          hint: 'Running late against the planned arrival' }
      : { key: 'delayed', label: `Was Delayed · ${formatDuration(d.minutes ?? 0)}`, color: ORANGE,
          hint: 'Ran late against the planned arrival during this delivery' })
  }
  const resub = resubmissionsOf(b)
  if (resub > 0) {
    tags.push({ key: 'resubmitted', label: `Resubmitted${resub > 1 ? ` ×${resub}` : ''}`, color: ORANGE,
      hint: `Corrected and resubmitted by the client after a rejection${resub > 1 ? ` (${resub} times)` : ''}` })
  }
  return tags
}

/** The sub-tag line: the first one written out, the rest as "+N" (click / tap for the list). */
export function SubTagLine({ tags }: { tags: SubTag[] }) {
  const [open, setOpen] = useState(false)
  if (tags.length === 0) return null
  const [first, ...rest] = tags
  return (
    <span className="mt-[3px] flex max-w-full items-center gap-1 font-[family-name:var(--font-darker)] text-[10px] font-bold uppercase leading-none">
      <Tip label={first.hint}>
        <span className="truncate" style={{ color: first.color }}>{first.label}</span>
      </Tip>
      {rest.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              // The row opens the booking on click; this only opens the list.
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={`${rest.length} more: ${rest.map((t) => t.label).join(', ')}`}
              className="shrink-0 cursor-pointer rounded-[3px] border-[0.5px] border-white/60 px-1 py-px text-white"
            >
              +{rest.length}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            onClick={(e) => e.stopPropagation()}
            className="z-[1500] w-auto max-w-[min(320px,calc(100vw-32px))] gap-2 border border-white/10 bg-[#111] p-3 text-white"
          >
            <ul className="flex flex-col gap-2">
              {tags.map((t) => (
                <li key={t.key} className="flex flex-col gap-0.5">
                  <span className="font-[family-name:var(--font-darker)] text-[11px] font-bold uppercase leading-none" style={{ color: t.color }}>
                    {t.label}
                  </span>
                  <span className="text-xs leading-snug text-[#c4c4c4]">{t.hint}</span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </span>
  )
}

/**
 * Main tag + sub-tag line, for any booking row or header. `extra` adds
 * sub-tags only the caller can work out (e.g. Booking Management's license
 * check); they go before Resubmitted, which always comes last.
 */
export default function BookingStatusTag({ booking, staff = false, extra = [], size = 'sm', align = 'start' }: {
  booking: Record<string, unknown>
  staff?:  boolean
  extra?:  SubTag[]
  size?:   'sm' | 'md'
  /** 'end' when the tag sits at the right edge of a card or header. */
  align?:  'start' | 'end'
}) {
  const own  = subTagsOf(booking, { staff })
  const tail = own.filter((t) => t.key === 'resubmitted')
  const tags = [...own.filter((t) => t.key !== 'resubmitted'), ...extra, ...tail]
  return (
    <span className={`inline-flex max-w-full flex-col ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <MainStatusTag status={booking.status as string | undefined} size={size} />
      <SubTagLine tags={tags} />
    </span>
  )
}
