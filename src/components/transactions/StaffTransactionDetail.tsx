'use client'

import { AlertCircle, Calendar, FileText, History, MapPin, Package, Truck } from 'lucide-react'

import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { bookingRef } from '@/lib/booking'
import { PALETTE } from '@/lib/palette'
import {
  CARD_CLASS, CargoLine, SectionHeading, AssetIcon, StopCard, DocumentRow,
} from '@/app/admin/booking-management/BookingDetailParts'
import { StatusTimeline } from './TransactionStatus'
import {
  formatDate, formatDateTime, formatPeso, fileNameFromUrl,
  buildCargoSummary, getDropoffs,
} from './transaction-format'
import { MUTED, ERROR } from './transaction-theme'

/**
 * The staff history panel's view of a transaction — the same fields as the
 * client-facing TransactionDetail, drawn with the Booking Management side
 * panel's parts (grey headings over dark rounded cards). Kept separate so the
 * client's history page keeps its own look.
 */

const DEST_STATUSES = ['pending', 'delivered', 'failed'] as const

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs font-bold text-[#818181]">{label}</span>
      <span className="text-sm font-bold break-words" style={{ color: accent ? PALETTE.cyan : '#fff' }}>
        {value}
      </span>
    </div>
  )
}

export default function StaffTransactionDetail({ booking }: { booking: BookingWithRelations }) {
  const dropoffs = getDropoffs(booking)
  const summary  = buildCargoSummary(booking)
  const docs     = (booking.transaction_documents as string[] | null | undefined) ?? []

  const schedDate = booking.schedule_date as string | undefined
  const callTime  = booking.call_time     as string | undefined
  const totalCost = booking.total_cost    as number | null | undefined
  const createdAt = booking.created_at    as string | undefined

  const weightKg     = booking.required_weight_kg     as number | null | undefined
  const volumeCbm    = booking.required_volume_cbm    as number | null | undefined
  const lengthCm     = booking.required_length_cm     as number | null | undefined
  const nonStackable = booking.non_stackable_cargo    as boolean | null | undefined
  const netWeightKg  = booking.required_net_weight_kg as number | null | undefined
  const densityKgCbm = booking.cargo_density_kg_cbm   as number | null | undefined
  const truckType    = booking.truck_type_needed      as string | undefined
  const origin       = booking.origin                 as string | undefined

  const destinations = ((booking.booking_destinations as Array<{
    destination_id: string
    address: string
    sequence_order: number
    status: string
    delivered_at?: string | null
  }> | undefined) ?? []).slice().sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))

  return (
    <div className="space-y-[18px]">
      {/* Summary */}
      <div className={`${CARD_CLASS} px-3.5 pt-2.5 pb-3.5 space-y-2.5`}>
        <p className="text-sm font-bold text-[#818181] break-all">{bookingRef(booking)}</p>
        <div className="flex items-center gap-[7px] text-xs font-bold text-[#818181]">
          <Calendar size={14} strokeWidth={2} />
          <span>Booked on {formatDateTime(createdAt)}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2.5 border-t-[0.5px] border-[#818181]">
          <Field label="Scheduled Date" value={formatDate(schedDate)} />
          <Field label="Call Time"      value={callTime ?? '—'} />
          <Field label="Total Cost"     value={formatPeso(totalCost)} accent />
        </div>
      </div>

      {/* Route */}
      <section>
        <SectionHeading icon={<MapPin size={18} strokeWidth={2} />}>Route</SectionHeading>
        <div className="space-y-3">
          <div className={`${CARD_CLASS} flex items-start gap-[7px] px-3.5 py-2.5`}>
            <Truck size={18} strokeWidth={2} className="shrink-0" style={{ color: PALETTE.cyan }} />
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#818181]">Pick Up</p>
              <p className="text-sm font-bold text-white break-words">{origin}</p>
            </div>
          </div>
          {dropoffs.map((d, i) => (
            <div key={i} className={`${CARD_CLASS} flex items-start gap-[7px] px-3.5 py-2.5`}>
              <MapPin size={18} strokeWidth={2} className="shrink-0" style={{ color: ERROR }} />
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#818181]">Drop Off {dropoffs.length > 1 ? i + 1 : ''}</p>
                <p className="text-sm font-bold text-white break-words">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cargo */}
      <section>
        <SectionHeading icon={<Package size={18} strokeWidth={2} />}>Cargo</SectionHeading>
        <div className={`${CARD_CLASS} overflow-hidden`}>
          <CargoLine label="Mode"         value={truckType ?? null} />
          <CargoLine label="Summary"      value={summary} />
          <CargoLine label="Truck Needed" value={truckType ?? null} />
          {weightKg     != null && <CargoLine label="Weight"        value={`${weightKg} KG`} accent />}
          {volumeCbm    != null && <CargoLine label="Volume"        value={`${volumeCbm.toFixed(2)} CBM`} accent />}
          {lengthCm     != null && <CargoLine label="Length"        value={`${lengthCm} cm`} accent />}
          {netWeightKg  != null && <CargoLine label="Net Weight"    value={`${netWeightKg} KG`} accent />}
          {densityKgCbm != null && <CargoLine label="Density"       value={`${Number(densityKgCbm).toFixed(2)} KG/CBM`} accent />}
          {nonStackable != null && <CargoLine label="Non-stackable" value={nonStackable ? 'Yes' : 'No'} />}
        </div>
      </section>

      {/* Destination statuses */}
      {destinations.length > 0 && (
        <section>
          <SectionHeading icon={<AssetIcon name="delivery-stops" />}>Destination Status</SectionHeading>
          <ul className="space-y-3">
            {destinations.map((dest) => (
              <StopCard
                key={dest.destination_id}
                address={dest.address}
                status={dest.status}
                // A status outside the usual three still gets its own lit tag.
                statuses={(DEST_STATUSES as readonly string[]).includes(dest.status)
                  ? DEST_STATUSES
                  : [...DEST_STATUSES, dest.status]}
                label={titleCase}
              >
                {dest.delivered_at && (
                  <p className="text-xs font-bold" style={{ color: MUTED }}>
                    {formatDateTime(dest.delivered_at)}
                  </p>
                )}
              </StopCard>
            ))}
          </ul>
        </section>
      )}

      {/* Timeline */}
      <section>
        <SectionHeading icon={<History size={18} strokeWidth={2} />}>Booking Timeline</SectionHeading>
        <div className={`${CARD_CLASS} p-3.5`}>
          <StatusTimeline booking={booking} />
        </div>
      </section>

      {/* Transaction documents (Cloudinary URLs) */}
      {docs.length > 0 && (
        <section>
          <SectionHeading icon={<FileText size={18} strokeWidth={2} />}>Transaction Documents</SectionHeading>
          <div className="space-y-2">
            {docs.map((url, i) => <DocumentRow key={i} url={url} filename={fileNameFromUrl(url)} />)}
          </div>
        </section>
      )}

      {/* Same wording as the client's view, so staff read what the client reads. */}
      {booking.status === 'CANCELLED' && (() => {
        const rejectedByGm = booking.gm_status === 'rejected'
        const remarks      = typeof booking.rejection_reason === 'string'
          ? booking.rejection_reason.trim()
          : ''
        const headline = rejectedByGm
          ? 'This booking was not approved by the General Manager.'
          : remarks || booking.cancelled_by
            ? 'This booking was not approved.'
            : 'This booking was cancelled.'
        return (
          <div className="flex items-start gap-2 rounded-[15px] px-3.5 py-3 text-sm"
            style={{ background: `${ERROR}10`, border: `1px solid ${ERROR}`, color: ERROR }}>
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>
              {headline}
              {remarks
                ? <><br /><span className="font-semibold">Remarks:</span> {remarks}</>
                : ' Contact support if you believe this was an error.'}
            </span>
          </div>
        )
      })()}
    </div>
  )
}
