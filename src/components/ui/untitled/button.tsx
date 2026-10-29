'use client'

import type { ButtonHTMLAttributes, FC, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Untitled UI's Button (components/base/buttons/button.tsx), ported without
 * react-aria and with its theme tokens swapped for our palette:
 * brand-solid → #4df9ed (dark text on it), bg-primary → #1b1b1b,
 * ring-primary → #424242, text-secondary → #e5e5e5, fg-quaternary → #818181.
 * Their CLI can't be installed as is: its `bg-primary` / `bg-secondary` names
 * clash with the shadcn tokens in globals.css.
 */

const common = [
  'group relative inline-flex h-max cursor-pointer items-center justify-center whitespace-nowrap outline-[#4df9ed] transition duration-100 ease-linear before:absolute focus-visible:outline-2 focus-visible:outline-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50',
  '*:data-icon:pointer-events-none *:data-icon:size-5 *:data-icon:shrink-0',
].join(' ')

const sizes = {
  sm: 'gap-1 rounded-lg px-3 py-2 text-sm font-semibold before:rounded-[7px] data-icon-only:p-2',
  md: 'gap-1 rounded-lg px-3.5 py-2.5 text-sm font-semibold before:rounded-[7px] data-icon-only:p-2.5',
  // The table filter row's buttons (Figma 3234:790): 44px tall at 1920, small
  // caps, 10px corners; a step smaller below 3xl like the rest of the table.
  toolbar: 'ff-sc h-[38px] 3xl:h-[44px] gap-1.5 3xl:gap-2 rounded-[10px] px-3 3xl:px-3.5 text-[15px] 3xl:text-[18px] font-normal before:rounded-[9px] data-icon-only:px-0 data-icon-only:w-[38px] 3xl:data-icon-only:w-[44px]',
}

// shadow-xs-skeuomorphic, as Untitled UI defines it, on a dark surface.
const SKEUO = 'shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(0,0,0,0.18),inset_0_-2px_0_rgba(0,0,0,0.25)]'

const colors = {
  primary: [
    `bg-[#4df9ed] text-[#0a0a0a] ${SKEUO} ring-1 ring-transparent ring-inset [@media(hover:hover)]:enabled:hover:bg-[#7bfbf5]`,
    // Inner border gradient
    'before:absolute before:inset-px before:border before:border-white/12 before:mask-b-from-0%',
    '*:data-icon:text-[#0a0a0a]/60',
  ].join(' '),
  // The row's main action (Create Administrator, Export): cyan outline on a cyan tint.
  accent: [
    'border border-[#4df9ed] bg-[#4df9ed]/[0.19] text-[#4df9ed] [@media(hover:hover)]:enabled:hover:bg-[#4df9ed]/[0.28]',
    '*:data-icon:text-[#4df9ed]',
  ].join(' '),
  // Filters, Select Date and the like: grey block on the card.
  tool: [
    'border border-[#343434] bg-[#2a2828] text-white [@media(hover:hover)]:enabled:hover:bg-[#343232]',
    '*:data-icon:text-white',
  ].join(' '),
  secondary: [
    `bg-[#1b1b1b] text-[#e5e5e5] ${SKEUO} ring-1 ring-[#424242] ring-inset [@media(hover:hover)]:enabled:hover:bg-[#262626] [@media(hover:hover)]:enabled:hover:text-white`,
    '*:data-icon:text-[#818181] [@media(hover:hover)]:enabled:hover:*:data-icon:text-[#c4c4c4]',
  ].join(' '),
}

export interface UButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  size?: keyof typeof sizes
  color?: keyof typeof colors
  iconLeading?: FC<{ className?: string }>
  children?: ReactNode
}

export function Button({ size = 'sm', color = 'primary', iconLeading: IconLeading, children, className, type = 'button', ...props }: UButtonProps) {
  const iconOnly = !!IconLeading && !children
  return (
    <button
      type={type}
      data-icon-only={iconOnly ? true : undefined}
      {...props}
      className={cn(common, sizes[size], colors[color], className)}
    >
      {IconLeading && <span data-icon="leading" className="flex"><IconLeading className={cn('pointer-events-none size-5 shrink-0', size === 'toolbar' && '3xl:size-[22px]')} /></span>}
      {children && <span data-text className="px-0.5">{children}</span>}
    </button>
  )
}
