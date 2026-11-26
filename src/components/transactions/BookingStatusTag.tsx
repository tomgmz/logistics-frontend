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
 * problem reported, partly failed, paused…) is a sub-tag under the main tag.
 * In a table only the most important one is written out (plain coloured
 * text) and the rest are a boxed "+N" that opens the full list; in a booking
 * panel every sub-tag is shown in its own outlined box.
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
      hint: 'Still Assigned 15 minutes or more after the driver call time' })
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
          hint: "Not at the pickup point by the client's pick-up time" }
      : { key: 'delayed', label: `Was Delayed · ${formatDuration(d.minutes ?? 0)}`, color: ORANGE,
          hint: "Reached the pickup point after the client's pick-up time" })
  }
  const resub = resubmissionsOf(b)
  if (resub > 0) {
    tags.push({ key: 'resubmitted', label: 'Resubmitted', color: ORANGE,
      hint: `Corrected and resubmitted by the client after a rejection${resub > 1 ? ` (${resub} times)` : ''}` })
  }
  return tags
}

/**
 * Figma "sub-tag" (2308:1764, user 2026-11-26): a 12px box (5px corners like the main tag, user 2026-11-26) with a hairline
 * border in the tag colour, no fill, Darker Grotesque bold 10px capitals.
 * Sub-tags get their own box only in a booking panel; in a table they stay
 * plain coloured text and only the "+N" is boxed (user 2026-11-26).
 */
const PILL = 'inline-flex h-[12px] w-fit min-w-0 max-w-full shrink-0 items-center justify-center whitespace-nowrap rounded-[5px] border-[0.5px] border-solid px-[6px] py-px font-[family-name:var(--font-darker)] text-[10px] font-bold uppercase leading-none'
const TEXT = 'font-[family-name:var(--font-darker)] text-[10px] font-bold uppercase leading-none'

export function SubTagPill({ tag }: { tag: SubTag }) {
  return (
    <Tip label={tag.hint}>
      <span className={PILL} style={{ color: tag.color, borderColor: tag.color }}>
        <span className="truncate">{tag.label}</span>
      </span>
    </Tip>
  )
}

/**
 * The sub-tags under the main tag.
 * - `boxed` (a booking panel): every sub-tag in its own pill, wrapping.
 * - otherwise (a table row): the first written out as plain text, the rest
 *   as a boxed "+N" beside it, click / tap for the list.
 */
export function SubTagLine({ tags, boxed = false, align = 'start' }: {
  tags:   SubTag[]
  boxed?: boolean
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  if (tags.length === 0) return null
  if (boxed) {
    return (
      <span className={`mt-1.5 flex max-w-[240px] flex-wrap gap-1 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
        {tags.map((t) => <SubTagPill key={t.key} tag={t} />)}
      </span>
    )
  }
  const [first, ...rest] = tags
  return (
    <span className={`mt-[3px] flex max-w-full items-center gap-1 ${TEXT}`}>
      <Tip label={first.hint}>
        <span className="truncate" style={{ color: first.color }}>{first.label}</span>
      </Tip>
      {rest.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            {/* Hover: every sub-tag at a glance (user 2026-11-24). Click or tap
                still opens the list with what each one means; the hint hides
                while that list is open. */}
            <button
              type="button"
              // The row opens the booking on click; this only opens the list.
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={`${rest.length} more: ${rest.map((t) => t.label).join(', ')}`}
              // "+N" in its own box (user 2026-11-26).
              className={`${PILL} cursor-pointer border-white text-white`}
            >
              {/* The hover hint sits on the "+N" text itself, not the popover's
                  button, so it works in every table row without opening the
                  booking (user 2026-11-24). It lists every sub-tag. */}
              <Tip
                label={open ? undefined : (
                  <span className="flex flex-col gap-1.5">
                    {tags.map((t) => (
                      <span key={t.key} className="font-[family-name:var(--font-darker)] text-[11px] font-bold uppercase leading-none" style={{ color: t.color }}>
                        {t.label}
                      </span>
                    ))}
                  </span>
                )}
              >
                <span>+{rest.length}</span>
              </Tip>
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
      {/* md = a booking panel header: every sub-tag boxed (Figma 2308:1452). */}
      <SubTagLine tags={tags} boxed={size === 'md'} align={align} />
    </span>
  )
}
