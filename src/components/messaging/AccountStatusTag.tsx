'use client'

import type { AccountStatus } from '@/app/types/messaging/messaging.types'

/**
 * A chat with someone whose account is no longer active (2026-11-18). As in
 * Slack and Microsoft Teams, their messages stay readable, their name carries
 * a tag, and a one-to-one chat can't be replied to (the server refuses the
 * send anyway). Colours are User Management's for the same statuses.
 */

export function isAccountClosed(status?: AccountStatus | null): status is 'inactive' | 'archived' {
  return status === 'inactive' || status === 'archived'
}

/** The line shown where the message box was. */
export function closedChatNotice(firstName: string | null | undefined, status: 'inactive' | 'archived'): string {
  const who = firstName?.trim() ? `${firstName.trim()}'s account` : 'This account'
  return `You can't reply. ${who} is ${status === 'archived' ? 'archived' : 'inactive'}.`
}

const TONE = {
  inactive: { label: 'Inactive', cls: 'bg-[#8a38f5]/[0.12] text-[#8a38f5] border-[#8a38f5]' },
  archived: { label: 'Archived', cls: 'bg-[#ffea00]/20 text-[#ffea00] border-[#ffea00]' },
} as const

export default function AccountStatusTag({ status, className = '' }: { status?: AccountStatus | null; className?: string }) {
  if (!isAccountClosed(status)) return null
  const t = TONE[status]
  return (
    <span className={`inline-flex h-[18px] shrink-0 items-center rounded-full border px-1.5 text-[11px] font-bold leading-none ${t.cls} ${className}`}>
      {t.label}
    </span>
  )
}
