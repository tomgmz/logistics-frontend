/**
 * A grey placeholder bar that pulses while the real content loads. Size and
 * shape come from `className` (e.g. "h-8 w-8 rounded-lg"); lay several out in
 * the shape of what is coming, so the page does not jump when it arrives.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse motion-reduce:animate-none rounded-md bg-white/[0.06] ${className}`} />
}
