'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Boxes, CircleUser, FileText, History, ImageIcon, MapPin, Truck, User } from 'lucide-react'

import type { BookingWithRelations } from '@/lib/types/booking-relations'
import { bookingRef } from '@/lib/booking'
import { PALETTE } from '@/lib/palette'
import { formatPhDateTime } from '@/lib/office-hours'
import { formatSize } from '@/lib/cargo/units'
import { getApiErrorMessage } from '@/lib/api-error'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { usePanelSection } from '@/components/ui/PanelReady'
import { FileViewButton, ProtectedImg } from '@/components/ui/FileViewer'
import {
  transactionHistoryService,
  type RecordReport, type RecordTrip, type TransactionRecord as RecordData,
} from '@/lib/services/admin/transaction-history.service'
import {
  CARD_CLASS, AssetIcon, BookingInfoCard, CargoItemCard, CargoLine, CollapsibleSection, DashedDivider,
  DocumentRow, SectionHeading, Tag,
} from '@/app/admin/booking-management/BookingDetailParts'
import DeliveryStopsCard, { ProofRow } from '@/app/admin/booking-management/DeliveryStopsCard'
import type { Trip } from '@/lib/services/admin/trip.service'
import CompletionPanel from './CompletionPanel'
import ResubmissionChanges from './ResubmissionChanges'
import StopTimesPanel from './StopTimesPanel'
import HistoryActivities from './HistoryActivities'
import { formatDate, formatDateTime, fileNameFromUrl } from './transaction-format'

/**
 * The Transaction History side panel (Figma "transaction_history", 2026-11-26):
 * the booking as Booking Management draws it, read only, then Trips, Stop Times,
 * Changes after Rejection, Reports and History as sections that open and close.
 *
 * The staff record (crew, trips, reports, history) is read once per booking
 * through /transaction-history, which this module's roles can always reach,
 * and re-read when the booking or its reports change.
 */

const MUTED = '#818181'
const ICON = { size: 18, strokeWidth: 2 } as const

type Booking = BookingWithRelations

const lower = (v: unknown) => String(v ?? '').toLowerCase()
const fullName = (u?: { first_name?: string; last_name?: string } | null) =>
  u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || null : null
const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** "1 hr 20 min", "2 days 3 hr". */
function minutesText(min: number): string {
  const m = Math.max(0, Math.round(min))
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), r = m % 60
  if (d > 0) return [`${d} day${d === 1 ? '' : 's'}`, h ? `${h} hr` : ''].filter(Boolean).join(' ')
  if (h === 0) return `${r} min`
  return r ? `${h} hr ${r} min` : `${h} hr`
}

/** "14:30:00" → "2:30 PM". */
function clock(t: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''))
  if (!m) return null
  const h = Number(m[1])
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/** How late the truck was (or still is) to the pick-up point; null when on time. */
function pickupDelay(b: Booking): string | null {
  const date = b.schedule_date as string | undefined
  const time = b.call_time as string | undefined
  const arrived = b.pickup_arrived_at as string | null | undefined
  if (date && time && arrived) {
    const due = Date.parse(`${date.slice(0, 10)}T${time.slice(0, 8).padEnd(8, ':00')}+08:00`)
    const at  = Date.parse(arrived)
    if (Number.isFinite(due) && Number.isFinite(at) && at > due + 60_000) return `Delayed · ${minutesText((at - due) / 60_000)}`
    return null
  }
  if (b.delayed_since) {
    const m = b.delay_minutes as number | null | undefined
    return m != null ? `Delayed · ${minutesText(m)}` : 'Delayed'
  }
  return null
}

// ─── Client ──────────────────────────────────────────────────────────────────

function ClientSection({ booking }: { booking: Booking }) {
  const c = booking.clients as {
    company_name?: string | null; billing_address?: string | null
    users?: { first_name?: string; last_name?: string; email?: string | null; phone?: string | null } | null
  } | null | undefined
  return (
    <section data-jump="Client">
      <SectionHeading tone="bright" icon={<CircleUser {...ICON} />}>Client</SectionHeading>
      <div className={`${CARD_CLASS} overflow-hidden`}>
        <CargoLine label="Company" value={c?.company_name || null} accent />
        <CargoLine label="Contact person" value={fullName(c?.users)} />
        <CargoLine label="Email" value={c?.users?.email || null} />
        <CargoLine label="Phone" value={c?.users?.phone || null} />
        <CargoLine label="Billing address" value={c?.billing_address || null} />
      </div>
    </section>
  )
}

// ─── Cargo items ─────────────────────────────────────────────────────────────

type CargoRow = {
  item_id: string; destination_id?: string | null
  quantity?: number | null; weight_kg?: number | null; volume_cbm?: number | null
  length_cm?: number | null; width_cm?: number | null; height_cm?: number | null; dimension_unit?: string | null
  notes?: string | null
  product_text?: string | null; commodity_text?: string | null; shc_text?: string | null; ashc_text?: string | null
  products?: { name?: string } | null; commodities?: { name?: string } | null
  shc?: { code?: string; name?: string } | null; ashc?: { code?: string; name?: string } | null
}

const fmtNum = (v: number | null | undefined, unit: string, digits = 2) =>
  v == null ? null : `${Number(v).toLocaleString('en-PH', { maximumFractionDigits: digits })} ${unit}`

function CargoSection({ booking, stopNumber }: { booking: Booking; stopNumber: Map<string, number> }) {
  const items = (booking.booking_cargo_items as CargoRow[] | undefined) ?? []
  if (items.length === 0) return null
  const pieces = items.reduce((n, it) => n + (Number(it.quantity) || 0), 0)
  const count = pieces > 0 ? pieces : items.length
  const stops = stopNumber.size
  return (
    <section data-jump="Cargo Items">
      <SectionHeading tone="bright" icon={<Boxes {...ICON} />}
        right={
          <span className="text-xs font-bold whitespace-nowrap" style={{ color: MUTED }}>
            {count} item{count === 1 ? '' : 's'}<span className="inline-block w-4" />{stops} stop{stops === 1 ? '' : 's'}
          </span>
        }>
        Cargo Items
      </SectionHeading>
      <div className="space-y-3">
        {items.map((it, i) => (
          <CargoItemCard
            key={it.item_id ?? i}
            index={i + 1}
            dropOff={it.destination_id ? stopNumber.get(it.destination_id) ?? null : null}
            quantity={it.quantity}
            commodity={it.commodities?.name ?? it.commodity_text ?? null}
            product={it.products?.name ?? it.product_text ?? null}
            shc={it.shc?.name ?? it.shc?.code ?? it.shc_text ?? null}
            ashc={it.ashc?.name ?? it.ashc?.code ?? it.ashc_text ?? null}
            weight={fmtNum(it.weight_kg, 'KG')}
            volume={fmtNum(it.volume_cbm, 'CBM', 4)}
            dims={it.length_cm && it.width_cm && it.height_cm
              ? formatSize(it.length_cm, it.width_cm, it.height_cm, it.dimension_unit)
              : null}
            notes={it.notes}
          />
        ))}
      </div>
    </section>
  )
}

// ─── Driver and vehicle ──────────────────────────────────────────────────────

const DELIVERY_STATUS_COLOR: Record<string, string> = {
  pending:    PALETTE.yellow,
  assigned:   PALETTE.yellow,
  in_transit: PALETTE.cyan,
  delivered:  PALETTE.green,
  completed:  PALETTE.green,
  failed:     PALETTE.red,
  cancelled:  PALETTE.red,
}

function SubCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-[#818181]/70 bg-[#2a2828] overflow-hidden">
      <div className="flex items-center gap-2 px-[15px] pt-2.5 pb-2">
        <span className="shrink-0 flex" style={{ color: MUTED }}>{icon}</span>
        <span className="text-sm font-bold break-words min-w-0" style={{ color: PALETTE.cyan }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function AssignmentSection({ record }: { record: RecordData }) {
  const d = record.delivery
  if (!d) return null
  const vendor = d.is_vendor_supplied === true
  const driver = vendor ? d.vendor_driver_name : fullName(d.drivers?.users)
  const second = fullName(d.second_driver?.users)
  const vType  = vendor ? d.vendor_vehicle_type : d.trucks?.truck_models?.vehicle_type
  const status = lower(d.status)
  return (
    <section data-jump="Driver and Vehicle Assignment">
      <SectionHeading tone="bright" icon={<AssetIcon name="steering-wheel" />}
        right={
          <span className="text-[10px] font-bold uppercase" style={{ color: vendor ? PALETTE.orange : PALETTE.green }}>
            {vendor ? 'Vendor supplied' : 'Company fleet'}
          </span>
        }>
        Driver and Vehicle Assignment
      </SectionHeading>
      <div className={`${CARD_CLASS} px-3 sm:px-3.5 py-3 flex flex-col gap-3`}>
        <SubCard icon={<User size={16} />} title={driver || 'Driver not recorded'}>
          <CargoLine label="License" value={(vendor ? d.vendor_driver_license : d.drivers?.license_number) || null} />
          <CargoLine label="Phone" value={(vendor ? d.vendor_driver_phone : d.drivers?.users?.phone) || null} />
          <CargoLine label="Email" value={(vendor ? d.vendor_driver_email : d.drivers?.users?.email) || null} />
          {d.helper_name && <CargoLine label="Helper" value={d.helper_name} />}
        </SubCard>
        {second && (
          <SubCard icon={<User size={16} />} title={`${second} · second driver`}>
            <CargoLine label="License" value={d.second_driver?.license_number || null} />
            <CargoLine label="Phone" value={d.second_driver?.users?.phone || null} />
            <CargoLine label="Email" value={d.second_driver?.users?.email || null} />
          </SubCard>
        )}
        <SubCard icon={<Truck size={16} />} title={vType || 'Vehicle type not recorded'}>
          <CargoLine label="Plate No." value={(vendor ? d.vendor_vehicle_plate : d.trucks?.plate_number) || null} />
          {!vendor && d.trucks?.truck_models?.name && <CargoLine label="Model" value={d.trucks.truck_models.name} />}
          {vendor && <CargoLine label="Vendor" value={d.vendor_name || null} />}
          {vendor && <CargoLine label="Vendor Contact" value={d.vendor_contact || null} />}
          <CargoLine label="Assigned" value={d.created_at ? formatDate(d.created_at) : null} />
          <div className="flex items-center justify-between gap-3 min-h-[34px] px-[15px] py-1.5">
            <span className="text-sm font-bold leading-tight" style={{ color: MUTED }}>Delivery Status</span>
            <span className="text-sm font-bold" style={{ color: DELIVERY_STATUS_COLOR[status] ?? '#fff' }}>
              {status ? titleCase(status) : '—'}
            </span>
          </div>
        </SubCard>
      </div>
    </section>
  )
}

// ─── Booking timeline ────────────────────────────────────────────────────────

const ORDER = ['pending', 'approved', 'assigned', 'in_transit', 'delivered', 'completed']

function BookingTimeline({ booking, record }: { booking: Booking; record: RecordData | null }) {
  const status = lower(booking.status)
  const reached = ORDER.indexOf(status)
  const failedStops = ((booking.booking_destinations as Array<{ status?: string }> | undefined) ?? [])
    .filter((d) => lower(d.status) === 'failed').length
  const partly = failedStops > 0 && (status === 'delivered' || status === 'completed')

  type Step = { label: string; at: string | null | undefined; done: boolean; red?: boolean; suffix?: string | null }
  const placed: Step = { label: 'Booking Placed', at: booking.created_at as string, done: true }
  let steps: Step[]
  if (status === 'cancelled') {
    steps = [placed, {
      label: 'Booking Rejected', done: true, red: true,
      at: (booking.cancelled_at as string | null) ?? (booking.gm_reviewed_at as string | null),
    }]
  } else if (status === 'failed') {
    steps = [
      placed,
      { label: 'Booking Approved', at: booking.gm_reviewed_at as string | null, done: true },
      { label: 'Driver assigned',  at: booking.ops_assigned_at as string | null, done: true },
      { label: 'In Transit',       at: record?.delivery?.pickup_time, done: true },
      { label: 'Failed',           at: (booking.delivered_at as string | null) ?? null, done: true, red: true, suffix: 'Nothing delivered' },
    ]
  } else {
    const at = [
      booking.created_at as string,
      booking.gm_reviewed_at as string | null,
      booking.ops_assigned_at as string | null,
      record?.delivery?.pickup_time ?? null,
      booking.delivered_at as string | null,
      booking.completion_confirmed_at as string | null,
    ]
    const labels = ['Booking Placed', 'Booking Approved', 'Driver assigned', 'In Transit', 'Delivered', 'Completed']
    const lastDone = Math.max(0, reached)
    steps = labels.map((label, i) => ({ label, at: at[i], done: i <= lastDone }))
    if (partly) steps[lastDone].suffix = 'Partly failed'
  }

  return (
    <section data-jump="Booking Timeline">
      <SectionHeading tone="bright" icon={<History {...ICON} />}>Booking Timeline</SectionHeading>
      <div className={`${CARD_CLASS} px-3.5 sm:px-4 py-4`}>
        <ol className="flex flex-col">
          {steps.map((s, i) => {
            const color = s.red ? PALETTE.red : s.done ? PALETTE.cyan : MUTED
            const nextDone = steps[i + 1]?.done ?? false
            const last = i === steps.length - 1
            return (
              <li key={s.label} className="flex gap-3" aria-current={s.done && !nextDone ? 'step' : undefined}>
                <div className="flex flex-col items-center">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums"
                    style={{ borderColor: color, color: s.done ? '#fff' : MUTED, background: '#1b1b1b' }}>
                    {i + 1}
                  </span>
                  {!last && (
                    <span aria-hidden className="w-px flex-1 min-h-[26px]"
                      style={{ background: nextDone ? PALETTE.cyan : '#424242' }} />
                  )}
                </div>
                <div className={`flex flex-col pt-0.5 min-w-0 ${last ? '' : 'pb-5'}`}>
                  <span className="text-sm font-bold leading-tight" style={{ color }}>{s.label}</span>
                  <span className="text-[11px] font-bold leading-tight" style={{ color: s.done ? '#fff' : MUTED }}>
                    {s.done ? (s.at ? formatDateTime(s.at) : 'Time not recorded') : 'Pending'}
                    {s.suffix && <span style={{ color: PALETTE.red }}> · {s.suffix.toUpperCase()}</span>}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

// ─── Trips (read only) ───────────────────────────────────────────────────────

const STOP_TAG: Record<string, string> = { delivered: PALETTE.green, failed: PALETTE.red, pending: PALETTE.yellow }

function TripsList({ trips }: { trips: RecordTrip[] }) {
  if (trips.length === 0) return <p className="text-sm" style={{ color: MUTED }}>No trips were planned.</p>
  return (
    <div className="flex flex-col gap-3">
      {trips.map((t) => (
        <div key={t.trip_id} className={`${CARD_CLASS} px-3.5 sm:px-4 pt-3 pb-4 flex flex-col gap-2.5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold" style={{ color: PALETTE.cyan }}>Trip {t.trip_number} of {trips.length}</span>
            <Tag color={null}>{titleCase(t.status)}</Tag>
          </div>
          {t.notes && <p className="text-xs text-white/60 break-words">{t.notes}</p>}
          {t.pickup_proof_photo_url
            ? <ProofRow url={t.pickup_proof_photo_url} at={t.pickup_proof_at} label="Proof of pick up" />
            : <p className="text-xs font-bold text-white/30">No proof of pick up on file.</p>}
          {t.booking_trip_stops.map((s) => (
            <div key={s.trip_stop_id} className="flex flex-col gap-2 pt-2.5 border-t-[0.5px] border-[#818181]">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-bold break-words min-w-0" style={{ color: MUTED }}>
                  {s.booking_destinations?.address ?? `Stop ${s.sequence_order}`}
                </span>
                <span className="shrink-0"><Tag color={STOP_TAG[s.status] ?? null}>{titleCase(s.status)}</Tag></span>
              </div>
              {s.proof_photo_url && <ProofRow url={s.proof_photo_url} at={s.proof_at ?? s.delivered_at} label="Proof of delivery" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Reports (Figma "Reports [unresolved]") ─────────────────────────────────

function ReportCard({ report, helper }: { report: RecordReport; helper: string | null }) {
  const incident = report.incident_type ? titleCase(report.incident_type) : 'Unspecified emergency'
  const resolved = lower(report.status) === 'resolved'
  const lat = report.latitude != null ? Number(report.latitude) : null
  const lng = report.longitude != null ? Number(report.longitude) : null
  const mapUrl = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://www.google.com/maps?q=${lat},${lng}` : null
  const can = report.trip_can_continue
  const row = 'flex items-start justify-between gap-3 px-[15px] py-2 border-b-[0.5px] border-[#818181] last:border-b-0'
  const label = 'text-sm font-bold shrink-0'
  return (
    <div className="rounded-[15px] border border-[#424242] bg-[#232121] p-2.5 flex flex-col gap-2.5">
      <div className="rounded-[10px] bg-[#1b1b1b] px-3.5 py-3 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-bold" style={{ color: PALETTE.cyan }}>
            {report.source === 'quick' ? 'Quick Alert' : 'Driver Report'}
          </span>
          <span className="shrink-0 text-[11px] font-bold" style={{ color: MUTED }}>{formatDateTime(report.created_at)}</span>
        </div>
        <span className="text-sm font-bold text-white break-words">{[incident, report.sub_type].filter(Boolean).join(' · ')}</span>
        {report.description && <span className="text-sm text-white/80 break-words whitespace-pre-wrap">{report.description}</span>}
        {resolved ? (
          <span className="text-[11px] font-bold leading-snug" style={{ color: PALETTE.green }}>
            Resolved{report.resolved_at ? ` ${formatDateTime(report.resolved_at)}` : ''}{report.resolution_note ? `: ${report.resolution_note}` : ''}
          </span>
        ) : (
          <span className="text-[11px] font-bold leading-snug" style={{ color: PALETTE.yellow }}>
            The 8338 Logistics Services is resolving this issue.
          </span>
        )}
      </div>

      <div className="rounded-[10px] border border-[#818181]/70 bg-[#1b1b1b] overflow-hidden">
        <div className={row}>
          <span className={label} style={{ color: MUTED }}>Driver</span>
          <span className="flex flex-col items-end text-right min-w-0">
            <span className="text-sm font-bold text-white break-words">{fullName(report.drivers?.users) ?? '—'}</span>
            {report.drivers?.users?.phone && (
              <span className="text-[10px] font-bold" style={{ color: PALETTE.cyan }}>{report.drivers.users.phone}</span>
            )}
          </span>
        </div>
        <div className={row}>
          <span className={label} style={{ color: MUTED }}>Helper</span>
          <span className="text-sm font-bold text-white text-right break-words min-w-0">{helper || '—'}</span>
        </div>
        <div className={row}>
          <span className={label} style={{ color: MUTED }}>Vehicle</span>
          <span className="flex flex-col items-end text-right min-w-0">
            <span className="text-sm font-bold text-white">{report.trucks?.plate_number ?? '—'}</span>
            {report.trucks?.truck_models?.name && (
              <span className="text-[10px] font-bold" style={{ color: PALETTE.cyan }}>{report.trucks.truck_models.name}</span>
            )}
          </span>
        </div>
        <div className={row}>
          <span className={label} style={{ color: MUTED }}>Can the trip continue</span>
          <span className="text-sm font-bold" style={{ color: can == null ? MUTED : can ? PALETTE.green : PALETTE.red }}>
            {can == null ? '—' : can ? 'Yes' : 'No'}
          </span>
        </div>
        <div className={row}>
          <span className={label} style={{ color: MUTED }}>Location</span>
          {report.address || mapUrl ? (
            mapUrl ? (
              <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-start gap-1 text-sm font-bold text-right break-words min-w-0 [@media(hover:hover)]:hover:underline"
                style={{ color: PALETTE.cyan }}>
                <MapPin size={14} className="shrink-0 mt-0.5" />{report.address || 'Open in Maps'}
              </a>
            ) : (
              <span className="inline-flex items-start gap-1 text-sm font-bold text-right break-words min-w-0" style={{ color: PALETTE.cyan }}>
                <MapPin size={14} className="shrink-0 mt-0.5" />{report.address}
              </span>
            )
          ) : <span className="text-sm font-bold" style={{ color: MUTED }}>Not recorded</span>}
        </div>
      </div>

      <div className="rounded-[10px] bg-[#1b1b1b] px-3.5 pt-2.5 pb-3 flex flex-col gap-2">
        <span className="text-sm font-bold text-white">Images</span>
        {report.photo_urls.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 h-[110px] rounded-[10px] border border-dashed border-[#818181]/70"
            style={{ color: MUTED }}>
            <ImageIcon size={18} />
            <span className="text-[10px] font-bold uppercase">No image attached</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {report.photo_urls.map((u, i) => (
              <FileViewButton key={u} url={u} name={`Report photo ${i + 1}`}
                className="block rounded-[10px] border border-dashed border-[#818181]/70 overflow-hidden aspect-[4/3]">
                <ProtectedImg src={u} alt={`Report photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
              </FileViewButton>
            ))}
          </div>
        )}
        {report.video_urls.map((u, i) => (
          <FileViewButton key={u} url={u} name={`Report video ${i + 1}`}
            className="self-start text-xs font-bold [@media(hover:hover)]:hover:underline">
            <span style={{ color: PALETTE.cyan }}>Video {i + 1}</span>
          </FileViewButton>
        ))}
      </div>
    </div>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function StaffTransactionDetail({ booking }: { booking: Booking }) {
  const bookingId = booking.booking_id as string
  const status    = lower(booking.status)
  const [record, setRecord] = useState<RecordData | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  usePanelSection(loading)

  // The parent keys this panel by booking, so another row remounts it.
  useEffect(() => {
    let cancelled = false
    transactionHistoryService.record(bookingId)
      .then((r) => { if (!cancelled) setRecord(r) })
      .catch((err) => { if (!cancelled) setError(getApiErrorMessage(err, 'Could not load the driver, trips and history.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bookingId])

  // Live: approvals, stops, pauses and reports land while the panel is open.
  useLiveTable(['live:bookings', 'live:driver_reports'], () => {
    transactionHistoryService.record(bookingId)
      .then((r) => { setRecord(r); setError(null) })
      .catch(() => {})
  }, { debounceMs: 1500 })

  const destinations = ((booking.booking_destinations as Array<{
    destination_id: string; address: string; sequence_order: number; status: string
    proof_photo_url?: string | null; proof_at?: string | null; delivered_at?: string | null
  }> | undefined) ?? []).slice().sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
  const stopNumber = new Map(destinations.map((d, i) => [d.destination_id, d.sequence_order ?? i + 1]))
  const docs = (booking.transaction_documents as string[] | null | undefined) ?? []
  const trips = record?.trips ?? []
  const reports = record?.reports ?? []
  const resubmissions = Number(booking.resubmission_count ?? 0)

  const afterAssign = ['assigned', 'in_transit', 'delivered', 'completed', 'failed'].includes(status)
  const finished    = ['delivered', 'completed', 'failed'].includes(status)

  return (
    <div className="space-y-[18px]">
      {/* Delivered: waiting on the client. Read only here; resolving a problem is Booking Management's. */}
      <CompletionPanel booking={booking} mode="staff" look="booking" showActions={false} onUpdated={() => {}} />

      <BookingInfoCard
        accentReference={status !== 'pending'}
        reference={bookingRef(booking)}
        extras={booking.created_at ? (
          <p className="text-xs font-bold" style={{ color: MUTED }}>Submitted {formatPhDateTime(booking.created_at as string)}</p>
        ) : null}
        origin={booking.origin as string}
        company={(booking.clients as { company_name?: string } | null | undefined)?.company_name}
        date={booking.schedule_date ? formatDate(booking.schedule_date as string) : null}
        time={clock(booking.call_time as string | null)}
        vehicleType={booking.truck_type_needed as string | null}
      />

      <ClientSection booking={booking} />
      <CargoSection booking={booking} stopNumber={stopNumber} />

      <section data-jump="Transaction Documents">
        <SectionHeading tone="bright" icon={<FileText {...ICON} />}>Transaction Documents</SectionHeading>
        {docs.length === 0
          ? <p className="text-sm" style={{ color: MUTED }}>No documents attached.</p>
          : <div className="space-y-2">{docs.map((url, i) => <DocumentRow key={i} url={url} filename={fileNameFromUrl(url)} />)}</div>}
      </section>

      <section data-jump="Delivery Stops">
        <SectionHeading tone="bright" icon={<AssetIcon name="delivery-stops" />}>Delivery Stops</SectionHeading>
        <DeliveryStopsCard
          bookingId={bookingId}
          status={status}
          origin={booking.origin as string}
          stops={destinations}
          pickupProofUrl={booking.pickup_proof_photo_url as string | null}
          pickupProofAt={booking.pickup_proof_at as string | null}
          trips={trips.map((t) => ({ ...t, status: t.status as Trip['status'] }))}
          pickupNote={pickupDelay(booking)}
        />
      </section>

      {error && (
        <p className="flex items-center gap-2 text-xs" style={{ color: PALETTE.red }}>
          <AlertCircle size={14} /> {error}
        </p>
      )}

      {record && <AssignmentSection record={record} />}
      <BookingTimeline booking={booking} record={record} />

      {/* Figma: the sections that open and close, under a dashed rule. */}
      <div data-jump="History">
        <DashedDivider />
        {finished && trips.length > 0 && (
          <CollapsibleSection key={`trips-${bookingId}`} title="Trips">
            <TripsList trips={trips} />
          </CollapsibleSection>
        )}
        {afterAssign && (
          <CollapsibleSection key={`times-${bookingId}`} title="Stop Times">
            <StopTimesPanel bookingId={bookingId} staff look="booking" pickupAddress={booking.origin as string} />
          </CollapsibleSection>
        )}
        {resubmissions > 0 && (
          <CollapsibleSection key={`rev-${bookingId}`} title="Changes after Rejection">
            <ResubmissionChanges bookingId={bookingId} resubmissionCount={resubmissions} look="booking" />
          </CollapsibleSection>
        )}
        {reports.length > 0 && (
          <CollapsibleSection key={`reports-${bookingId}`} title="Reports"
            badge={<Tag color={reports.some((r) => lower(r.status) !== 'resolved') ? PALETTE.yellow : null}>{reports.length}</Tag>}>
            <div className="flex flex-col gap-3">
              {reports.map((r) => <ReportCard key={r.report_id} report={r} helper={record?.delivery?.helper_name ?? null} />)}
            </div>
          </CollapsibleSection>
        )}
        <CollapsibleSection key={`hist-${bookingId}`} title="History" lazy>
          <HistoryActivities bookingId={bookingId} history={record ? record.history ?? null : error ? null : undefined} resubmissionCount={resubmissions} />
        </CollapsibleSection>
      </div>
    </div>
  )
}
