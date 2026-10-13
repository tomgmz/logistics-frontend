import { Check, CheckCheck } from 'lucide-react'

/**
 * Read status on your own messages: a double check once it has been seen, a
 * single check while it has not.
 */
export default function ReadTicks({ seen, size = 11 }: { seen: boolean; size?: number }) {
  return seen
    ? <CheckCheck size={size} className="text-[var(--color-cyan)] shrink-0" aria-label="Seen" />
    : <Check size={size} className="text-white/25 shrink-0" aria-label="Sent" />
}
