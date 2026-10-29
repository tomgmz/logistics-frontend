'use client'

import { KeyRound, Users } from 'lucide-react'

/**
 * The two halves of a people-management module.
 *
 * These were both entries in the same role dropdown, which put a queue of
 * pending work in a list of "which kind of account am I looking at" — so the
 * reset queue was reachable only by opening a menu and scrolling past six role
 * filters, and nothing on screen said there was work waiting in it.
 *
 * They are different things: 'directory' is a browsable list filtered by role,
 * 'password-resets' is a queue you act on. Splitting them into top-level tabs
 * keeps the role dropdown for what it is good at — filtering the directory — and
 * gives the queue a permanent, visible home.
 */
export type ModuleSection = 'directory' | 'people' | 'password-resets'

export default function ModuleSectionTabs({
  value,
  onChange,
  directoryLabel = 'Directory',
  resetsLabel = 'Password Resets',
  peopleLabel,
  pendingCount,
  variant = 'compact',
}: {
  value:           ModuleSection
  onChange:        (next: ModuleSection) => void
  /** What this module's list is called — "Users" here, "Administrators" there. */
  directoryLabel?: string
  resetsLabel?:    string
  /** A second directory between the two: the IT Admin's "Clients & Drivers". */
  peopleLabel?:    string
  /** Unactioned requests, surfaced on the tab so the queue announces itself. */
  pendingCount?:   number
  /** 'large' is the table format's look (Figma 3234:790): 18px small caps on a #424242 rule. */
  variant?:        'compact' | 'large'
}) {
  const large    = variant === 'large'
  // Large icons step down below 3xl (1920px), like the rest of the User Management Figma.
  const iconCls = large ? 'size-[18px] 3xl:size-[22px]' : 'size-[14px]'
  const tabs: { key: ModuleSection; label: string; icon: React.ReactNode }[] = [
    { key: 'directory',       label: directoryLabel, icon: <Users className={iconCls} />     },
    ...(peopleLabel ? [{ key: 'people' as const, label: peopleLabel, icon: <Users className={iconCls} /> }] : []),
    { key: 'password-resets', label: resetsLabel, icon: <KeyRound className={iconCls} /> },
  ]

  return (
    <div
      role="tablist"
      aria-label="Module sections"
      className={large
        ? 'flex items-center shadow-[inset_0_-1px_0_#424242] px-2 sm:px-4 3xl:px-[25px] pt-2.5 3xl:pt-[17px] shrink-0 overflow-x-auto overflow-y-hidden'
        : 'flex items-center gap-1 shadow-[inset_0_-1px_0_#2a2a2a] px-4 pt-2 shrink-0 overflow-x-auto overflow-y-hidden'}
    >
      {tabs.map((t) => {
        const active = value === t.key
        const showCount = t.key === 'password-resets' && !!pendingCount && pendingCount > 0

        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`relative flex items-center whitespace-nowrap rounded-t-lg transition-colors
              ${large ? 'ff-sc gap-2 3xl:gap-[9px] px-2.5 pb-2.5 3xl:pb-[14px] text-[15px] 3xl:text-[18px] font-bold' : 'gap-2 px-4 py-2.5 text-[13px] font-semibold'}
              ${active
                ? 'text-[#4df9ed]'
                : 'text-[#818181] hover:bg-[#2a2a2a]/50 hover:text-white'}`}
          >
            <span className={active ? 'text-[#4df9ed]' : 'text-[#818181]'}>{t.icon}</span>
            {t.label}

            {showCount && (
              <span
                className={large
                  // Figma: a 22×18 pill, yellow while the tab is not open, cyan when it is.
                  ? `inline-flex h-[16px] 3xl:h-[18px] min-w-[20px] 3xl:min-w-[22px] items-center justify-center rounded-[10px] border-[0.5px] px-1 text-[12px] 3xl:text-[14px] font-bold leading-none
                    ${active ? 'border-[#4df9ed] bg-[#4df9ed]/[0.24] text-[#4df9ed]' : 'border-[#ffea00] bg-[#ffea00]/20 text-[#ffea00]'}`
                  : `ml-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none
                  ${active
                    ? 'bg-[#4df9ed] text-[#0a0a0a]'
                    : 'bg-yellow-500/20 text-yellow-400'}`}
                title={`${pendingCount} awaiting action`}
              >
                {pendingCount! > 99 ? '99+' : pendingCount}
              </span>
            )}

            {/* The active underline covers the divider. The divider is an inset shadow,
                not a border, so the underline lies inside the row: a border would
                push it 1px outside, and that overhang made the row scroll. */}
            {active && (
              <span className={`absolute inset-x-0 bottom-0 rounded-full bg-[#4df9ed] ${large ? 'h-px' : 'h-[2px]'}`} />
            )}
          </button>
        )
      })}
    </div>
  )
}
