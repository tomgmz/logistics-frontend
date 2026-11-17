'use client'

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { useLongPress } from '@/lib/hooks/useLongPress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/*
 * One line cut off with an ellipsis; the shadcn Tooltip shows the whole text,
 * but ONLY when it is actually cut off (AG Grid "whenTruncated", MUI DataGrid
 * do the same). Mouse: hover. Touch: long press (a tap still opens the row).
 *
 *   <td className="max-w-[220px] truncate"><TruncatedText>{r.origin}</TruncatedText></td>
 *
 * `text` is the tooltip's text when the children aren't plain text.
 */

interface TruncatedTextProps {
  children: ReactNode
  text?: string | null
  className?: string
  as?: 'span' | 'p' | 'div'
}

export function TruncatedText({ children, text, className, as: Tag = 'span' }: TruncatedTextProps) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const longPress = useLongPress()

  const isCut = useCallback(() => {
    return !!el && el.scrollWidth > el.clientWidth + 1
  }, [el])

  const label = text ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : null)

  const body = (
    <Tag
      ref={setEl as never}
      className={cn('block min-w-0 truncate', className)}
      {...(label ? longPress(() => { if (isCut()) setOpen(true) }, () => setOpen(false)) : {})}
    >
      {children}
    </Tag>
  )

  if (!label) return body

  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && isCut())}>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent className="ff-darker">{label}</TooltipContent>
    </Tooltip>
  )
}
