'use client'

import { AlertTriangle } from 'lucide-react'
import { PALETTE } from '@/lib/palette'
import { useContractStore, formatContractDay } from '@/lib/contract-status'

/**
 * Shown across the top of every client page once their contract has ended and
 * they are in the 7-day read-only period (lib/contract-status).
 */
export default function ContractEndedBanner() {
  const contract = useContractStore((s) => s.contract)
  if (!contract || contract.state === 'ok' || !contract.valid_until) return null

  return (
    <div
      role="alert"
      className="mx-4 mt-3 flex shrink-0 items-start gap-3 rounded-lg border px-4 py-3 sm:mx-6"
      style={{ borderColor: PALETTE.red, background: `${PALETTE.red}1a` }}
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: PALETTE.red }} />
      <p className="ff-regular min-w-0 text-sm leading-relaxed text-white">
        <span className="font-bold" style={{ color: PALETTE.red }}>Your contract has expired.</span>{' '}
        It ended on {formatContractDay(contract.valid_until)}, so new bookings are closed. You can still view your
        deliveries and records
        {contract.access_until ? <> until {formatContractDay(contract.access_until)}, after which sign-in closes</> : null}.
        Contact 8338 to renew your contract. Deliveries already booked carry on as normal.
      </p>
    </div>
  )
}
