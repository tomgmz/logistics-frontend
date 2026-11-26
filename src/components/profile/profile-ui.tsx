import type { ReactNode } from 'react'

/**
 * Shared pieces of the Profile page, laid out like TailAdmin's profile page
 * (2026-11-26): one outer card titled "Profile" holding bordered cards, each
 * with its title on the left and its extra (a note or a badge, where TailAdmin
 * puts its Edit button) on the right.
 */

/** The outer card: the same frame as the IT Administrator dashboard's cards. */
export const OUTER_CARD =
  'rounded-[10px] border-[0.5px] border-[#424242] bg-[#1b1b1b] shadow-[0_4px_4px_rgba(0,0,0,0.25)]'

/** A card inside it (TailAdmin: bordered, no fill of its own). */
export const INNER_CARD = 'rounded-[10px] border-[0.5px] border-[#424242] p-4 sm:p-5 lg:p-6'

export function CardHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6 lg:mb-6">
      <h3 className="ff-sc text-[18px] leading-tight text-white">{title}</h3>
      {aside}
    </div>
  )
}

/** A TailAdmin label/value pair: small grey label over the value. */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1.5 text-[13px] leading-normal text-[#818181]">{label}</dt>
      <dd className="break-words text-[15px] font-medium text-white">{value}</dd>
    </div>
  )
}

/** TailAdmin's field grid: one column on phones, two from lg, wide gap on very wide screens. */
export const FIELD_GRID = 'grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-7 2xl:gap-x-32'
