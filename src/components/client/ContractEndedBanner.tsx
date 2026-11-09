'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, CalendarCheck, X } from 'lucide-react'
import { PALETTE } from '@/lib/palette'
import { useContractStore, formatContractDay, contractDaysLeft, type ContractStatus } from '@/lib/contract-status'

const DISMISS_KEY = 'contract-banner-dismissed'

function dayCount(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`
}

/**
 * The contract validity banner across the top of every client page
 * (lib/contract-status):
 *
 *   ended (7-day read-only period) — red, bookings closed
 *   ends today / ≤ 7 days left     — orange
 *   ≤ 30 days left                 — yellow
 *   more than 30 days              — green one-liner, can be hidden for the session
 *
 * Nothing is shown when no end date is on file (older clients).
 */
export default function ContractEndedBanner({ inline = false }: { inline?: boolean } = {}) {
  const contract = useContractStore((s) => s.contract)
  const pathname = usePathname()
  // The Booking page places its own copy above the office-hours notice
  // (BookingDetails, inline); the layout's copy stays off there.
  if (!inline && pathname?.startsWith('/client/booking')) return <BannerSlot inline={inline} />
  return <BannerSlot inline={inline} contract={contract} />
}

function BannerSlot({ inline, contract = null }: { inline: boolean; contract?: ContractStatus | null }) {
  // Which end date the viewer hid the green one-liner for (this tab session);
  // a new date shows it again.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  useEffect(() => {
    try { setDismissedFor(sessionStorage.getItem(DISMISS_KEY)) } catch { /* storage blocked */ }
  }, [])

  if (!contract || !contract.valid_until) return null
  const dismissed = dismissedFor === contract.valid_until

  if (contract.state !== 'ok') {
    return (
      <Banner inline={inline} color={PALETTE.red} icon="alert">
        <span className="font-bold" style={{ color: PALETTE.red }}>Your contract has expired.</span>{' '}
        It ended on {formatContractDay(contract.valid_until)}, so new bookings are closed. You can still view your
        deliveries and records
        {contract.access_until ? <> until {formatContractDay(contract.access_until)}, after which sign-in closes</> : null}.
        Contact 8338 to renew your contract. Deliveries already booked carry on as normal.
      </Banner>
    )
  }

  const left = contractDaysLeft(contract.valid_until)
  const until = formatContractDay(contract.valid_until)

  if (left <= 0) {
    return (
      <Banner inline={inline} color={PALETTE.orange} icon="alert">
        <span className="font-bold" style={{ color: PALETTE.orange }}>Your contract ends today ({until}).</span>{' '}
        Contact 8338 to renew it so booking stays open.
      </Banner>
    )
  }
  if (left <= 30) {
    const color = left <= 7 ? PALETTE.orange : PALETTE.yellow
    return (
      <Banner inline={inline} color={color} icon="alert">
        <span className="font-bold" style={{ color }}>Your contract expires in {dayCount(left)}.</span>{' '}
        It is valid until {until}. Contact 8338 to renew it so booking stays open.
      </Banner>
    )
  }

  if (dismissed) return null
  return (
    <Banner
      inline={inline}
      color={PALETTE.green}
      icon="ok"
      onDismiss={() => {
        setDismissedFor(contract.valid_until)
        try { sessionStorage.setItem(DISMISS_KEY, contract.valid_until!) } catch { /* private mode */ }
      }}
    >
      <span className="font-bold" style={{ color: PALETTE.green }}>Contract active</span>{' '}
      until {until} ({dayCount(left)} left).{' '}
      <Link href="/client/profile" className="underline underline-offset-2">Details</Link>
    </Banner>
  )
}

function Banner({
  inline, color, icon, onDismiss, children,
}: {
  inline: boolean
  color: string
  icon: 'alert' | 'ok'
  onDismiss?: () => void
  children: React.ReactNode
}) {
  const Icon = icon === 'alert' ? AlertTriangle : CalendarCheck
  return (
    <div
      role={icon === 'alert' ? 'alert' : 'status'}
      className={`${inline ? '' : 'mx-4 mt-3 sm:mx-6 '}flex shrink-0 items-start gap-3 rounded-lg border px-4 py-3`}
      style={{ borderColor: color, background: `${color}1a` }}
    >
      <Icon size={18} className="mt-0.5 shrink-0" style={{ color }} />
      <p className="ff-regular min-w-0 flex-1 text-sm leading-relaxed text-white">{children}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hide"
          className="-m-1 shrink-0 rounded p-1 text-white/60 transition-colors [@media(hover:hover)]:hover:text-white"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
