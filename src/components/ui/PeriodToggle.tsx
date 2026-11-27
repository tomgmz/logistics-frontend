'use client'

/**
 * The Weekly / Monthly switch on every dashboard chart (2026-11-27). A
 * segmented control (one tap, all choices visible), as Stripe's and Google
 * Analytics' chart interval switches are; the dashboard charts share it so
 * they look and behave the same.
 */
export type ChartPeriod = 'weekly' | 'monthly'

const LABEL: Record<string, string> = { weekly: 'Weekly', monthly: 'Monthly', annually: 'Yearly' }

export default function PeriodToggle<P extends string = ChartPeriod>({
  value,
  onChange,
  options = ['weekly', 'monthly'] as unknown as readonly P[],
  disabled = false,
  label = 'Chart period',
}: {
  value: P
  onChange: (p: P) => void
  options?: readonly P[]
  disabled?: boolean
  label?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 gap-1 rounded-lg p-1 ring-1 ring-[#424242] ring-inset bg-[#141414]"
    >
      {options.map((p) => {
        const on = p === value
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => { if (!on) onChange(p) }}
            className={`min-h-[32px] rounded-md px-3 text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50 ${
              on ? 'bg-[#4df9ed]/15 text-[#4df9ed]' : 'text-[#818181] [@media(hover:hover)]:hover:text-white'
            }`}
          >
            {LABEL[p] ?? p}
          </button>
        )
      })}
    </div>
  )
}
