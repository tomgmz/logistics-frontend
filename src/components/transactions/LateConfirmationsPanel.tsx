'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, MapPin, X } from 'lucide-react'

import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import ReusableModal, { RemarksModal } from '@/components/layout/ReusableModal'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { FileViewButton, ProtectedImg } from '@/components/ui/FileViewer'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { PALETTE } from '@/lib/palette'
import { formatDateTime } from './transaction-format'
import { BORDER_C, MUTED } from './transaction-theme'

/**
 * Late drop-off confirmations: sent from the previous main driver's phone after
 * the office swapped the drivers (or replaced the driver), and not recorded
 * automatically because they failed a check (done after the change, more than
 * 100 m away, no photo, the GPS trail disagrees, an older app with no time).
 *
 * Accept records the drop-off with the driver's own photo and position. Dismiss
 * needs a reason and leaves the drop-off open (confirm it another way, or
 * report a problem). Until one of those, the drop-off stays undelivered, so the
 * office is reminded every 15 minutes.
 */

export interface LateConfirmation {
  late_id:          string
  /** 'pickup' = a run's loading; 'dropoff' = one drop-off. */
  kind:             'pickup' | 'dropoff'
  trip_stop_id:     string | null
  trip_number:      number | null
  stop_number:      number | null
  address:          string | null
  stop_status:      string
  driver_name:      string | null
  confirmed_at:     string | null
  received_at:      string
  proof_photo_url:  string | null
  latitude:         number | null
  longitude:        number | null
  distance_m:       number | null
  override_reason:  string | null
  reason_text:      string[]
  status:           'pending' | 'accepted' | 'dismissed' | 'superseded'
  resolved_at:      string | null
  resolved_by_name: string | null
  resolution_note:  string | null
}

const STATUS_TEXT: Record<LateConfirmation['status'], string> = {
  pending:    'Waiting for a decision',
  accepted:   'Accepted',
  dismissed:  'Dismissed',
  superseded: 'Recorded another way',
}

export default function LateConfirmationsPanel({ bookingId, canAct, allowed, onUpdated }: {
  bookingId: string
  /** Operations Manager / Company Administrator, and nobody else is editing the booking. */
  canAct:    boolean
  /** The Booking Management tier allows it. Read Only sees the buttons disabled. */
  allowed:   boolean
  onUpdated: () => void
}) {
  const [rows,    setRows]    = useState<LateConfirmation[]>([])
  const [accept,  setAccept]  = useState<LateConfirmation | null>(null)
  const [dismiss, setDismiss] = useState<LateConfirmation | null>(null)
  const [busy,    setBusy]    = useState(false)

  const load = useCallback(() => {
    proxyApi.get<{ data: LateConfirmation[] }>(`/admin/assignments/${bookingId}/late-confirmations`)
      .then(({ data }) => setRows(data.data ?? []))
      .catch(() => {})
  }, [bookingId])
  useEffect(() => { load() }, [load])
  useLiveTable(['live:bookings'], load)

  async function decide(kind: 'accept' | 'dismiss', row: LateConfirmation, text: string) {
    setBusy(true)
    try {
      await initCsrf()
      const { data } = await proxyApi.post<{ data: LateConfirmation[] }>(
        `/admin/assignments/${bookingId}/late-confirmations/${row.late_id}/${kind}`,
        kind === 'accept' ? { note: text || null } : { reason: text },
      )
      setRows(data.data ?? [])
      appToast.success(kind === 'accept'
        ? "Recorded with the driver's photo and location."
        : 'Late confirmation dismissed. The step is still open.')
      setAccept(null)
      setDismiss(null)
      onUpdated()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, kind === 'accept' ? 'Could not accept it.' : 'Could not dismiss it.'))
      load()
    } finally {
      setBusy(false)
    }
  }

  if (rows.length === 0) return null
  const pending = rows.filter((r) => r.status === 'pending')
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'

  return (
    <div className="rounded-xl border p-3.5 flex flex-col gap-3"
      style={{ borderColor: pending.length ? 'rgba(255,122,48,0.55)' : BORDER_C }}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-white">
        <AlertTriangle size={15} style={{ color: PALETTE.orange }} />
        Late confirmations from the previous main driver{pending.length ? ` · ${pending.length} waiting` : ''}
      </h3>
      {pending.length > 0 && (
        <p className="text-[11px]" style={{ color: MUTED }}>
          Sent from the previous main driver&apos;s phone after the drivers were changed. Check the photo and location.
          The delivery can&apos;t finish until each one is accepted, dismissed, or the drop-off is confirmed another way.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.late_id} className="rounded-lg border border-white/10 p-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-white break-words">
                  {r.kind === 'pickup'
                    ? `Trip ${r.trip_number ?? '?'} · Loaded at pickup`
                    : `Trip ${r.trip_number ?? '?'} · Stop ${r.stop_number ?? '?'}${r.address ? ` — ${r.address}` : ''}`}
                </p>
                <p className="text-[12px]" style={{ color: MUTED }}>
                  {r.driver_name ?? 'Driver'} · done {r.confirmed_at ? formatDateTime(r.confirmed_at) : 'time unknown'} · received {formatDateTime(r.received_at)}
                </p>
              </div>
              <span className="text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0"
                style={r.status === 'pending'
                  ? { background: 'rgba(255,122,48,0.15)', color: PALETTE.orange }
                  : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>
                {STATUS_TEXT[r.status]}
              </span>
            </div>

            {r.reason_text.length > 0 && (
              <p className="text-[12px] text-white/80">Not recorded automatically: {r.reason_text.join('; ')}.</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {r.proof_photo_url ? (
                <FileViewButton url={r.proof_photo_url} name="Proof photo" title="Open the proof photo"
                  className="rounded-lg overflow-hidden border border-white/10 w-20 h-20 shrink-0">
                  <ProtectedImg src={r.proof_photo_url} alt="Proof photo" className="w-full h-full object-cover" />
                </FileViewButton>
              ) : (
                <span className="text-[12px]" style={{ color: MUTED }}>No photo</span>
              )}
              <div className="text-[12px] flex flex-col gap-0.5" style={{ color: MUTED }}>
                {r.latitude != null && r.longitude != null ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} />
                    {r.distance_m != null ? `${r.distance_m} m from the drop-off` : 'Location recorded'}
                  </span>
                ) : <span>No location</span>}
                {r.override_reason && <span>Driver&apos;s reason: {r.override_reason}</span>}
              </div>
            </div>

            {r.status !== 'pending' && (
              <p className="text-[12px]" style={{ color: MUTED }}>
                {STATUS_TEXT[r.status]}{r.resolved_by_name ? ` by ${r.resolved_by_name}` : ''}
                {r.resolved_at ? ` · ${formatDateTime(r.resolved_at)}` : ''}
                {r.resolution_note ? ` · ${r.resolution_note}` : ''}
              </p>
            )}

            {r.status === 'pending' && canAct && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => setAccept(r)} {...writeAccess(allowed)}
                  className={btn} style={{ background: PALETTE.green, color: '#000' }}>
                  <Check size={13} /> Accept
                </button>
                <button type="button" disabled={busy} onClick={() => setDismiss(r)} {...writeAccess(allowed)}
                  className={`${btn} border border-white/15 text-white/85`}>
                  <X size={13} /> Dismiss
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ReusableModal
        open={!!accept}
        title={accept?.kind === 'pickup' ? 'Accept this loading?' : 'Accept this drop-off?'}
        description="It is recorded with the driver's own photo and location, as if it had arrived in time. Your name is kept in the audit log."
        confirmLabel={busy ? 'Saving…' : 'Accept'}
        cancelLabel="Cancel"
        disableBackdropClose={busy}
        onConfirm={() => { if (accept && !busy) void decide('accept', accept, '') }}
        onCancel={() => { if (!busy) setAccept(null) }}
      />
      <RemarksModal
        open={!!dismiss}
        tone="danger"
        title="Dismiss this late confirmation?"
        description="The step stays open. Confirm it another way (Complete for the driver) or report a problem."
        remarksLabel="Reason"
        remarksPlaceholder="e.g. Photo shows the wrong warehouse; the new main driver will deliver it."
        confirmLabel={busy ? 'Saving…' : 'Dismiss'}
        cancelLabel="Cancel"
        busy={busy}
        disableBackdropClose={busy}
        onConfirm={(text) => { if (dismiss) void decide('dismiss', dismiss, text) }}
        onCancel={() => { if (!busy) setDismiss(null) }}
      />
    </div>
  )
}
