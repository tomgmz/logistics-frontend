import type { HTMLAttributes, ReactNode } from 'react'
import { isValidElement } from 'react'
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

/** Untitled UI's "modern" gray badge, size sm: the count beside the title. */
export function BadgeModern({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex size-max items-center whitespace-nowrap rounded-md bg-[#1b1b1b] px-1.5 py-0.5 text-xs font-medium text-[#c4c4c4] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] ring-inset', className)}>
      {children}
    </span>
  )
}

interface HeaderProps {
  title: string
  /** A string becomes the modern gray badge; an element is used as is. */
  badge?: ReactNode
  description?: string
  contentTrailing?: ReactNode
  className?: string
}

function Header({ title, badge, description, contentTrailing, className }: HeaderProps) {
  return (
    <div className={cn('relative flex flex-col items-start gap-4 border-b border-[#424242] bg-[#1b1b1b] px-4 py-5 md:flex-row md:px-6', className)}>
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {badge ? (isValidElement(badge) ? badge : <BadgeModern>{badge}</BadgeModern>) : null}
        </div>
        {description && <p className="text-sm text-[#818181]">{description}</p>}
      </div>
      {contentTrailing}
    </div>
  )
}

export const TableCard = { Root, Header }
