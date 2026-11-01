'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { driverService, type DriverLicenseHistoryRow } from '@/lib/services/admin/user-management.service'
import { formatDateTime } from '@/app/utils/timeFormat'

/**
 * The licenses a driver held before the current one: every renewal, corrected
 * number or replaced photo keeps the old card here, with who changed it and the
 * note they gave. Collapsed by default; renders nothing when there is none.
 */
export default function LicenseHistory({ userId }: { userId: string }) {
  const [rows, setRows] = useState<DriverLicenseHistoryRow[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    driverService.licenseHistory(userId)
      .then((r) => { if (!cancelled) setRows(r ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  if (rows.length === 0) return null

  return (
    <div className="mt-3 border-t border-[#424242] pt-3">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#818181] [@media(hover:hover)]:hover:text-white">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Previous licenses ({rows.length})
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {rows.map((r) => {
            const by = [r.replacer?.first_name, r.replacer?.last_name].filter(Boolean).join(' ')
            return (
              <li key={r.history_id} className="rounded-lg border border-[#2a2a2a] bg-[#1b1b1b] px-3 py-2 text-[12px] text-[#c4c4c4]">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="font-mono text-white">{r.license_number ?? '—'}</span>
                  <span>Valid until {r.license_expiry?.slice(0, 10) ?? '—'}</span>
                </div>
                <p className="mt-1 text-[11px] text-[#818181]">
                  Replaced {formatDateTime(r.replaced_at)}{by ? ` by ${by}` : ''}
                  {r.license_image_url && (
                    <> · <a href={r.license_image_url} target="_blank" rel="noopener noreferrer" className="text-[#4df9ed] underline-offset-2 [@media(hover:hover)]:hover:underline">old card</a></>
                  )}
                </p>
                {r.change_note && <p className="mt-1 whitespace-pre-wrap text-[11px] text-white/70">{r.change_note}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
