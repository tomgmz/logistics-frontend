'use client'

/**
 * The one Refresh button, as the Figma draws it (client Transaction History):
 * a grey outlined pill, the refresh icon, "Refresh" in bold small caps. Every
 * page that re-reads its data on demand uses this, so they all look the same.
 */
export default function RefreshButton({
  onClick,
  loading = false,
  disabled = false,
  className = '',
  ariaLabel,
}: {
  onClick: () => void
  /** Spins the icon while a re-read is in flight. */
  loading?: boolean
  disabled?: boolean
  /** Layout only (margins, self-alignment); the look is fixed here. */
  className?: string
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`ff-sc inline-flex items-center gap-1.5 h-[30px] pl-2.5 pr-3.5 rounded-[15px] border border-[#818181]
                  !text-[11px] font-bold text-[#818181] whitespace-nowrap shrink-0 cursor-pointer transition-colors
                  hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/ui/refresh.svg" alt="" width={16} height={16} draggable={false}
        className={`shrink-0 ${loading ? 'animate-spin' : ''}`} />
      Refresh
    </button>
  )
}
