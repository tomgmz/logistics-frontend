'use client'

import { motion, Variants } from 'framer-motion'
import {
  History, MapPin, Truck, Package, Calendar, Hash,
  AlertCircle, Download, FileText,
} from 'lucide-react'

import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { bookingRef } from '@/lib/booking'
import { StatusBadge, StatusTimeline } from './TransactionStatus'
import {
  formatDate, formatDateTime, formatPeso, fileNameFromUrl,
  parseCargoDetails, buildCargoSummary, getDropoffs,
  getDriverName, getPlateNumber, getTruckModel,
} from './transaction-format'
import { BG_PANEL, BG_CARD, BORDER, BORDER_C, CYAN, MUTED, ERROR } from './transaction-theme'

/**
 * The full view of one transaction: route, cargo, assignment, per-stop status,
 * lifecycle timeline, attached documents, and the rejection remarks when it was
 * turned down.
 *
 * Shared verbatim between the client's history page and the staff one, so an
 * administrator answering a question about a booking is looking at exactly what
 * the client is looking at.
 */

const slideIn: Variants = {
  hidden: { opacity: 0, x: 24 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.28 } },
}

export function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white">{icon}</span>
      <h3 className="ff-sc text-white font-bold tracking-wide text-sm">{title}</h3>
    </div>
  )
}

export function InfoTile({ label, value, accent, mono }: {
  label: string; value: string; accent?: boolean; mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>{label}</span>
      <span className={`text-sm font-bold ${mono ? 'font-mono' : ''}`}
        style={{ color: accent ? CYAN : '#fff' }}>
        {value}
      </span>
    </div>
  )
}

export default function TransactionDetail({ booking, animated = true }: {
  booking: BookingWithRelations
  /** Off when the container already animates, so the panel doesn't slide twice. */
  animated?: boolean
}) {
  const dropoffs    = getDropoffs(booking)
  const driverName  = getDriverName(booking)
  const plateNumber = getPlateNumber(booking)
  const truckModel  = getTruckModel(booking)
  const summary     = buildCargoSummary(booking)
  const parsed      = parseCargoDetails(booking.cargo_details as string | null | undefined)
  const docs        = (booking.transaction_documents as string[] | null | undefined) ?? []

  const schedDate   = booking.schedule_date as string | undefined
  const callTime    = booking.call_time     as string | undefined
  const totalCost   = booking.total_cost    as number | null | undefined
  const createdAt   = booking.created_at    as string | undefined

  const weightKg    = booking.required_weight_kg  as number | null | undefined
  const volumeCbm   = booking.required_volume_cbm as number | null | undefined
  const lengthCm    = booking.required_length_cm  as number | null | undefined
  const nonStackable = booking.non_stackable_cargo   as boolean | null | undefined
  const netWeightKg  = booking.required_net_weight_kg as number  | null | undefined
  const densityKgCbm = booking.cargo_density_kg_cbm   as number  | null | undefined
  const truckType   = booking.truck_type_needed   as string | undefined
  const origin      = booking.origin              as string | undefined

  const destinations = booking.booking_destinations as Array<{
    destination_id: string
    address: string
    sequence_order: number
    status: string
    delivered_at?: string | null
  }> | undefined

  const motionProps = animated
    ? { variants: slideIn, initial: 'hidden' as const, animate: 'show' as const }
    : {}

  return (
    <motion.div key="detail" {...motionProps}
      className="flex flex-col gap-4 pb-6">

      {/* Summary banner */}
      <div className="rounded-xl border p-4 flex flex-col gap-3"
        style={{ background: BG_PANEL, borderColor: BORDER, borderTopWidth: 3, borderTopColor: CYAN }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Hash size={13} style={{ color: CYAN }} />
              <span className="font-bold text-white tracking-wide font-mono">
                {bookingRef(booking)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
              <Calendar size={11} />
              <span>Booked on {formatDateTime(createdAt)}</span>
            </div>
          </div>
          <StatusBadge status={booking.status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t" style={{ borderColor: BORDER }}>
          <InfoTile label="Scheduled Date" value={formatDate(schedDate)} />
          <InfoTile label="Call Time"      value={callTime ?? '—'} />
          <InfoTile label="Total Cost"     value={formatPeso(totalCost)} accent />
        </div>
      </div>

      {/* Route */}
      <div className="rounded-xl border p-4 flex flex-col gap-4"
        style={{ background: BG_PANEL, borderColor: BORDER }}>
        <SectionHeader icon={<MapPin size={15} />} title="Route" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 p-3 rounded-lg border"
            style={{ background: BG_CARD, borderColor: BORDER_C }}>
            <Truck size={14} style={{ color: CYAN }} className="shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Pick Up</span>
              <span className="text-sm text-white/80">{origin}</span>
            </div>
          </div>
          {dropoffs.map((d, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border"
              style={{ background: BG_CARD, borderColor: BORDER_C }}>
              <MapPin size={14} style={{ color: ERROR }} className="shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
                  Drop Off {dropoffs.length > 1 ? i + 1 : ''}
                </span>
                <span className="text-sm text-white/80">{d}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Cargo */}
        <div className="border-t pt-4" style={{ borderColor: BORDER }}>
          <SectionHeader icon={<Package size={15} />} title="Cargo" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            <InfoTile label="Mode"         value={parsed?.mode ?? truckType ?? '—'} />
            <InfoTile label="Summary"      value={summary} />
            <InfoTile label="Truck Needed" value={truckType ?? '—'} />
            {weightKg  != null && <InfoTile label="Weight"    value={`${weightKg} KG`} />}
            {volumeCbm != null && <InfoTile label="Volume"    value={`${volumeCbm.toFixed(2)} CBM`} />}
            {lengthCm  != null && <InfoTile label="Length"    value={`${lengthCm} cm`} />}
            {netWeightKg  != null && <InfoTile label="Net Weight" value={`${netWeightKg} KG`} />}
            {densityKgCbm != null && <InfoTile label="Density"    value={`${Number(densityKgCbm).toFixed(2)} KG/CBM`} />}
            {nonStackable != null && <InfoTile label="Non-stackable" value={nonStackable ? 'Yes' : 'No'} />}
          </div>
        </div>
      </div>

      {/* Driver & truck */}
      {(driverName || plateNumber) && (
        <div className="rounded-xl border p-4 flex flex-col gap-3"
          style={{ background: BG_PANEL, borderColor: BORDER }}>
          <SectionHeader icon={<Truck size={15} />} title="Assigned Driver & Truck" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {driverName  && <InfoTile label="Driver Name"  value={driverName} />}
            {plateNumber && <InfoTile label="Plate Number" value={plateNumber} mono />}
            {truckModel  && <InfoTile label="Truck"        value={truckModel} />}
          </div>
        </div>
      )}

      {/* Destination statuses */}
      {(destinations?.length ?? 0) > 0 && (
        <div className="rounded-xl border p-4 flex flex-col gap-3"
          style={{ background: BG_PANEL, borderColor: BORDER }}>
          <SectionHeader icon={<MapPin size={15} />} title="Destination Status" />
          <div className="flex flex-col gap-2">
            {(destinations ?? [])
              .slice()
              .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
              .map((dest) => {
                const c = dest.status === 'delivered' ? CYAN : dest.status === 'failed' ? ERROR : MUTED
                return (
                  <div key={dest.destination_id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border"
                    style={{ background: BG_CARD, borderColor: BORDER_C }}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MapPin size={13} style={{ color: ERROR }} className="shrink-0" />
                      <span className="text-sm text-white/80 truncate">{dest.address}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: c }}>
                        {dest.status}
                      </span>
                      {dest.delivered_at && (
                        <span className="text-[10px]" style={{ color: MUTED }}>
                          {formatDateTime(dest.delivered_at)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border p-4 flex flex-col gap-4"
        style={{ background: BG_PANEL, borderColor: BORDER }}>
        <SectionHeader icon={<History size={15} />} title="Booking Timeline" />
        <StatusTimeline booking={booking} />
      </div>

      {/* Transaction documents (Cloudinary URLs) */}
      {docs.length > 0 && (
        <div className="rounded-xl border p-4 flex flex-col gap-3"
          style={{ background: BG_PANEL, borderColor: BORDER }}>
          <SectionHeader icon={<FileText size={15} />} title="Transaction Documents" />
          <div className="flex flex-col gap-2">
            {docs.map((url: string, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 border"
                style={{ background: BG_CARD, borderColor: BORDER_C }}>
                <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                  <FileText size={13} style={{ color: MUTED }} className="shrink-0" />
                  <span className="text-xs text-white/80 truncate">{fileNameFromUrl(url)}</span>
                </div>
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider
                             transition-opacity hover:opacity-70 shrink-0"
                  style={{ color: CYAN }}>
                  <Download size={12} /> Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancellation notice. A booking the general manager did not approve
          carries their remarks — that reason is the actionable part for the
          client, so show it instead of the generic line. */}
      {booking.status === 'CANCELLED' && (() => {
        // Only name the general manager when the GM actually made the call. An
        // administrator can turn a booking down on their own authority without
        // it ever reaching the GM, and that shows up as cancelled_by instead.
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
          <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: `${ERROR}10`, border: `1px solid ${ERROR}30`, color: ERROR }}>
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
    </motion.div>
  )
}
