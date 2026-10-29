import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The table card every web table sits in (Figma 3234:790 / 3234:594, the
 * table format for the whole web app since 2026-10-30): #1b1b1b, a 0.5px
 * #424242 border, 10px corners and a soft drop shadow. Inside it, top to
 * bottom: the section tabs (when the module has them), the filter row
 * (FilterBar, with the main action at its far right), the table, the
 * pagination bar. No title row: the module's name is in the page header.
 */

/**
 * `untitled` keeps the earlier Untitled UI card (ring, xl corners) for the
 * screens the user asked to leave as they are: Document Management and the
 * client's Transaction History.
 */
function Root({ children, className, untitled = false, ...props }: HTMLAttributes<HTMLDivElement> & { untitled?: boolean }) {
  return (
    <div {...props} className={cn(untitled
      ? 'overflow-hidden rounded-xl bg-[#1b1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242]'
      : 'overflow-hidden rounded-[10px] border-[0.5px] border-[#424242] bg-[#1b1b1b] shadow-[0_4px_4px_rgba(0,0,0,0.25)]', className)}>
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
 * A title row with buttons, for the few cards that are not a filtered table
 * (dashboard panels). Tables put their buttons in FilterBar's `trailing`.
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
