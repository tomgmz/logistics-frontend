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
export type ModuleSection = 'directory' | 'password-resets'

export default function ModuleSectionTabs({
  value,
  onChange,
  directoryLabel = 'Directory',
  pendingCount,
}: {
  value:           ModuleSection
  onChange:        (next: ModuleSection) => void
  /** What this module's list is called — "Users" here, "Administrators" there. */
  directoryLabel?: string
  /** Unactioned requests, surfaced on the tab so the queue announces itself. */
  pendingCount?:   number
}) {
  const tabs: { key: ModuleSection; label: string; icon: React.ReactNode }[] = [
    { key: 'directory',       label: directoryLabel,    icon: <Users size={14} />     },
    { key: 'password-resets', label: 'Password Resets', icon: <KeyRound size={14} /> },
  ]

  return (
    <div
      role="tablist"
      aria-label="Module sections"
      className="flex items-center gap-1 border-b border-[#2a2a2a] px-4 pt-2 shrink-0 overflow-x-auto"
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
            className={`relative flex items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-[13px] font-semibold transition-colors
              ${active
                ? 'text-[#4df9ed]'
                : 'text-[#818181] hover:bg-[#2a2a2a]/50 hover:text-white'}`}
          >
            <span className={active ? 'text-[#4df9ed]' : 'text-[#818181]'}>{t.icon}</span>
            {t.label}

            {showCount && (
              <span
                className={`ml-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none
                  ${active
                    ? 'bg-[#4df9ed] text-[#0a0a0a]'
                    : 'bg-yellow-500/20 text-yellow-400'}`}
                title={`${pendingCount} awaiting action`}
              >
                {pendingCount! > 99 ? '99+' : pendingCount}
              </span>
            )}

            {/* The active underline sits on the container's border, not above it. */}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[#4df9ed]" />
            )}
          </button>
        )
      })}
    </div>
  )
}
