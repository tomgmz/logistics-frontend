'use client'

import { Fragment } from 'react'
import { ChevronRight, HomeLine } from '@untitledui/icons'
import { cn } from '@/lib/utils'

/**
 * Untitled UI's Breadcrumbs, type "text" with the chevron divider
 * (untitledui.com/react/components/breadcrumbs): the home icon first, chevrons
 * between, the current item in the brand colour, no rules or background.
 * Their component is not in the free code, so this follows the documented
 * design in our palette: text-quaternary → #818181, hover → white,
 * brand-secondary → #4df9ed.
 */
export interface Crumb {
  label: string
  /** Leave out on the current (last) item. */
  onClick?: () => void
}

export function Breadcrumbs({ items, homeLabel = 'Home', onHome, className }: {
  items: Crumb[]
  homeLabel?: string
  onHome?: () => void
  className?: string
}) {
  const link =
    'rounded-md text-sm font-semibold text-[#818181] outline-[#4df9ed] transition focus-visible:outline-2 focus-visible:outline-offset-2 [@media(hover:hover)]:hover:text-white'

  return (
    <nav aria-label="Breadcrumb" className={cn('ff-regular', className)}>
      <ol className="flex flex-wrap items-center gap-1.5 md:gap-2">
        <li className="flex items-center">
          {onHome ? (
            <button type="button" onClick={onHome} aria-label={homeLabel} className={cn(link, 'p-0.5')}>
              <HomeLine className="size-5" />
            </button>
          ) : (
            <HomeLine aria-label={homeLabel} className="size-5 text-[#818181]" />
          )}
        </li>
        {items.map((c, i) => {
          const current = i === items.length - 1
          return (
            <Fragment key={i}>
              <li aria-hidden className="flex items-center text-[#5c5c5c]">
                <ChevronRight className="size-4" />
              </li>
              <li className="flex min-w-0 items-center">
                {current || !c.onClick ? (
                  <span aria-current={current ? 'page' : undefined}
                    className={cn('truncate text-sm font-semibold', current ? 'text-[#4df9ed]' : 'text-[#818181]')}>
                    {c.label}
                  </span>
                ) : (
                  <button type="button" onClick={c.onClick} className={cn(link, 'truncate')}>
                    {c.label}
                  </button>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
