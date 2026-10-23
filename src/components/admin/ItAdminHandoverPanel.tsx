'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Clock } from 'lucide-react'
import ItAdminTransitionModal from '@/components/admin/ItAdminTransitionModal'
import { itAdminService, type ITAdminHandoverStatus } from '@/lib/services/admin/user-management.service'
import { appToast } from '@/lib/toast'

/** A moment as a Manila date, e.g. "Nov 23, 2026, 3:15 PM". */
function formatPh(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

/**
 * The IT Admin's handover, on their dashboard.
 *
 * While they hold the role: a way to hand it to a successor (resignation). Once
 * they have: how long their render period has left before the account closes.
 * Draws nothing until the status has loaded, and nothing if it cannot be read.
 */
export default function ItAdminHandoverPanel() {
  const [status, setStatus] = useState<ITAdminHandoverStatus | null>(null)
  const [open,   setOpen]   = useState(false)

  const load = useCallback(() => {
    itAdminService.handoverStatus().then(setStatus).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  if (!status) return null

  if (status.render_ends_at) {
    const left = daysLeft(status.render_ends_at)
    const successor = status.others.find((o) => !o.render_ends_at)
    const successorName = successor
      ? [successor.first_name, successor.last_name].filter(Boolean).join(' ') || successor.email
      : null
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-[10px] border border-[#ffea00]/40 bg-[#ffea00]/[0.07] px-4 py-3"
      >
        <Clock size={16} className="mt-0.5 shrink-0 text-[#ffea00]" />
        <div className="min-w-0 text-[13px] leading-relaxed text-white/80">
          <p className="font-semibold text-[#ffea00]">
            Render period: {left === 0 ? 'ends today' : `${left} day${left === 1 ? '' : 's'} left`}
          </p>
          <p>
            {successorName ? <>You handed the IT Administrator role to <span className="text-white">{successorName}</span>. </> : null}
            Your account is deactivated and signed out on {formatPh(status.render_ends_at)}.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-[10px] border border-[#424242] bg-[#1b1b1b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-[13px] leading-relaxed">
          <p className="font-semibold text-white">Leaving the role?</p>
          <p className="text-[#818181]">
            Create your successor&apos;s account. They take over at once, and you stay active
            for a {status.render_days}-day render period.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-[#4df9ed] px-4 py-2 text-sm font-medium text-[#4df9ed] transition-colors active:scale-[0.98] sm:w-auto [@media(hover:hover)]:hover:bg-[#4df9ed]/10"
        >
          Hand Over IT Administrator Role <ArrowLeftRight size={15} />
        </button>
      </div>

      <ItAdminTransitionModal
        open={open}
        renderDays={status.render_days}
        onClose={() => setOpen(false)}
        onDone={(result) => {
          appToast.info(`Your account stays active until ${formatPh(result.outgoing.render_ends_at)}.`)
          load()
        }}
      />
    </>
  )
}
