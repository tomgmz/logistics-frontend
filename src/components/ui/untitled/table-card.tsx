import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Untitled UI's TableCard (components/application/table/table.tsx), size "md",
 * in our palette: bg-primary → #1b1b1b, border-secondary → #424242,
 * text-primary → white, text-tertiary → #818181.
 */

function Root({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('overflow-hidden rounded-xl bg-[#1b1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242]', className)}>
      {children}
    </div>
  )
}

interface HeaderProps {
  title: string
  contentTrailing?: ReactNode
  className?: string
}

/**
 * The table's title and its buttons, with a line under it. Just the title: no
 * count badge or description beside it (the user's call, 2026-10-27).
 */
function Header({ title, contentTrailing, className }: HeaderProps) {
  return (
    <div className={cn('relative flex flex-col items-start gap-4 border-b border-[#424242] bg-[#1b1b1b] px-4 py-5 md:flex-row md:items-center md:px-6', className)}>
      <h2 className="flex-1 text-base font-semibold text-white">{title}</h2>
      {contentTrailing}
    </div>
  )
}

export const TableCard = { Root, Header }
