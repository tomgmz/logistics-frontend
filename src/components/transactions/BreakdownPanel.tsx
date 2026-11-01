'use client'

import { useState } from 'react'
import { PauseCircle, Truck, Wrench } from 'lucide-react'

import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import { pauseService } from '@/lib/services/admin/pause.service'
import { RemarksModal } from '@/components/layout/ReusableModal'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { formatDateTime } from './transaction-format'
import { PALETTE } from '@/lib/palette'

const RED = PALETTE.red

/**
 * The driver reported a breakdown the trip can't continue from, and the office
 * hasn't decided yet. Only the Company Administrator and the Operations Manager
 * pause a delivery (a pause tells the client), so nothing is paused for them —
 * this puts the decision one tap away:
 *
 *   Pause for breakdown    the note pre-filled with the driver's words; Replace
 *                          crew unlocks once paused
 *   Truck is moving again  fixed on the spot (or a wrong report); stops the
 *                          reminders. The vehicle stays on hold until inspected.
 *
 * The office is reminded every 15 minutes until one of them is done.
 */
export default function BreakdownPanel({ bookingId, reportedAt, note, canAct, allowed, onUpdated }: {
  bookingId:  string
  reportedAt: string
  note:       string | null
  /** Operations Manager / Company Administrator, and nobody else is editing the booking. */
  canAct:     boolean
  /** The Booking Management tier allows it. Read Only sees the buttons disabled. */
  allowed:    boolean
  onUpdated:  () => void
}) {
  const [pausing,    setPausing]    = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [busy,       setBusy]       = useState(false)

  async function pause(text: string) {
    setBusy(true)
    try {
      await pauseService.pause(bookingId, 'vehicle_breakdown', text)
      appToast.success('Delivery paused for the breakdown. The client and the driver have been told.')
      setPausing(false)
      onUpdated()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not pause the delivery.'))
    } finally {
      setBusy(false)
    }
  }

  async function dismiss(text: string) {
    setBusy(true)
    try {
      await initCsrf()
      await proxyApi.patch(`/admin/assignments/${bookingId}/breakdown/dismiss`, { note: text })
      appToast.success('Breakdown closed. The vehicle stays on hold until the Fleet Manager inspects it.')
      setDismissing(false)
      onUpdated()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not close the breakdown.'))
    } finally {
      setBusy(false)
    }
  }

  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'

  return (
    <div className="rounded-xl border p-3.5 flex flex-col gap-2.5" style={{ borderColor: `${RED}66`, background: `${RED}10` }}>
      <div className="flex items-center gap-2">
        <Wrench size={16} style={{ color: RED }} />
        <h3 className="text-sm font-bold text-white">Driver reported a breakdown · the trip can&apos;t continue</h3>
      </div>
      {note && <p className="text-[13px] text-white/85 whitespace-pre-wrap">{note}</p>}
      <p className="text-[11px] text-white/50">
        Reported {formatDateTime(reportedAt)}. The delivery is not paused yet. Pause it to replace the vehicle or set a continuation date, or close this if the truck is moving again.
      </p>
      {canAct && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setPausing(true)} {...writeAccess(allowed)}
            className={btn} style={{ background: PALETTE.yellow, color: '#000' }}>
            <PauseCircle size={13} /> Pause for breakdown
          </button>
          <button type="button" disabled={busy} onClick={() => setDismissing(true)} {...writeAccess(allowed)}
            className={`${btn} border border-white/15 text-white/80 [@media(hover:hover)]:hover:text-white`}>
            <Truck size={13} /> Truck is moving again
          </button>
        </div>
      )}

      {/* Mounted on open, so the note starts as the driver's words each time. */}
      {pausing && (
        <RemarksModal
          open
          title="Pause for the breakdown?"
          description="The client is told the delivery is paused for a vehicle breakdown. Afterwards you can replace the vehicle or set when it continues."
          remarksLabel="Note (shown to the driver and the office, not the client)"
          initialRemarks={note ? `Breakdown reported by the driver: ${note}` : 'Breakdown reported by the driver.'}
          confirmLabel={busy ? 'Pausing…' : 'Pause delivery'}
          cancelLabel="Cancel"
          busy={busy}
          disableBackdropClose={busy}
          onConfirm={(text) => { void pause(text) }}
          onCancel={() => { if (!busy) setPausing(false) }}
        />
      )}
      <RemarksModal
        open={dismissing}
        tone="approve"
        title="Truck is moving again?"
        description="Closes this breakdown and stops the reminders. The vehicle stays Under Maintenance, if it was put there, until the Fleet Manager inspects it."
        remarksLabel="What happened"
        remarksPlaceholder="e.g. Flat tyre changed on the spot; driver continuing."
        confirmLabel={busy ? 'Saving…' : 'Close breakdown'}
        cancelLabel="Cancel"
        busy={busy}
        disableBackdropClose={busy}
        onConfirm={(text) => { void dismiss(text) }}
        onCancel={() => { if (!busy) setDismissing(false) }}
      />
    </div>
  )
}
