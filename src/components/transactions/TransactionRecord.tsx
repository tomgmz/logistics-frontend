'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, Building2, Camera, ClipboardCheck, Package,
  Route as RouteIcon, ShieldCheck, Truck, User, Video,
} from 'lucide-react'

import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { getApiErrorMessage } from '@/lib/api-error'
import { roleLabel } from '@/lib/roles'
import {
  transactionHistoryService,
  type DecisionActor, type RecordInspection, type RecordReport, type RecordTrip,
  type TransactionApprovals, type TransactionRecord as RecordData,
} from '@/lib/services/admin/transaction-history.service'
import { SectionHeader, InfoTile } from './TransactionDetail'
import { formatDate, formatDateTime } from './transaction-format'
import { BG_PANEL, BG_CARD, BORDER, BORDER_C, CYAN, MUTED, ERROR, AMBER, GREEN } from './transaction-theme'

/**
 * The staff-only half of a transaction: everything attached to the booking that
 * the client-facing detail does not show — who drove it and in what, the proof
 * photos from every pickup and drop-off, the inspection the vehicle passed, the
 * driver's incident reports, the approval trail, and the full cargo lines.
 *
 * The crew, trips, reports and inspection are fetched per booking when the row
 * is opened; the rest is already on the booking row.
 */

type Booking = BookingWithRelations

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3"
      style={{ background: BG_PANEL, borderColor: BORDER }}>
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3 flex flex-col gap-2"
      style={{ background: BG_CARD, borderColor: BORDER_C }}>
      {children}
    </div>
  )
}

function fullName(u?: { first_name?: string; last_name?: string } | null): string | null {
  if (!u) return null
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || null
}

/** snake_case → "Title Case", for enum values the API returns raw. */
function humanize(v: string | null | undefined): string {
  if (!v) return '—'
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** A photo that opens full size in a new tab. */
function Photo({ url, caption }: { url: string; caption?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="group flex flex-col gap-1 w-[104px] shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URLs, any host shape */}
      <img src={url} alt={caption ?? 'Photo'} loading="lazy"
        className="h-[78px] w-[104px] rounded-md border object-cover transition-opacity group-hover:opacity-80"
        style={{ borderColor: BORDER_C }} />
      {caption && <span className="text-[10px] leading-tight" style={{ color: MUTED }}>{caption}</span>}
    </a>
  )
}

function ProofMeta({ at, distance, override }: {
  at?: string | null; distance?: number | null; override?: string | null
}) {
  return (
    <div className="flex flex-col gap-0.5 text-[11px]" style={{ color: MUTED }}>
      {at && <span>Taken {formatDateTime(at)}</span>}
      {distance != null && <span>{Math.round(Number(distance))} m from the address</span>}
      {override && <span style={{ color: AMBER }}>Location override: {override}</span>}
    </div>
  )
}

function NoPhoto({ label }: { label: string }) {
  return <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</p>
}

// ─── Sections ────────────────────────────────────────────────────────────────

function CrewSection({ record, booking }: { record: RecordData; booking: Booking }) {
  const d = record.delivery

  // Older bookings predate the deliveries join below; fall back to the
  // assignment rows that come with the booking itself.
  const fallbackDriver = fullName((booking.driver_assignments as Array<{
    drivers?: { users?: { first_name?: string; last_name?: string } }
  }> | undefined)?.[0]?.drivers?.users)
  const fallbackPlate = (booking.truck_assignments as Array<{
    trucks?: { plate_number?: string }
  }> | undefined)?.[0]?.trucks?.plate_number ?? null

  if (!d && !fallbackDriver && !fallbackPlate) {
    return (
      <Panel>
        <SectionHeader icon={<Truck size={15} />} title="Driver & Vehicle" />
        <NoPhoto label="No driver or vehicle was ever assigned to this booking." />
      </Panel>
    )
  }

  const vendor = d?.is_vendor_supplied === true
  const driverName = vendor ? d?.vendor_driver_name : fullName(d?.drivers?.users) ?? fallbackDriver
  const license    = vendor ? d?.vendor_driver_license : d?.drivers?.license_number
  const phone      = vendor ? d?.vendor_driver_phone   : d?.drivers?.users?.phone
  const email      = vendor ? d?.vendor_driver_email   : d?.drivers?.users?.email
  const plate      = vendor ? d?.vendor_vehicle_plate  : d?.trucks?.plate_number ?? fallbackPlate
  const model      = vendor ? null : d?.trucks?.truck_models?.name
  const vType      = vendor ? d?.vendor_vehicle_type   : d?.trucks?.truck_models?.vehicle_type

  return (
    <Panel>
      <div className="flex items-center justify-between gap-2">
        <SectionHeader icon={<Truck size={15} />} title="Driver & Vehicle" />
        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
          style={vendor
            ? { color: AMBER, borderColor: `${AMBER}55`, background: `${AMBER}14` }
            : { color: CYAN,  borderColor: `${CYAN}55`,  background: `${CYAN}10` }}>
          {vendor ? 'Vendor-supplied' : 'Company fleet'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
        <User size={11} /> Driver
      </div>
      <div className="grid grid-cols-2 gap-3">
        <InfoTile label="Name"    value={driverName || '—'} />
        <InfoTile label="License" value={license || '—'} mono />
        {!vendor && d?.drivers?.license_expiry && (
          <InfoTile label="License Expiry" value={formatDate(d.drivers.license_expiry)} />
        )}
        <InfoTile label="Phone" value={phone || '—'} />
        {email && <InfoTile label="Email" value={email} />}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest pt-2 border-t"
        style={{ color: MUTED, borderColor: BORDER }}>
        <Truck size={11} /> Vehicle
      </div>
      <div className="grid grid-cols-2 gap-3">
        <InfoTile label="Plate Number" value={plate || '—'} mono />
        {model && <InfoTile label="Model" value={model} />}
        <InfoTile label="Vehicle Type" value={vType || '—'} />
      </div>

      {vendor && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor: BORDER }}>
          <InfoTile label="Vendor"         value={d?.vendor_name    || '—'} />
          <InfoTile label="Vendor Contact" value={d?.vendor_contact || '—'} />
        </div>
      )}

      {d && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor: BORDER }}>
          <InfoTile label="Assigned"        value={formatDateTime(d.created_at)} />
          <InfoTile label="Delivery Status" value={humanize(d.status)} />
          {d.pickup_time   && <InfoTile label="Picked Up" value={formatDateTime(d.pickup_time)} />}
          {d.delivery_time && <InfoTile label="Delivered" value={formatDateTime(d.delivery_time)} />}
        </div>
      )}
    </Panel>
  )
}

function TripsSection({ trips, booking }: { trips: RecordTrip[]; booking: Booking }) {
  const fleetReturn = booking.fleet_return_at as string | null | undefined

  // Bookings from before multi-trip kept their proof on the booking and its
  // drop-offs directly; show that when there are no trip rows.
  if (trips.length === 0) {
    const pickupUrl = booking.pickup_proof_photo_url as string | null | undefined
    const dests = ((booking.booking_destinations as Array<{
      destination_id: string; address: string; sequence_order: number
      proof_photo_url?: string | null; proof_at?: string | null
      proof_distance_m?: number | null; proof_override_reason?: string | null
    }> | undefined) ?? []).slice().sort((a, b) => a.sequence_order - b.sequence_order)
    const anyProof = !!pickupUrl || dests.some((d) => d.proof_photo_url)
    if (!anyProof && !fleetReturn) return null

    return (
      <Panel>
        <SectionHeader icon={<Camera size={15} />} title="Proof Photos" />
        <Card>
          <span className="text-xs font-bold text-white/80">Pick Up</span>
          {pickupUrl ? (
            <div className="flex gap-3">
              <Photo url={pickupUrl} />
              <ProofMeta at={booking.pickup_proof_at as string | null}
                distance={booking.pickup_proof_distance_m as number | null}
                override={booking.pickup_proof_override_reason as string | null} />
            </div>
          ) : <NoPhoto label="No proof of loading on file." />}
        </Card>
        {dests.map((d, i) => (
          <Card key={d.destination_id}>
            <span className="text-xs font-bold text-white/80">Drop Off {dests.length > 1 ? i + 1 : ''} · {d.address}</span>
            {d.proof_photo_url ? (
              <div className="flex gap-3">
                <Photo url={d.proof_photo_url} />
                <ProofMeta at={d.proof_at} distance={d.proof_distance_m} override={d.proof_override_reason} />
              </div>
            ) : <NoPhoto label="No proof of delivery on file." />}
          </Card>
        ))}
        {fleetReturn && <InfoTile label="Vehicle Returned to Base" value={formatDateTime(fleetReturn)} />}
      </Panel>
    )
  }

  return (
    <Panel>
      <SectionHeader icon={<RouteIcon size={15} />} title={`Trips & Proof Photos (${trips.length})`} />
      {trips.map((trip) => (
        <Card key={trip.trip_id}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Trip {trip.trip_number}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>
              {humanize(trip.status)}
            </span>
          </div>
          {trip.notes && <p className="text-[11px] text-white/60">{trip.notes}</p>}

          <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Proof of Loading</span>
          {trip.pickup_proof_photo_url ? (
            <div className="flex gap-3">
              <Photo url={trip.pickup_proof_photo_url} />
              <ProofMeta at={trip.pickup_proof_at} distance={trip.pickup_proof_distance_m}
                override={trip.pickup_proof_override_reason} />
            </div>
          ) : <NoPhoto label="No proof of loading on file." />}

          {trip.booking_trip_stops.map((stop) => (
            <div key={stop.trip_stop_id} className="flex flex-col gap-1.5 pt-2 border-t" style={{ borderColor: BORDER }}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] text-white/75">
                  {stop.booking_destinations?.address ?? `Stop ${stop.sequence_order}`}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider shrink-0"
                  style={{ color: stop.status === 'delivered' ? CYAN : stop.status === 'failed' ? ERROR : MUTED }}>
                  {humanize(stop.status)}
                </span>
              </div>
              {stop.proof_photo_url ? (
                <div className="flex gap-3">
                  <Photo url={stop.proof_photo_url} />
                  <ProofMeta at={stop.proof_at ?? stop.delivered_at} distance={stop.proof_distance_m}
                    override={stop.proof_override_reason} />
                </div>
              ) : <NoPhoto label="No proof of delivery on file." />}
            </div>
          ))}
        </Card>
      ))}
      {fleetReturn && <InfoTile label="Vehicle Returned to Base" value={formatDateTime(fleetReturn)} />}
    </Panel>
  )
}

/**
 * Only the pass the vehicle was assigned on — the latest passed BLOWBAGETS
 * inspection before it went onto this booking. Later inspections belong to the
 * vehicle's own history, not to this transaction.
 */
function InspectionSection({ inspection }: { inspection: RecordInspection | null }) {
  return (
    <Panel>
      <SectionHeader icon={<ShieldCheck size={15} />} title="Vehicle Inspection (BLOWBAGETS)" />
      {inspection
        ? <InfoTile label="Passed Inspection" value={formatDateTime(inspection.inspected_at)} />
        : <NoPhoto label="No passed inspection on file before this assignment." />}
    </Panel>
  )
}

function ReportsSection({ reports }: { reports: RecordReport[] }) {
  if (reports.length === 0) return null
  return (
    <Panel>
      <SectionHeader icon={<AlertTriangle size={15} />} title={`Driver Reports (${reports.length})`} />
      {reports.map((r) => (
        <Card key={r.report_id}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white">
              {r.incident_type ? humanize(r.incident_type) : 'Unspecified Emergency'}
              {r.sub_type ? ` · ${r.sub_type}` : ''}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>
              {humanize(r.status)}
            </span>
          </div>
          <span className="text-[11px]" style={{ color: MUTED }}>
            {r.source === 'quick' ? 'Quick alert' : 'Detailed report'} · {formatDateTime(r.created_at)}
            {fullName(r.drivers?.users) ? ` · ${fullName(r.drivers?.users)}` : ''}
          </span>
          {r.description && <p className="text-[12px] text-white/75 whitespace-pre-wrap">{r.description}</p>}
          {r.address && <p className="text-[11px] text-white/50">{r.address}</p>}
          {r.trip_can_continue != null && (
            <p className="text-[11px]" style={{ color: r.trip_can_continue ? GREEN : ERROR }}>
              {r.trip_can_continue ? 'Trip could continue' : 'Trip could not continue'}
            </p>
          )}
          {r.photo_urls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {r.photo_urls.map((u, i) => <Photo key={u} url={u} caption={`Photo ${i + 1}`} />)}
            </div>
          )}
          {r.video_urls.length > 0 && (
            <div className="flex flex-col gap-1">
              {r.video_urls.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold hover:opacity-70"
                  style={{ color: CYAN }}>
                  <Video size={12} /> Video {i + 1}
                </a>
              ))}
            </div>
          )}
          {r.resolution_note && (
            <p className="text-[11px] text-white/60">
              Resolution{r.resolved_at ? ` (${formatDateTime(r.resolved_at)})` : ''}: {r.resolution_note}
            </p>
          )}
        </Card>
      ))}
    </Panel>
  )
}

function CustomerSection({ booking }: { booking: Booking }) {
  const c = booking.clients as {
    company_name?: string | null
    billing_address?: string | null
    users?: { first_name?: string; last_name?: string; email?: string | null; phone?: string | null } | null
  } | null | undefined
  if (!c) return null
  return (
    <Panel>
      <SectionHeader icon={<Building2 size={15} />} title="Customer" />
      <div className="grid grid-cols-2 gap-3">
        <InfoTile label="Company"         value={c.company_name || '—'} />
        <InfoTile label="Contact Person"  value={fullName(c.users) || '—'} />
        <InfoTile label="Email"           value={c.users?.email || '—'} />
        <InfoTile label="Phone"           value={c.users?.phone || '—'} />
      </div>
      {c.billing_address && <InfoTile label="Billing Address" value={c.billing_address} />}
    </Panel>
  )
}

function CargoLinesSection({ booking }: { booking: Booking }) {
  const items = (booking.booking_cargo_items as Array<{
    item_id: string
    quantity?: number | null; weight_kg?: number | null; volume_cbm?: number | null
    length_cm?: number | null; width_cm?: number | null; height_cm?: number | null
    notes?: string | null
    product_text?: string | null; commodity_text?: string | null
    products?: { name?: string; unit?: string | null } | null
    commodities?: { name?: string } | null
    shc?: { code?: string; name?: string } | null
    ashc?: { code?: string; name?: string } | null
  }> | undefined) ?? []
  if (items.length === 0) return null

  return (
    <Panel>
      <SectionHeader icon={<Package size={15} />} title={`Cargo Lines (${items.length})`} />
      {items.map((it) => {
        const name = it.products?.name ?? it.product_text ?? it.commodities?.name ?? it.commodity_text ?? 'Item'
        const dims = [it.length_cm, it.width_cm, it.height_cm].every((n) => n != null)
          ? `${it.length_cm} × ${it.width_cm} × ${it.height_cm} cm` : null
        const handling = [it.shc?.code, it.ashc?.code].filter(Boolean).join(', ')
        return (
          <Card key={it.item_id}>
            <span className="text-xs font-bold text-white">{name}</span>
            <div className="grid grid-cols-3 gap-2">
              {it.quantity   != null && <InfoTile label="Quantity" value={`${it.quantity}${it.products?.unit ? ` ${it.products.unit}` : ''}`} />}
              {it.weight_kg  != null && <InfoTile label="Weight"   value={`${it.weight_kg} KG`} />}
              {it.volume_cbm != null && <InfoTile label="Volume"   value={`${Number(it.volume_cbm).toFixed(2)} CBM`} />}
              {dims && <InfoTile label="Dimensions" value={dims} />}
              {handling && <InfoTile label="Handling" value={handling} />}
            </div>
            {it.notes && <p className="text-[11px] text-white/60">{it.notes}</p>}
          </Card>
        )
      })}
    </Panel>
  )
}

function DecisionCard({ stage, verb, actor, pendingLabel, note }: {
  stage:        string
  verb:         string
  actor:        DecisionActor | null
  pendingLabel: string
  note?:        string | null
}) {
  return (
    <Card>
      <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>{stage}</span>
      {actor ? (
        <>
          <span className="text-sm font-bold text-white">
            {verb} by {actor.name ?? 'an unknown user'}
          </span>
          <span className="text-[11px]" style={{ color: MUTED }}>
            {actor.role ? roleLabel(actor.role) : 'Role not recorded'}
            {actor.at ? ` · ${formatDateTime(actor.at)}` : ''}
          </span>
          {note && <span className="text-[11px]" style={{ color: AMBER }}>{note}</span>}
        </>
      ) : (
        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{pendingLabel}</span>
      )}
    </Card>
  )
}

function ApprovalsSection({ approvals, booking }: { approvals: TransactionApprovals; booking: Booking }) {
  // No fleet stage: fleet_status stopped being written when that approval was
  // retired (20260821000000_gm_first_approval_flow), so it reads 'pending' forever.
  const gmStatus  = String(booking.gm_status ?? '').toLowerCase()
  const opsStatus = String(booking.ops_status ?? '').toLowerCase()
  const cancelled = String(booking.status ?? '').toLowerCase() === 'cancelled'
  const eta       = booking.estimated_delivery as string | null | undefined

  const review    = approvals.review
  const rejected  = (review?.outcome ?? gmStatus) === 'rejected'
  // The Company Administrator approves on their own authority when the General
  // Manager isn't available; say so, so nobody reads it as the GM's decision.
  const proxyNote = review?.role === 'admin' ? 'Decided by the Company Administrator in place of the General Manager.' : null

  const reviewPending = gmStatus === 'approved' || gmStatus === 'rejected'
    ? `${humanize(gmStatus)} — approver not recorded (decided before approvals were tracked).`
    : 'Awaiting approval.'
  const assignPending = opsStatus === 'assigned'
    ? 'Assigned — assigner not recorded (assigned before assignments were tracked).'
    : 'Driver and vehicle not yet assigned.'

  // A Company Administrator rejection is recorded as a cancellation, not a
  // General Manager decision.
  const showCancel = cancelled && !rejected

  return (
    <Panel>
      <SectionHeader icon={<ClipboardCheck size={15} />} title="Approvals" />
      {/* Turned down before any approval: the cancellation card says it all. */}
      {!(showCancel && !review && gmStatus !== 'approved') && (
        <DecisionCard stage="Approval" verb={rejected ? 'Rejected' : 'Approved'}
          actor={review} pendingLabel={reviewPending} note={proxyNote} />
      )}
      {!rejected && !(showCancel && !approvals.assignment) && (
        <DecisionCard stage="Operations Manager" verb="Driver and vehicle assigned"
          actor={approvals.assignment} pendingLabel={assignPending} />
      )}
      {showCancel && (
        <DecisionCard stage="Rejected or Cancelled" verb="Cancelled"
          actor={approvals.cancelled} pendingLabel="Cancelled — by whom was not recorded." />
      )}
      {eta && <InfoTile label="Estimated Delivery" value={formatDateTime(eta)} />}
    </Panel>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function TransactionRecord({ booking }: { booking: Booking }) {
  const bookingId = booking.booking_id as string
  const [record, setRecord]   = useState<RecordData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // The parent keys this component by booking, so a different row remounts it
  // with fresh state instead of resetting it here.
  useEffect(() => {
    let cancelled = false
    transactionHistoryService.record(bookingId)
      .then((r) => { if (!cancelled) setRecord(r) })
      .catch((err) => { if (!cancelled) setError(getApiErrorMessage(err, 'Could not load the full record.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bookingId])

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: CYAN }} />
          Loading driver, vehicle and proof photos…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: ERROR }}>
          <AlertCircle size={14} /> {error}
        </div>
      ) : record && (
        <>
          <CrewSection record={record} booking={booking} />
          <TripsSection trips={record.trips} booking={booking} />
          {record.delivery?.trucks && <InspectionSection inspection={record.inspection} />}
          <ReportsSection reports={record.reports} />
          <ApprovalsSection approvals={record.approvals} booking={booking} />
        </>
      )}
      <CustomerSection booking={booking} />
      <CargoLinesSection booking={booking} />
    </div>
  )
}
