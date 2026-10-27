'use client'

import Pagination from '@/components/ui/Pagination'
import FilterBar from '@/components/ui/FilterBar'
import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import type { DateRange } from '@/components/ui/untitled/date-range-picker'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  MapPin,
  Truck,
  User,
  Package,
  Weight,
  Layers,
  Ruler,
  Check,
  ClipboardCheck,
  KeyRound,
  AlertTriangle,
  PauseCircle,
  Boxes,
  History,
  CalendarRange,
  Pencil,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { pickDriver, pickTruck, type CrewSelection, type PairFilled } from '@/lib/crew-pairing'
import { codingFlagFor, type CodingFlag } from '@/lib/number-coding'
import { formatPhDateTime, submittedAfterCloseToday } from '@/lib/office-hours'
import { licenseExpiryState } from '@/lib/license-expiry'
import { statusColor } from '@/components/map/status.colors'
import { useModuleAccess, writeAccess } from '@/components/layout/ModuleAccess'
import type { BookingDetail } from '@/app/types/maps/routemap.types'
import {
  bookingService,
  type AdminBookingLifecycleStatus,
  type DestinationDeliveryStatus,
  type BlowbagetsCheck,
} from '@/lib/services/client/booking.service'
import {
  assignmentService,
  isOutOfServiceStatus,
  outOfServiceVehicle,
  type AssignmentRecord,
} from '@/lib/services/admin/assignment.service'
import { driverService } from '@/lib/services/admin/user-management.service'
import { adminFetchTrucks } from '@/lib/services/admin/trucks.service'
import type { DriverUser } from '@/app/types/admin/user-management.types'
import { isAssignable, type Truck as TruckType } from '@/app/types/truck.types'
import { BLOWBAGETS_ITEMS } from '@/lib/blowbagets'
import { useAuthStore } from '@/lib/store/auth.store'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { nowDate } from '@/app/utils/serverTime'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { bookingRef, bookingRefFromRecord } from '@/lib/booking'
import {
  externalDriverService,
  type ExternalDriverAccess,
  type VendorDriverUser,
} from '@/lib/services/admin/external-driver.service'
import type { RouteDistance, SecondDriverRecord } from '@/lib/services/admin/assignment.service'
import ReusableModal, { RemarksModal } from '@/components/layout/ReusableModal'
import TripPlanner from './TripPlanner'
import VehiclePicker, { cargoSummaryFromBooking } from './VehiclePicker'
import CompletionPanel from '@/components/transactions/CompletionPanel'
import { formatPlateNumber, plateError } from '@/lib/validation/plate'
import ProblemReportedBadge, { hasOpenClientIssue } from '@/components/transactions/ProblemReportedBadge'
import ResubmittedBadge, { resubmissionsOf } from '@/components/transactions/ResubmittedBadge'
import ResubmissionChanges from '@/components/transactions/ResubmissionChanges'
import ReplaceCrewPanel from '@/components/transactions/ReplaceCrewPanel'
import StopTimesPanel from '@/components/transactions/StopTimesPanel'
import PausePanel from '@/components/transactions/PausePanel'
import { pauseReasonLabel } from '@/lib/services/admin/pause.service'
import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { useRecordLock, useRecordLocks } from '@/lib/hooks/useRecordLock'
import RecordLockBanner, { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useVehicleTypeOptions } from '@/lib/hooks/useVehicleTypes'
import { PALETTE } from '@/lib/palette'
import {
  CARD_CLASS,
  PANEL_BG,
  Tag,
  SectionHeading,
  AssetIcon,
  BookingInfoCard,
  CargoItemCard,
  CargoSummaryTiles,
  StopCard,
  DocumentRow,
} from './BookingDetailParts'

import RefreshButton from '@/components/ui/RefreshButton'
import { useTablePageSize } from '@/lib/hooks/useTablePageSize'

const BOOKING_STATUSES: AdminBookingLifecycleStatus[] = [
  'pending',
  'approved',
  'assigned',
  'in_transit',
  'delivered',
  'completed',
  'cancelled',
]

const DEST_STATUSES: DestinationDeliveryStatus[] = ['pending', 'delivered', 'failed']

// Roles that share this view. Each non-admin role sees a filtered slice of
// bookings and acts only on its own stage of the workflow:
//
//   client books -> general_manager approves (or rejects with remarks)
//                -> operations_manager picks a vehicle + driver
//                -> the driver is notified, and the fleet manager is told which
//                   of their vehicles was taken.
//
export type BookingRoleView =
  | 'admin'
  | 'general_manager'
  | 'operations_manager'
  | 'fleet_manager'

const ROLE_FORCED_STATUS: Partial<Record<BookingRoleView, AdminBookingLifecycleStatus>> = {
  general_manager:    'pending',
  fleet_manager:      'assigned',
}

// Operations sees every status EXCEPT pending (a booking only reaches ops once
// approved). It keeps the status dropdown but with 'pending' removed.
const ROLE_HIDE_PENDING: Partial<Record<BookingRoleView, boolean>> = {
  operations_manager: true,
}

type DetailWithExtra = BookingDetail & {
  transaction_documents?: string[] | null
  required_weight_kg?: number | null
  required_volume_cbm?: number | null
  required_length_cm?: number | null
  stackable_required?: boolean | null
  non_stackable_cargo?: boolean | null
  cargo_density_kg_cbm?: number | null
  required_net_weight_kg?: number | null
  gm_status?:         'pending' | 'approved' | 'rejected' | null
  ops_status?:        'pending' | 'assigned' | null
  // The GM's remarks when a booking was not approved.
  rejection_reason?:  string | null
  blowbagets_check?:  BlowbagetsCheck | null
}

type CargoItem = NonNullable<BookingDetail['booking_cargo_items']>[number]

function fileNameFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/')
    const raw = decodeURIComponent(parts[parts.length - 1] || url)
    return raw.replace(/(\.[a-zA-Z0-9]+)\1+$/i, '$1')
  } catch {
    return url.split('/').pop() ?? url
  }
}

function fmtStatus(s: string) {
  return (s ?? '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function normalizeBookingStatus(raw: string): AdminBookingLifecycleStatus {
  const s = (raw ?? '').toLowerCase().replace(/\s+/g, '_') as AdminBookingLifecycleStatus
  return BOOKING_STATUSES.includes(s) ? s : 'pending'
}

function getAssignedTruckId(detail: BookingDetail, trucks: TruckType[]): string {
  const assignedPlate = detail.driver?.truck?.plate_number
  if (!assignedPlate) return ''
  const truck = trucks.find((t) => t.plate_number === assignedPlate)
  return truck?.truck_id ?? ''
}

function getPrefillFromBookingDetail(detail: BookingDetail, trucks: TruckType[]) {
  return {
    driverId: detail.driver?.driver_id ?? '',
    truckId:  getAssignedTruckId(detail, trucks),
  }
}

/**
 * Marks a pending booking the client sent after 5 PM today. Clients may book at
 * any time; this tells staff still on shift that it came in after closing. It
 * clears itself at midnight, when the booking becomes the next day's ordinary
 * work.
 */
function AfterHoursBadge() {
  return (
    <span
      title="Submitted after 5:00 PM today — due for review when the office opens"
      className="inline-flex text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border mt-0.5"
      style={{ color: '#ffea00', borderColor: '#facc1555', background: '#facc1514' }}
    >
      After hours
    </span>
  )
}

const OUT_OF_SERVICE_WORDS: Record<string, string> = {
  under_maintenance: 'Under Maintenance',
  inactive:          'Inactive',
  archived:          'Archived',
}

/** List badge: the vehicle on this booking was taken out of service. */
function VehiclePulledBadge({ plate, status }: { plate: string; status: string }) {
  return (
    <span
      title={`${plate} is ${OUT_OF_SERVICE_WORDS[status] ?? status}. Choose another vehicle.`}
      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border mt-0.5"
      style={{ color: '#f62626', borderColor: '#f8717155', background: '#f8717114' }}
    >
      <AlertTriangle size={9} />
      Vehicle out of service
    </span>
  )
}

/**
 * Detail banner for the same. Before departure the fix is another vehicle; on
 * the road the cargo is already on it, so it is Operations' call.
 */
function VehiclePulledBanner({
  plate, status, onTheRoad,
}: { plate: string; status: string; onTheRoad: boolean }) {
  return (
    <div
      className="flex gap-2 rounded-lg border px-3 py-2 text-xs leading-snug"
      style={{ color: '#f62626', borderColor: 'rgba(246,38,38,0.35)', background: 'rgba(246,38,38,0.08)' }}
    >
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>
        <b>{plate}</b> was marked <b>{OUT_OF_SERVICE_WORDS[status] ?? status}</b> by the Fleet Manager.{' '}
        {onTheRoad
          ? 'It is already on the road — decide whether to send a replacement vehicle.'
          : 'Choose another vehicle. The driver cannot load it until you do.'}
      </span>
    </div>
  )
}

/** List badge: the delivery is paused (weather, breakdown, closed stop…). */
function PausedBadge({ reason }: { reason: string }) {
  return (
    <span
      title={`Paused: ${pauseReasonLabel(reason)}`}
      className="flex w-fit items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border mt-1"
      style={{ color: '#ffea00', borderColor: '#fbbf2455', background: '#fbbf2414' }}
    >
      <PauseCircle size={9} />
      Paused · {pauseReasonLabel(reason)}
    </span>
  )
}

/** Server-corrected "now", re-read each minute so the badge drops at midnight. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => nowDate())
  useEffect(() => {
    const id = setInterval(() => setNow(nowDate()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

interface ListRow {
  booking_id: string
  display_id: string
  origin?: string
  status: string
  schedule_date?: string
  truck_type_needed?: string
  company?: string | null
  stops: number
  created_at: string | null
  /** Set while the delivery is paused. */
  pause_reason: string | null
  /** True while the client's reported problem is unresolved. */
  issue_open: boolean
  issue_note: string | null
  /** Times the client resubmitted it after a rejection. */
  resubmissions: number
}

function toRows(raw: Record<string, unknown>[]): ListRow[] {
  return raw.map((b) => {
    const clients = b.clients as { company_name?: string | null } | undefined
    const dests   = b.booking_destinations as unknown[] | undefined

    return {
      booking_id:        String(b.booking_id ?? ''),
      display_id:        bookingRefFromRecord(b),
      origin:            typeof b.origin === 'string' ? b.origin : undefined,
      status:            typeof b.status === 'string' ? b.status : 'pending',
      schedule_date:     typeof b.schedule_date === 'string' ? b.schedule_date : undefined,
      truck_type_needed: typeof b.truck_type_needed === 'string' ? b.truck_type_needed : undefined,
      company:           clients?.company_name ?? null,
      stops:             Array.isArray(dests) ? dests.length : 0,
      created_at:        typeof b.created_at === 'string' ? b.created_at : null,
      pause_reason:      b.paused_at && typeof b.pause_reason === 'string' ? b.pause_reason : null,
      issue_open:        hasOpenClientIssue(b),
      issue_note:        typeof b.client_issue_note === 'string' ? b.client_issue_note : null,
      resubmissions:     resubmissionsOf(b),
    }
  })
}

function resolveLabel(
  id: string | null | undefined,
  text: string | null | undefined,
  joined: { name: string } | null | undefined,
): string | null {
  if (joined?.name) return joined.name
  if (text)         return text
  if (id)           return id
  return null
}

function fmtNum(n: number | null | undefined, unit: string, decimals = 2): string | null {
  if (n == null || n === 0) return null
  return `${n.toFixed(decimals)} ${unit}`
}

// Vendor-supplied crew. The driver is picked from the vendor drivers registered
// in Driver Management, and the server copies their details and their vendor
// onto the delivery. Only the vehicle is typed here, because vendor vehicles are
// never registered.
interface VendorAssignForm {
  vendor_driver_user_id: string
  /** Optional second vendor driver (user_id); '' for none. */
  second_vendor_driver_user_id: string
  vendor_vehicle_plate:  string
  vendor_vehicle_type:   string
  // Display only, off the delivery already on the booking: the name for a vendor
  // driver who was typed in before vendor drivers were registered.
  vendor_driver_name:    string
  vendor_name:           string
}

const emptyVendorForm: VendorAssignForm = {
  vendor_driver_user_id: '',
  second_vendor_driver_user_id: '',
  vendor_vehicle_plate:  '',
  vendor_vehicle_type:   '',
  vendor_driver_name:    '',
  vendor_name:           '',
}

// Same words under both second-driver pickers.
const SECOND_DRIVER_HINT =
  'They see this booking and its stops in the app. The main driver confirms pickup, stops and proof photos.'

const HELPER_HINT = 'For information only. The helper has no app access and is not notified.'

/**
 * Which crew fields the route calls for. Over the threshold: a required second
 * driver and no helper. At or under it: an optional helper and no second
 * driver. Still measuring, or unmeasurable: both optional, nothing enforced.
 */
function crewRule(route: RouteDistance | null): { second: 'required' | 'hidden' | 'optional'; helper: boolean } {
  if (route?.requires_second_driver === true)  return { second: 'required', helper: false }
  if (route?.requires_second_driver === false) return { second: 'hidden',   helper: true }
  return { second: 'optional', helper: true }
}

function RouteDistanceNote({ route, loading }: { route: RouteDistance | null; loading: boolean }) {
  const text = loading
    ? 'Measuring the route…'
    : route?.distance_km == null
      ? 'Route distance unavailable, so neither a second driver nor a helper is required.'
      : route.requires_second_driver
        ? `Route: ${route.distance_km} km by road. Over ${route.threshold_km} km, so a second driver is required.`
        : `Route: ${route.distance_km} km by road. ${route.threshold_km} km or less, so no second driver. A helper can be added.`
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-white/55">
      <Ruler size={12} className="text-white/35 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function vendorDriverName(u: VendorDriverUser): string {
  return [u.first_name, u.middle_name, u.last_name, u.suffix].filter(Boolean).join(' ') || u.email
}

/**
 * Why a vendor driver can't be picked for this booking, or null when they can.
 * A driver takes one booking at a time, as main or second driver, until the
 * vehicle is confirmed back at the parking. The server refuses it either way.
 */
function vendorDriverBusyNote(u: VendorDriverUser, bookingId: string): string | null {
  const b = u.current_booking
  if (!b || b.booking_id === bookingId) return null
  const ref = b.reference_number ?? 'another booking'
  return b.awaiting_return ? ` — not back at the parking from ${ref}` : ` — on ${ref}`
}

/** "Expired" / "expires in 12 days" for the dropdown, or nothing when in date. */
function licenseNote(expiry: string | null | undefined): string {
  const state = licenseExpiryState(expiry)
  if (state.kind === 'expired') return ' — ⚠ license expired'
  if (state.kind === 'expiring') {
    return state.daysLeft === 0 ? ' — ⚠ license expires today' : ` — ⚠ license expires in ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'}`
  }
  return ''
}

/**
 * App access for a vendor driver who was given an account.
 *
 * Two buttons, and they are not the same action. "Resend setup link" is for a
 * driver who never enrolled or has a new phone — it leaves any working passkey
 * alone. "Revoke access" is offboarding: every passkey dies, the session is
 * killed, the account is deactivated. Once revoked, both give way to "Restore
 * access", which reactivates the account and sends a new setup link — the old
 * passkeys stay dead. The vendor snapshot on the delivery is untouched by all
 * of them, because that is the record of who drove.
 */
function ExternalDriverAccessRow({ userId }: { userId: string }) {
  const [access, setAccess] = useState<ExternalDriverAccess | null>(null)

  const load = useCallback(() => {
    externalDriverService.getAccess(userId)
      .then(setAccess)
      .catch(() => setAccess(null))
  }, [userId])

  useEffect(() => { load() }, [load])

  const revoked = access !== null && !access.account_active

  const status = !access
    ? 'Checking app access…'
    : revoked
      ? 'App access revoked'
    : access.enrolled
      ? `App access active · ${access.passkey_count} passkey${access.passkey_count === 1 ? '' : 's'}` +
        (access.last_used_at ? ` · last used ${new Date(access.last_used_at).toLocaleString()}` : '')
      : access.invite_pending
        ? `Setup link sent — not yet used${access.invite_expires_at ? ` · expires ${new Date(access.invite_expires_at).toLocaleString()}` : ''}`
        : 'No app access set up'

  return (
    <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-white/45">
        <KeyRound size={11} className="text-white/30 shrink-0" />
        <span>{status}</span>
      </div>
      {/* Re-inviting, revoking and restoring moved to the IT Administrator (2026-10-24). */}
      <p className="text-[10px] text-white/35">App access is managed by the IT Administrator.</p>
    </div>
  )
}

function AssignmentPanel({
  detail,
  drivers,
  trucks,
  assignDriverId,
  assignSecondDriverId,
  assignTruckId,
  assignBusy,
  pickerOpen,
  vendorMode,
  vendorForm,
  vendorDrivers,
  vendorDriversLoading,
  externalDriverUserId,
  selectClass,
  onDriverChange,
  onSecondDriverChange,
  secondDriver,
  helperName,
  savedHelperName,
  onHelperNameChange,
  route,
  routeLoading,
  onTruckChange,
  onVendorModeChange,
  onVendorFieldChange,
  onAssign,
  onOpenPicker,
  onClosePicker,
  canEdit,
}: {
  detail:          BookingDetail
  drivers:         DriverUser[]
  trucks:          TruckType[]
  assignDriverId:  string
  /** Optional second company driver ('' for none). */
  assignSecondDriverId: string
  /** The second driver already on the booking, for the summary. */
  secondDriver:    SecondDriverRecord | null
  /** The helper's name in the picker ('' for none). */
  helperName:      string
  /** The helper already on the booking, for the summary. */
  savedHelperName: string | null
  onHelperNameChange: (name: string) => void
  /** Road distance of the route; decides second driver vs helper. */
  route:           RouteDistance | null
  routeLoading:    boolean
  assignTruckId:   string
  assignBusy:      boolean
  /** The "Choose vehicle and driver" pop-up is up. */
  pickerOpen:      boolean
  vendorMode:      boolean
  vendorForm:      VendorAssignForm
  /** Vendor drivers registered in Driver Management, with their access state. */
  vendorDrivers:   VendorDriverUser[]
  vendorDriversLoading: boolean
  /** Set when this vendor driver was provisioned an app account, so access can be managed. */
  externalDriverUserId: string | null
  selectClass:     string
  onDriverChange:  (id: string) => void
  onSecondDriverChange: (id: string) => void
  onTruckChange:   (id: string) => void
  onVendorModeChange:  (on: boolean) => void
  onVendorFieldChange: (key: keyof VendorAssignForm, value: string) => void
  onAssign:        () => void
  onOpenPicker:    () => void
  /** Closes without saving and puts back what is on the booking. */
  onClosePicker:   () => void
  /** Booking Management tier allows edits; Read Only sees the buttons disabled. */
  canEdit:         boolean
}) {
  // On an assigned booking "Edit" unlocks "Change vehicle and driver" first, so
  // a crew is never changed by accident. Keyed to the booking and the pop-up, so
  // it locks again on another booking and whenever the pop-up opens or closes.
  const editKey = `${detail.booking_id}:${pickerOpen ? 'open' : 'closed'}`
  const [editState, setEditState] = useState({ key: editKey, on: false })
  const editing = editState.key === editKey && editState.on
  const toggleEditing = () => setEditState({ key: editKey, on: !editing })

  // Vendor vehicles are never registered, so their type is picked from System
  // Maintenance → Vehicle Types. One typed in before that list existed is kept.
  const vehicleTypes = useVehicleTypeOptions(vendorForm.vendor_vehicle_type, vendorMode)
  const isAssigned = normalizeBookingStatus(detail.status) === 'assigned'

  const driverLabel = (() => {
    if (vendorMode) {
      const picked = vendorDrivers.find((v) => v.user_id === vendorForm.vendor_driver_user_id)
      return picked ? vendorDriverName(picked) : vendorForm.vendor_driver_name || '—'
    }
    const dr = drivers.find((d) => (d.drivers?.driver_id ?? d.user_id) === assignDriverId)
    if (!dr) return assignDriverId || '—'
    return `${dr.first_name} ${dr.last_name}${dr.drivers?.license_number ? ` · ${dr.drivers.license_number}` : ''}`
  })()

  // The second driver, from the picker's current choice, falling back to the one
  // already on the booking.
  const secondDriverLabel = (() => {
    if (vendorMode) {
      const id = vendorForm.second_vendor_driver_user_id
      if (!id) return null
      const picked = vendorDrivers.find((v) => v.user_id === id)
      if (picked) return vendorDriverName(picked)
    } else {
      if (!assignSecondDriverId) return null
      const dr = drivers.find((d) => (d.drivers?.driver_id ?? d.user_id) === assignSecondDriverId)
      if (dr) return `${dr.first_name} ${dr.last_name}`
    }
    const u = secondDriver?.users
    return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || null : null
  })()

  const truckLabel = (() => {
    if (vendorMode) {
      return [vendorForm.vendor_vehicle_plate, vendorForm.vendor_vehicle_type]
        .filter(Boolean).join(' · ') || '—'
    }
    const t = trucks.find((t) => t.truck_id === assignTruckId)
    if (!t) return assignTruckId || '—'
    return `${t.plate_number}${t.vehicle_type ? ` · ${t.vehicle_type}` : ''}`
  })()

  const vendorLabel = vendorDrivers.find((v) => v.user_id === vendorForm.vendor_driver_user_id)?.drivers?.vendor_name
    || vendorForm.vendor_name

  // Only accounts that can sign in are offered; a revoked one would be refused.
  const pickableVendorDrivers = vendorDrivers.filter(
    (v) => v.access?.account_active || v.user_id === vendorForm.vendor_driver_user_id,
  )

  const rule = crewRule(route)
  const hasSecond = vendorMode ? !!vendorForm.second_vendor_driver_user_id : !!assignSecondDriverId
  // Same plate rule as Vehicle Management. Shown once something is typed.
  const vendorPlateError = vendorMode && vendorForm.vendor_vehicle_plate.trim()
    ? plateError(vendorForm.vendor_vehicle_plate)
    : null
  const canSubmit = !routeLoading && (rule.second !== 'required' || hasSecond) && (vendorMode
    ? !!vendorForm.vendor_driver_user_id && !plateError(vendorForm.vendor_vehicle_plate)
    : !!assignDriverId && !!assignTruckId)

  const secondDriverLabelText = rule.second === 'required'
    ? <>Second driver<span className="text-red-400"> *</span></>
    : 'Second driver (optional)'

  const helperField = rule.helper && (
    <div>
      <label className="text-[11px] text-white/40 block mb-1">Helper (optional)</label>
      <input
        value={helperName}
        disabled={assignBusy}
        onChange={(e) => onHelperNameChange(e.target.value)}
        className={selectClass}
        placeholder="Helper's full name"
        maxLength={120}
      />
      <p className="text-[10px] text-white/35 mt-1 leading-snug">{HELPER_HINT}</p>
    </div>
  )

  // Number coding is a flag, never a block — see lib/number-coding.
  const codingOf  = (plate: string | null | undefined) => codingFlagFor(plate, detail)
  const pairedPlateOf = (driverId: string) =>
    trucks.find((t) => t.assigned_driver_id === driverId)?.plate_number ?? null
  const selectedPlate = vendorMode
    ? vendorForm.vendor_vehicle_plate
    : trucks.find((t) => t.truck_id === assignTruckId)?.plate_number
      ?? detail.vehicle?.plate_number
      ?? detail.driver?.truck?.plate_number
      ?? null
  const selectedCoding = selectedPlate ? codingOf(selectedPlate) : null

  // The load the client recorded — what the vehicle is chosen against, now that
  // the client no longer picks one when booking.
  const cargo = useMemo(() => cargoSummaryFromBooking(detail), [detail])

  const title = isAssigned ? 'Change vehicle and driver' : 'Choose vehicle and driver'
  const crewRowIcon = { size: 18, strokeWidth: 2, className: 'text-white shrink-0' }

  return (
    <div className={`${CARD_CLASS} px-3.5 pt-2 pb-3.5 space-y-2.5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-[5px] min-w-0">
          <AssetIcon name="steering-wheel" />
          <h3 className="text-sm font-bold text-[#818181]">Driver and Vehicle Assignment</h3>
        </div>
        {isAssigned && (
          <button
            type="button"
            disabled={assignBusy}
            onClick={toggleEditing}
            aria-pressed={editing}
            {...writeAccess(canEdit)}
            className="inline-flex items-center gap-1 shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={editing
              ? { borderColor: 'rgba(77,249,237,0.45)', color: 'var(--color-cyan)', background: 'rgba(77,249,237,0.10)' }
              : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}
          >
            <Pencil size={11} />
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {isAssigned ? (
        <div className="space-y-2.5 text-sm font-bold text-[#818181]">
          {vendorMode && <Tag color={PALETTE.orange}>Vendor-Supplied</Tag>}
          <div className="flex items-start gap-[5px]">
            <User {...crewRowIcon} />
            <span className="min-w-0 break-words">{driverLabel}</span>
          </div>
          {secondDriverLabel && (
            <div className="flex items-start gap-[5px]">
              <User {...crewRowIcon} />
              <span className="min-w-0 break-words">{secondDriverLabel} <span className="text-xs font-normal">· second driver</span></span>
            </div>
          )}
          {savedHelperName && (
            <div className="flex items-start gap-[5px]">
              <User {...crewRowIcon} />
              <span className="min-w-0 break-words">{savedHelperName} <span className="text-xs font-normal">· helper</span></span>
            </div>
          )}
          <div className="flex items-start gap-[5px]">
            <Truck {...crewRowIcon} />
            <span className="min-w-0 break-words">{truckLabel}</span>
          </div>
          {vendorMode && vendorLabel && (
            <div className="text-xs font-normal">Vendor: {vendorLabel}</div>
          )}
          {vendorMode && externalDriverUserId && (
            <ExternalDriverAccessRow userId={externalDriverUserId} />
          )}
          {selectedCoding && !pickerOpen && <CodingNotice flag={selectedCoding} plate={selectedPlate!} />}
        </div>
      ) : (
        <p className="text-xs text-white/45">No vehicle or driver assigned yet.</p>
      )}

      <button
        type="button"
        disabled={assignBusy || (isAssigned && !editing)}
        onClick={onOpenPicker}
        aria-haspopup="dialog"
        {...writeAccess(canEdit)}
        className="w-full py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{
          background: 'rgba(77,249,237,0.12)',
          border:     '1px solid rgba(77,249,237,0.30)',
          color:      'var(--color-cyan)',
        }}
      >
        <Truck size={14} />
        {title}
      </button>

      <CrewPickerDialog
        open={pickerOpen && canEdit}
        busy={assignBusy}
        title={title}
        subtitle={[detail.reference_number, detail.clients?.company_name, detail.schedule_date].filter(Boolean).join(' · ')}
        onClose={onClosePicker}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              disabled={assignBusy}
              onClick={onClosePicker}
              className="flex-1 py-2 rounded-lg text-sm font-bold border border-white/10
                         text-white/50 hover:text-white transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={assignBusy || !canSubmit}
              onClick={onAssign}
              className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
              style={{
                background: 'rgba(77,249,237,0.12)',
                border:     '1px solid rgba(77,249,237,0.30)',
                color:      'var(--color-cyan)',
              }}
            >
              {assignBusy ? 'Assigning…' : isAssigned ? 'Update' : 'Assign'}
            </button>
          </div>
        }
      >
        {/* Company vs vendor-supplied crew toggle */}
        <div className="flex rounded-lg border border-white/10 p-0.5 text-[11px] font-bold">
          <button
            type="button"
            disabled={assignBusy}
            onClick={() => onVendorModeChange(false)}
            className="flex-1 py-1.5 rounded-md transition-colors disabled:opacity-40"
            style={!vendorMode
              ? { background: 'rgba(77,249,237,0.14)', color: 'var(--color-cyan)' }
              : { color: '#888' }}
          >
            Company fleet
          </button>
          <button
            type="button"
            disabled={assignBusy}
            onClick={() => onVendorModeChange(true)}
            className="flex-1 py-1.5 rounded-md transition-colors disabled:opacity-40"
            style={vendorMode
              ? { background: 'rgba(255,122,48,0.14)', color: '#ffea00' }
              : { color: '#888' }}
          >
            Vendor-supplied
          </button>
        </div>

        {/* What the vehicle has to carry. */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/55">
          <span className="flex items-center gap-1">
            <Package size={12} className="text-white/35" />
            {cargo.totalPieces > 0 ? `${cargo.totalPieces} pieces` : '— pieces'}
          </span>
          <span className="flex items-center gap-1">
            <Weight size={12} className="text-white/35" />
            {cargo.grossWeightKg > 0 ? `${cargo.grossWeightKg.toLocaleString()} KG` : '— KG'}
          </span>
          <span className="flex items-center gap-1">
            <Layers size={12} className="text-white/35" />
            {cargo.volumeCbm > 0 ? `${cargo.volumeCbm.toFixed(2)} CBM` : '— CBM'}
          </span>
          {cargo.maxDimensionCm > 0 && (
            <span className="flex items-center gap-1">
              <Ruler size={12} className="text-white/35" />
              Longest item {cargo.maxDimensionCm} CM
            </span>
          )}
          {cargo.hasNonStackable && <span>· Non-stackable items</span>}
        </div>

        <RouteDistanceNote route={route} loading={routeLoading} />

        {vendorMode ? (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-white/40 block mb-1">
                Vendor driver<span className="text-red-400"> *</span>
              </label>
              <select
                value={vendorForm.vendor_driver_user_id}
                disabled={assignBusy || vendorDriversLoading}
                onChange={(e) => onVendorFieldChange('vendor_driver_user_id', e.target.value)}
                className={selectClass}
              >
                <option value="">
                  {vendorDriversLoading ? 'Loading vendor drivers…' : 'Select vendor driver'}
                </option>
                {pickableVendorDrivers.map((v) => {
                  const busy = vendorDriverBusyNote(v, detail.booking_id)
                  return (
                    <option key={v.user_id} value={v.user_id} disabled={!!busy}>
                      {vendorDriverName(v)}
                      {v.drivers?.vendor_name ? ` · ${v.drivers.vendor_name}` : ''}
                      {licenseNote(v.drivers?.license_expiry)}
                      {busy ?? ''}
                    </option>
                  )
                })}
              </select>
              <p className="text-[10px] text-white/35 mt-1 leading-snug">
                {!vendorDriversLoading && pickableVendorDrivers.length === 0
                  ? 'No vendor drivers yet. Add them in User Management → Drivers → Vendor Drivers.'
                  : 'Their details and vendor are copied onto this delivery. Add or edit vendor drivers in User Management.'}
              </p>
              {/* Typed in before vendor drivers were registered: there is no
                  record to pick, so a registered driver has to be chosen to update. */}
              {!vendorForm.vendor_driver_user_id && vendorForm.vendor_driver_name && (
                <p className="text-[10px] text-amber-300/80 mt-1 leading-snug">
                  On this booking now: {vendorForm.vendor_driver_name} (typed in, not registered).
                </p>
              )}
            </div>
            {rule.second !== 'hidden' && (
            <div>
              <label className="text-[11px] text-white/40 block mb-1">{secondDriverLabelText}</label>
              <select
                value={vendorForm.second_vendor_driver_user_id}
                disabled={assignBusy || vendorDriversLoading}
                onChange={(e) => onVendorFieldChange('second_vendor_driver_user_id', e.target.value)}
                className={selectClass}
              >
                <option value="">{rule.second === 'required' ? 'Select second driver' : 'No second driver'}</option>
                {pickableVendorDrivers
                  .filter((v) => v.user_id !== vendorForm.vendor_driver_user_id)
                  .map((v) => {
                    const busy = vendorDriverBusyNote(v, detail.booking_id)
                    return (
                      <option key={v.user_id} value={v.user_id} disabled={!!busy}>
                        {vendorDriverName(v)}
                        {v.drivers?.vendor_name ? ` · ${v.drivers.vendor_name}` : ''}
                        {licenseNote(v.drivers?.license_expiry)}
                        {busy ?? ''}
                      </option>
                    )
                  })}
              </select>
              <p className="text-[10px] text-white/35 mt-1 leading-snug">{SECOND_DRIVER_HINT}</p>
            </div>
            )}
            {helperField}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-white/40 block mb-1">
                  Vehicle plate<span className="text-red-400"> *</span>
                </label>
                <input
                  value={vendorForm.vendor_vehicle_plate}
                  disabled={assignBusy}
                  onChange={(e) => onVendorFieldChange('vendor_vehicle_plate', formatPlateNumber(e.target.value))}
                  className={`${selectClass} font-mono tracking-widest uppercase`}
                  style={vendorPlateError ? { borderColor: 'rgba(246,38,38,0.6)' } : undefined}
                  placeholder="ABC 1234"
                  maxLength={8}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  aria-invalid={!!vendorPlateError}
                />
                {vendorPlateError && (
                  <p className="text-[10px] text-red-400 mt-1 leading-snug">{vendorPlateError}</p>
                )}
              </div>
              <div>
                <label htmlFor="vendor-vehicle-type" className="text-[11px] text-white/40 block mb-1">Vehicle type</label>
                <select
                  id="vendor-vehicle-type"
                  value={vendorForm.vendor_vehicle_type}
                  disabled={assignBusy || vehicleTypes.loading}
                  onChange={(e) => onVendorFieldChange('vendor_vehicle_type', e.target.value)}
                  className={selectClass.replace('text-sm', 'text-base sm:text-sm')}
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="">{vehicleTypes.loading ? 'Loading types…' : 'Select type'}</option>
                  {vehicleTypes.options.map((vt) => (
                    <option key={vt} value={vt}>{vt}</option>
                  ))}
                </select>
                {vehicleTypes.error && (
                  <p className="text-[10px] text-amber-200/90 mt-1 leading-snug">
                    Couldn&apos;t load the vehicle types. Close and reopen this pop-up to try again.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Vehicle</label>
              <VehiclePicker
                trucks={trucks}
                selectedId={assignTruckId}
                cargo={cargo}
                disabled={assignBusy}
                codingOf={codingOf}
                onSelect={onTruckChange}
              />
              {trucks.length > 0 && (
                <p className="text-[10px] text-white/35 mt-1">
                  {`${trucks.length} vehicle${trucks.length === 1 ? '' : 's'} cleared by BLOWBAGETS. Picking one fills in its usual driver.`}
                </p>
              )}
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Driver</label>
              <select
                value={assignDriverId}
                disabled={assignBusy}
                onChange={(e) => onDriverChange(e.target.value)}
                className={selectClass}
              >
                <option value="">Select driver</option>
                {drivers.map((dr) => {
                  const driverId = dr.drivers?.driver_id ?? dr.user_id
                  // Picking a driver fills in their usual vehicle, so its
                  // coding day is worth seeing at this step too.
                  const coded = codingOf(pairedPlateOf(driverId))
                  return (
                    <option key={dr.user_id} value={driverId}>
                      {dr.first_name} {dr.last_name}
                      {dr.drivers?.license_number ? ` · ${dr.drivers.license_number}` : ''}
                      {coded ? ' — ⚠ usual vehicle coded' : ''}
                    </option>
                  )
                })}
              </select>
              {/* The list is only ever the drivers who ticked THIS booking's day
                  on their own calendar, so an empty one means nobody offered to
                  work that day — not a bug, and not something to override here. */}
              <p className="text-[10px] text-white/35 mt-1">
                {drivers.length === 0
                  ? `No driver marked ${detail.schedule_date ?? 'this day'} as a day they can work.`
                  : `${drivers.length} driver${drivers.length === 1 ? '' : 's'} available on ${detail.schedule_date}.`}
              </p>
            </div>
            {rule.second !== 'hidden' && (
            <div>
              <label className="text-[11px] text-white/40 block mb-1">{secondDriverLabelText}</label>
              <select
                value={assignSecondDriverId}
                disabled={assignBusy}
                onChange={(e) => onSecondDriverChange(e.target.value)}
                className={selectClass}
              >
                <option value="">{rule.second === 'required' ? 'Select second driver' : 'No second driver'}</option>
                {drivers
                  .filter((dr) => (dr.drivers?.driver_id ?? dr.user_id) !== assignDriverId)
                  .map((dr) => (
                    <option key={dr.user_id} value={dr.drivers?.driver_id ?? dr.user_id}>
                      {dr.first_name} {dr.last_name}
                      {dr.drivers?.license_number ? ` · ${dr.drivers.license_number}` : ''}
                    </option>
                  ))}
              </select>
              <p className="text-[10px] text-white/35 mt-1 leading-snug">{SECOND_DRIVER_HINT}</p>
            </div>
            )}
            {helperField}
          </div>
        )}

        {selectedCoding && <CodingNotice flag={selectedCoding} plate={selectedPlate!} />}
      </CrewPickerDialog>
    </div>
  )
}

/**
 * The pop-up the crew is chosen in. Wider than ReusableModal, which is sized for
 * a yes/no question, because it holds the vehicle cards.
 */
function CrewPickerDialog({
  open, busy, title, subtitle, onClose, footer, children,
}: {
  open:     boolean
  busy:     boolean
  title:    string
  subtitle: string
  onClose:  () => void
  footer:   ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])
  useBodyScrollLock(open)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="crew-picker-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={busy ? undefined : onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crew-picker-title"
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col w-full sm:max-w-2xl max-h-[92dvh] rounded-t-[18px] sm:rounded-[18px]
                       border border-white/[0.08] bg-[#232323]"
          >
            <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-white/[0.06]">
              <div className="min-w-0">
                <h2 id="crew-picker-title" className="text-base font-bold text-white">{title}</h2>
                {subtitle && <p className="text-[11px] text-white/40 mt-0.5 truncate">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                aria-label="Close"
                className="shrink-0 p-1 rounded-md text-white/45 hover:text-white transition-colors disabled:opacity-40"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
              {children}
            </div>
            <div className="px-4 sm:px-5 py-3 border-t border-white/[0.06]">
              {footer}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * The vehicle on (or about to go on) this booking is coded that day somewhere
 * the route goes. Informational: the operator may still assign it — a run
 * planned between the coding windows is fine, holidays suspend coding, and
 * some vehicles are exempt.
 */
function CodingNotice({ flag, plate }: { flag: CodingFlag; plate: string }) {
  return (
    <div
      className="rounded-lg border px-2.5 py-2 flex items-start gap-2"
      style={{ borderColor: 'rgba(255,122,48,0.35)', background: 'rgba(255,122,48,0.10)' }}
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-semibold text-amber-300">
          Number coding: {plate} is coded on {flag.day}
        </p>
        <p className="text-[11px] text-white/65 leading-snug">
          Plate ends in {flag.digit}, and the route goes through {flag.cities.join(', ')}.
          Coding hours: {flag.hours}.
          {flag.callTimeCoded && ' The call time falls inside the coding hours.'}
        </p>
        <p className="text-[10px] text-white/35 leading-snug">
          Not enforced on public holidays. Some cities set their own hours.
        </p>
      </div>
    </div>
  )
}

// Read-only view of a BLOWBAGETS inspection that was recorded against the booking
// itself, back when the fleet manager reviewed each booking before dispatch.
// Inspections now belong to the vehicle (Vehicle Management), so this only ever
// renders for bookings created before that change.
function BlowbagetsRecord({ check }: { check: BlowbagetsCheck }) {
  const failed = BLOWBAGETS_ITEMS.filter((it) => !check.items[it.key])
  const when = (() => {
    const d = new Date(check.checked_at)
    return Number.isNaN(d.getTime()) ? check.checked_at : d.toLocaleString()
  })()

  return (
    <div className="rounded-xl border border-white/[0.08] p-3 space-y-2.5 bg-black/20">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={14} className="text-[var(--color-cyan)]" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">
          BLOWBAGETS inspection recorded
        </h3>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {BLOWBAGETS_ITEMS.map((it) => {
          const on = !!check.items[it.key]
          return (
            <span
              key={it.key}
              title={`${it.label} — ${on ? 'passed' : 'failed'}`}
              className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md border"
              style={
                on
                  ? { color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.35)', background: 'rgba(77,249,237,0.10)' }
                  : { color: '#f62626', borderColor: 'rgba(246,38,38,0.35)', background: 'rgba(246,38,38,0.10)' }
              }
            >
              {on ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
              {it.label}
            </span>
          )
        })}
      </div>

      {failed.length > 0 && (
        <p className="text-[11px] text-[#f62626]/90 leading-snug">
          {failed.length} item{failed.length > 1 ? 's' : ''} failed: {failed.map((f) => f.label).join(', ')}
        </p>
      )}
      <p className="text-[10px] text-white/35">Checked {when}</p>
    </div>
  )
}

/**
 * Proof of pickup / proof of delivery — the photo the driver took at the stop
 * before confirming it in the app. Click through for the full-size image.
 */
function ProofPhoto({
  url, at, label,
}: { url: string; at?: string | null; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${label} — open full size`}
      className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-black/20 p-2
                 hover:border-[var(--color-cyan)]/40 transition-colors group"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="h-12 w-12 shrink-0 rounded-md object-cover border border-white/10"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-white/80 group-hover:text-white transition-colors">
          {label}
        </span>
        <span className="block text-[11px] text-white/40">
          {at ? new Date(at).toLocaleString() : 'Photo on file'}
        </span>
      </span>
    </a>
  )
}

function TransactionDocs({ docs }: { docs: string[] }) {
  return (
    <section>
      <SectionHeading icon={<History size={18} strokeWidth={2} />}>Transaction Documents</SectionHeading>
      {docs.length === 0 ? (
        <p className="text-sm text-white/40">No documents attached.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((url, i) => (
            <li key={url}>
              <DocumentRow url={url} filename={fileNameFromUrl(url) || `Document ${i + 1}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface BookingManagementViewProps {
  roleView?: BookingRoleView
}

// Reads the ?booking=<id> deep-link (set by a notification tap) and opens that
// booking's detail once. Isolated so useSearchParams sits under its own Suspense
// boundary, as this view has several role-specific page entry points.
function BookingDeepLink({ onFocus }: { onFocus: (id: string) => void }) {
  const searchParams = useSearchParams()
  const focusBookingId = searchParams.get('booking')
  const autoOpenedRef = useRef<string | null>(null)
  useEffect(() => {
    if (focusBookingId && autoOpenedRef.current !== focusBookingId) {
      autoOpenedRef.current = focusBookingId
      onFocus(focusBookingId)
    }
  }, [focusBookingId, onFocus])
  return null
}

export default function BookingManagementView({ roleView = 'admin' }: BookingManagementViewProps = {}) {
  // 10 rows on phones, 20 from tablet up (lib/hooks/useTablePageSize).
  const PAGE_SIZE = useTablePageSize()
  const forcedStatus = ROLE_FORCED_STATUS[roleView]
  const hidePending  = !!ROLE_HIDE_PENDING[roleView]

  const actsAsGm    = roleView === 'general_manager'
  const [rawBookings, setRawBookings] = useState<Record<string, unknown>[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError]     = useState<string | null>(null)
  const [listMeta, setListMeta]       = useState<{
    total: number
    totalPages: number
    statusCounts: Record<string, number>
  } | null>(null)

  // Booking-management tier for this user (full access in the admin shell unless
  // restricted). Write controls below are shown DISABLED when the user can't edit.
  const { canEdit } = useModuleAccess()

  const [search, setSearch]               = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter]   = useState<string>('all')
  const [page, setPage]                   = useState(0)

  const [selectedId, setSelectedId]       = useState<string | null>(null)
  // For async callbacks: is this booking still the one open when they land?
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId
  const [detail, setDetail]               = useState<BookingDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError]     = useState<string | null>(null)

  const [pendingStatus, setPendingStatus] = useState(false)
  const [destBusyId, setDestBusyId]       = useState<string | null>(null)

  const [deleteAskId, setDeleteAskId]     = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy]       = useState(false)
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [rejectModalOpen, setRejectModalOpen]   = useState(false)
  const [pendingReject, setPendingReject]       = useState(false)

  const [drivers, setDrivers]             = useState<DriverUser[]>([])
  const [trucks, setTrucks]               = useState<TruckType[]>([])
  const [allAssignments, setAllAssignments] = useState<AssignmentRecord[]>([])
  const [assignDriverId, setAssignDriverId] = useState<string>('')
  // Optional second company driver ('' for none).
  const [assignSecondDriverId, setAssignSecondDriverId] = useState<string>('')

  // Picking the second driver as the main one (directly, or through a vehicle's
  // usual driver) leaves no second driver rather than the same person twice.
  useEffect(() => {
    if (assignSecondDriverId && assignSecondDriverId === assignDriverId) setAssignSecondDriverId('')
  }, [assignDriverId, assignSecondDriverId])
  const [assignTruckId, setAssignTruckId]   = useState<string>('')
  // Optional helper on a short route, by name ('' for none).
  const [assignHelperName, setAssignHelperName] = useState<string>('')
  // The open booking's road distance. Read when the crew pop-up opens (cached
  // server-side), since it decides second driver vs helper.
  const [routeDistance, setRouteDistance]   = useState<RouteDistance | null>(null)
  const [routeLoading, setRouteLoading]     = useState(false)
  const [assignBusy, setAssignBusy]         = useState(false)
  // Assigning (or changing) the crew asks Yes / No before it saves.
  const [confirmAssign, setConfirmAssign]   = useState(false)
  // The "Choose vehicle and driver" pop-up is open. Closed on a successful
  // assign; cancelling it puts back what is on the booking.
  const [assignEditMode, setAssignEditMode] = useState(false)
  // Bumped to remount TripPlanner when the booking changed under us.
  const [plannerTick, setPlannerTick]       = useState(0)

  // Vendor-supplied crew: a registered vendor driver plus a typed vehicle,
  // snapshotted onto the delivery.
  const [assignVendorMode, setAssignVendorMode] = useState(false)
  const [vendorForm, setVendorForm]             = useState<VendorAssignForm>(emptyVendorForm)
  const [vendorDrivers, setVendorDrivers]       = useState<VendorDriverUser[]>([])
  const [vendorDriversLoading, setVendorDriversLoading] = useState(false)

  // Read fresh each time the vendor picker is opened, so a driver just added in
  // User Management (or one whose access was just revoked) is reflected.
  useEffect(() => {
    if (!assignEditMode || !assignVendorMode) return
    let cancelled = false
    setVendorDriversLoading(true)
    externalDriverService.list()
      .then((rows) => { if (!cancelled) setVendorDrivers(rows) })
      .catch((e) => {
        if (!cancelled) appToast.error(getApiErrorMessage(e, 'Could not load vendor drivers.'), { action: 'vendor-drivers' })
      })
      .finally(() => { if (!cancelled) setVendorDriversLoading(false) })
    return () => { cancelled = true }
  }, [assignEditMode, assignVendorMode])

  const [committedAssignment, setCommittedAssignment] = useState<{
    driverId: string
    truckId: string
    secondDriverId?: string
    helperName?: string
  }>({ driverId: '', truckId: '' })

  // Measured each time the pop-up opens: a stop may have moved since.
  useEffect(() => {
    if (!assignEditMode || !selectedId) return
    let cancelled = false
    setRouteLoading(true)
    setRouteDistance(null)
    assignmentService.getRouteDistance(selectedId)
      .then((r) => { if (!cancelled) setRouteDistance(r) })
      .catch(() => { if (!cancelled) setRouteDistance(null) })
      .finally(() => { if (!cancelled) setRouteLoading(false) })
    return () => { cancelled = true }
  }, [assignEditMode, selectedId])

  useEffect(() => {
    void Promise.all([
      adminFetchTrucks().then(setTrucks).catch(() => setTrucks([])),
      assignmentService.getAll().then(setAllAssignments).catch(() => setAllAssignments([])),
    ])
  }, [])

  // Which drivers can be crewed depends on the day the booking runs — each
  // driver ticks the days they can work, and those days are the whole of their
  // opt-in. So the roster is re-read per booking rather than fetched once: a
  // single list cannot be right for two bookings on different days.
  const scheduleDay = detail?.schedule_date?.slice(0, 10) ?? null

  const reloadAssignableDrivers = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!scheduleDay) { setDrivers([]); return }
      try {
        const rows = await driverService.getAssignable(
          scheduleDay,
          [committedAssignment.driverId, committedAssignment.secondDriverId],
        )
        if (!signal?.cancelled) setDrivers(rows)
      } catch {
        if (!signal?.cancelled) setDrivers([])
      }
    },
    [scheduleDay, committedAssignment.driverId, committedAssignment.secondDriverId],
  )

  useEffect(() => {
    const signal = { cancelled: false }
    void reloadAssignableDrivers(signal)
    return () => { signal.cancelled = true }
  }, [reloadAssignableDrivers])

  // A driver ticking a day changes who operations may pick, and the operator is
  // usually already sitting on the booking when it happens. The driver app
  // pushes on `fleet:availability`; the signal only says "the pool moved", so we
  // re-ask the API rather than patching the list from the payload — the server
  // also applies the status and unreturned-vehicle gates, which this component
  // has no way to evaluate.
  useEffect(() => {
    if (!scheduleDay) return

    const channel = supabase
      .channel('fleet:availability')
      .on('broadcast', { event: 'driver_availability_changed' }, (msg) => {
        // A write only ever rewrites one month, so a booking scheduled outside
        // it cannot have been affected.
        const month = (msg.payload as { month?: string })?.month
        if (month && month !== scheduleDay.slice(0, 7)) return
        void reloadAssignableDrivers()
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [scheduleDay, reloadAssignableDrivers])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(t)
  }, [search])

  const [dateRange, setDateRange] = useState<DateRange | null>(null)

  const loadPage = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setListLoading(true)
      setListError(null)
      const res = await bookingService.fetchBookingsAdminPaginated({
        page:   page + 1,
        limit:  PAGE_SIZE,
        status: forcedStatus ?? statusFilter,
        search: debouncedSearch,
        dateFrom: dateRange?.from,
        dateTo:   dateRange?.to,
      })
      setRawBookings(res.rows)
      setListMeta({
        total:        res.meta.total,
        totalPages:   res.meta.totalPages,
        statusCounts: res.meta.statusCounts,
      })
      if (res.meta.totalPages >= 1 && page > res.meta.totalPages - 1) {
        setPage(res.meta.totalPages - 1)
      }
    } catch (e) {
      if (!quiet) setListError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    } finally {
      if (!quiet) setListLoading(false)
    }
  }, [page, statusFilter, debouncedSearch, dateRange, PAGE_SIZE])

  useEffect(() => { void loadPage() }, [loadPage])

  // Live: the list and the crew pickers follow bookings and vehicles as they
  // change. The OPEN booking is deliberately not reloaded here — someone may be
  // mid-edit; its record lock's onStale already handles a change underneath.
  useLiveTable(['live:bookings'], () => {
    void loadPage(true)
    assignmentService.getAll().then(setAllAssignments).catch(() => {})
    // The exceptions are what the DRIVER does to the booking open here, which
    // decides what the office may do with it: pressing Start Navigation ends
    // re-assigning (a picker left open must not stay offering it), and pausing
    // or resuming opens and closes replacing the crew. Re-read it when either
    // moved, and say why the picker closed.
    const openId = selectedId
    const live   = detail && ['approved', 'assigned', 'in_transit'].includes(String(detail.status))
    if (openId && detail && live) {
      const wasStatus = detail.status
      const wasPaused = (detail as { paused_at?: string | null }).paused_at ?? null
      bookingService.getBookingById(openId).then((b) => {
        if (selectedIdRef.current !== openId) return
        const now = b as BookingDetail & { paused_at?: string | null }
        if (now?.status === wasStatus && (now?.paused_at ?? null) === wasPaused) return
        void refreshDetail(openId)
        if (now?.status === 'in_transit' && wasStatus !== 'in_transit') {
          appToast.info('The driver has started this delivery. The driver and vehicle can no longer be changed.', {
            action: 'assign', entityId: openId,
          })
        }
      }).catch(() => {})
    }
  })
  useLiveTable(['live:trucks'], () => {
    adminFetchTrucks().then(setTrucks).catch(() => {})
    // A vehicle's status is what flags a booking whose vehicle was pulled.
    assignmentService.getAll().then(setAllAssignments).catch(() => {})
  })

  const listRows  = useMemo(() => {
    const rows = toRows(rawBookings)
    return hidePending ? rows.filter((r) => normalizeBookingStatus(r.status) !== 'pending') : rows
  }, [rawBookings, hidePending])
  const pageCount = Math.max(1, listMeta?.totalPages ?? 1)
  const pageSafe  = Math.min(page, pageCount - 1)
  const totalRows = listMeta?.total ?? 0

  // Crew tied up on another booking that is still live. This reads the BOOKING's
  // status, not the delivery's: the delivery row is a second copy of the same
  // fact and used to be left behind when a booking finished, which quietly held
  // a free driver out of every dropdown with nothing on screen to explain it.
  const busyElsewhere = useMemo(
    () =>
      allAssignments.filter((a) => {
        if (a.booking_id === selectedId) return false
        const bookingStatus = a.bookings?.status
        if (!bookingStatus) return false
        if (bookingStatus === 'cancelled') return false
        // A completed booking still holds its crew until the vehicle is
        // confirmed back in the 8338 lot — the cargo being off the truck does
        // not put the truck in the yard. The server refuses these assignments
        // either way; this keeps the dropdowns from offering them first.
        if (bookingStatus === 'delivered' || bookingStatus === 'completed') return !a.bookings?.fleet_return_at
        return true
      }),
    [allAssignments, selectedId],
  )

  const busyDriverIds = useMemo(
    () => new Set(
      busyElsewhere.flatMap((a) => [a.driver_id, a.second_driver?.driver_id]).filter(Boolean) as string[],
    ),
    [busyElsewhere],
  )

  // Bookings whose vehicle was taken out of service after it was assigned.
  const pulledByBooking = useMemo(() => {
    const byId = new Map<string, { plate: string; status: string }>()
    for (const a of allAssignments) {
      const pulled = outOfServiceVehicle(a)
      if (pulled) byId.set(a.booking_id, pulled)
    }
    return byId
  }, [allAssignments])

  const busyTruckIds = useMemo(
    () => new Set(busyElsewhere.map((a) => a.truck_id).filter(Boolean) as string[]),
    [busyElsewhere],
  )

  // `drivers` is already scoped to this booking's day by the server — it holds
  // only those who ticked it on their calendar and are not otherwise stopped.
  // All that is left is to drop anyone tied up on another live booking.
  const availableDrivers = useMemo(
    () =>
      drivers.filter((dr) => {
        const id = dr.drivers?.driver_id ?? dr.user_id
        if (id === assignDriverId || id === assignSecondDriverId) return true
        return !busyDriverIds.has(id)
      }),
    [drivers, busyDriverIds, assignDriverId, assignSecondDriverId],
  )

  // Only vehicles whose most recent BLOWBAGETS inspection passed can be picked.
  // The vehicle already on this booking stays listed for the same reason.
  const availableTrucks = useMemo(
    () =>
      trucks.filter((t) => {
        // Taken out of service: gone from the choices, even the one already on
        // this booking — the server refuses it, and keeping its card would
        // invite a save that cannot succeed. Live: the Fleet Manager's change
        // arrives on live:trucks and drops it from an open pop-up.
        if (isOutOfServiceStatus(t.status)) return false
        if (t.truck_id === assignTruckId) return true
        if (busyTruckIds.has(t.truck_id)) return false
        // BLOWBAGETS current, routine service not overdue, no return odometer
        // owed and registration valid on the delivery day — the same gates the
        // server's assertTruckAssignable applies.
        return isAssignable(t, scheduleDay)
      }),
    [trucks, busyTruckIds, assignTruckId, scheduleDay],
  )

  /**
   * Driver and vehicle, kept in step with the fleet's pairing.
   *
   * The decision itself lives in lib/crew-pairing so it can be tested without
   * rendering this screen; everything here is wiring. `pairFilled` travels with
   * the selection and records which field the SYSTEM filled — see that module
   * for why that distinction is the whole point.
   */
  const [pairFilled, setPairFilled] = useState<PairFilled>(null)

  // The selected vehicle was just pulled: clear the pick, so the pop-up asks for
  // another one instead of holding a choice it no longer shows.
  useEffect(() => {
    if (!assignTruckId) return
    const picked = trucks.find((t) => t.truck_id === assignTruckId)
    if (picked && isOutOfServiceStatus(picked.status)) {
      setAssignTruckId('')
      setPairFilled(null)
    }
  }, [trucks, assignTruckId])

  const pairedDriverOf = useCallback(
    (truckId: string) => trucks.find((t) => t.truck_id === truckId)?.assigned_driver_id ?? null,
    [trucks],
  )

  const pairedTruckOf = useCallback(
    (driverId: string) => trucks.find((t) => t.assigned_driver_id === driverId)?.truck_id ?? null,
    [trucks],
  )

  // "Pickable" is exactly "in the dropdown", which is already filtered by the
  // calendar, the fleet return and BLOWBAGETS.
  const truckPickable  = useCallback(
    (id: string) => availableTrucks.some((t) => t.truck_id === id),
    [availableTrucks],
  )
  const driverPickable = useCallback(
    (id: string) => availableDrivers.some((d) => (d.drivers?.driver_id ?? d.user_id) === id),
    [availableDrivers],
  )

  const applyCrew = useCallback((next: CrewSelection) => {
    setAssignDriverId(next.driverId)
    setAssignTruckId(next.truckId)
    setPairFilled(next.filled)
  }, [])

  const handleDriverChange = useCallback((driverId: string) => {
    applyCrew(pickDriver(
      { driverId: assignDriverId, truckId: assignTruckId, filled: pairFilled },
      driverId, pairedTruckOf, truckPickable,
    ))
  }, [applyCrew, assignDriverId, assignTruckId, pairFilled, pairedTruckOf, truckPickable])

  const handleTruckChange = useCallback((truckId: string) => {
    applyCrew(pickTruck(
      { driverId: assignDriverId, truckId: assignTruckId, filled: pairFilled },
      truckId, pairedDriverOf, driverPickable,
    ))
  }, [applyCrew, assignDriverId, assignTruckId, pairFilled, pairedDriverOf, driverPickable])

  const restoreAssignment = useCallback((detail: BookingDetail, assignment?: AssignmentRecord | { driver_id?: string | null; truck_id?: string | null }) => {
    const record = assignment as AssignmentRecord | undefined
    const isVendor = record?.is_vendor_supplied === true
    setAssignVendorMode(isVendor)
    setVendorForm(isVendor ? {
      vendor_driver_user_id: record?.vendor_driver_user_id ?? '',
      second_vendor_driver_user_id: record?.second_driver?.users?.user_id ?? '',
      vendor_vehicle_plate:  formatPlateNumber(record?.vendor_vehicle_plate ?? ''),
      vendor_vehicle_type:   record?.vendor_vehicle_type   ?? '',
      vendor_driver_name:    record?.vendor_driver_name    ?? '',
      vendor_name:           record?.vendor_name           ?? '',
    } : emptyVendorForm)

    const fallback = getPrefillFromBookingDetail(detail, trucks)
    const ids = {
      driverId: (isVendor ? '' : assignment?.driver_id) ?? fallback.driverId,
      truckId:  (isVendor ? '' : assignment?.truck_id)  ?? fallback.truckId,
      secondDriverId: isVendor ? '' : record?.second_driver?.driver_id ?? '',
      helperName: record?.helper_name ?? '',
    }
    setAssignDriverId(ids.driverId)
    setAssignSecondDriverId(ids.secondDriverId)
    setAssignHelperName(ids.helperName)
    setAssignTruckId(ids.truckId)
    // These came off the booking, not out of the pairing, so nothing here may be
    // moved or cleared by a later change to the other field.
    setPairFilled(null)
    setCommittedAssignment(ids)
  }, [trucks])

  const openDetail = useCallback(async (bookingId: string) => {
    setSelectedId(bookingId)
    setDetail(null)
    setDetailError(null)
    setDeleteAskId(null)
    setApproveModalOpen(false)
    setRejectModalOpen(false)
    setAssignDriverId('')
    setAssignSecondDriverId('')
    setAssignHelperName('')
    setAssignTruckId('')
    setPairFilled(null)
    setAssignVendorMode(false)
    setVendorForm(emptyVendorForm)
    setAssignEditMode(false)
    try {
      setDetailLoading(true)
      const [bookingResp, assignmentResp] = await Promise.allSettled([
        bookingService.getBookingById(bookingId),
        assignmentService.getByBookingId(bookingId),
      ])

      if (bookingResp.status !== 'fulfilled') throw bookingResp.reason

      const d = bookingResp.value as BookingDetail
      setDetail(d)

      if (assignmentResp.status === 'fulfilled') {
        restoreAssignment(d, assignmentResp.value)
      } else {
        restoreAssignment(d)
      }
    } catch (e) {
      setDetailError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    } finally {
      setDetailLoading(false)
    }
  }, [restoreAssignment])

  /**
   * Re-read the open booking in place — for when someone else changed it. Unlike
   * openDetail this keeps the panel up, so the edit lock is not dropped and
   * re-taken around the reload.
   */
  const refreshDetail = useCallback(async (bookingId: string) => {
    const [bookingResp, assignmentResp] = await Promise.allSettled([
      bookingService.getBookingById(bookingId),
      assignmentService.getByBookingId(bookingId),
    ])
    if (bookingResp.status !== 'fulfilled') return
    const d = bookingResp.value as BookingDetail
    setDetail(d)
    setAssignEditMode(false)
    restoreAssignment(d, assignmentResp.status === 'fulfilled' ? assignmentResp.value : undefined)
    setPlannerTick((n) => n + 1)
  }, [restoreAssignment])

  const closeDetail = useCallback(() => {
    setSelectedId(null)
    setDetail(null)
    setDetailError(null)
    setDeleteAskId(null)
    setApproveModalOpen(false)
    setRejectModalOpen(false)
    setAssignDriverId('')
    setAssignSecondDriverId('')
    setAssignHelperName('')
    setAssignTruckId('')
    setPairFilled(null)
    setAssignVendorMode(false)
    setVendorForm(emptyVendorForm)
    setAssignEditMode(false)
    setCommittedAssignment({ driverId: '', truckId: '' })
  }, [])

  const mergeListRow = useCallback((bookingId: string, patch: Partial<ListRow>) => {
    setRawBookings((prev) =>
      prev.map((b) => String(b.booking_id) !== bookingId ? b : { ...b, ...patch }),
    )
  }, [])

  const handleDestStatus = async (destinationId: string, status: DestinationDeliveryStatus) => {
    setDestBusyId(destinationId)
    try {
      const deliveredAt = status === 'delivered' ? nowDate().toISOString() : undefined
      await bookingService.updateDestinationStatus(destinationId, status, deliveredAt)
      if (selectedId) await openDetail(selectedId)
      await loadPage()
      appToast.success('Stop updated.', { action: 'dest-status', entityId: destinationId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'dest-status', entityId: destinationId })
    } finally {
      setDestBusyId(null)
    }
  }

  const handleDeleteDest = async () => {
    if (!deleteAskId) return
    setDeleteBusy(true)
    try {
      await bookingService.deleteDestinationAdmin(deleteAskId)
      setDeleteAskId(null)
      if (selectedId) await openDetail(selectedId)
      await loadPage()
      appToast.success('Stop removed.', { action: 'dest-delete', entityId: deleteAskId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'dest-delete', entityId: deleteAskId ?? '' })
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedId) return
    if (assignVendorMode) {
      if (!vendorForm.vendor_driver_user_id) return
      const plateMsg = plateError(vendorForm.vendor_vehicle_plate)
      if (plateMsg) { appToast.error(plateMsg); return }
    } else if (!assignDriverId || !assignTruckId) {
      return
    }
    // Only what the route allows goes out: a short route sends no second driver,
    // a long one no helper, so a value left in a hidden field is never saved.
    const rule       = crewRule(routeDistance)
    const keepSecond = rule.second !== 'hidden'
    const helperName = rule.helper ? assignHelperName.trim() || null : null
    setAssignBusy(true)
    try {
      const result = assignVendorMode
        ? await assignmentService.assignBooking(selectedId, {
            is_vendor_supplied:    true,
            vendor_driver_user_id: vendorForm.vendor_driver_user_id,
            vendor_vehicle_plate:  vendorForm.vendor_vehicle_plate.trim(),
            vendor_vehicle_type:   vendorForm.vendor_vehicle_type.trim() || undefined,
            second_vendor_driver_user_id: keepSecond ? vendorForm.second_vendor_driver_user_id || null : null,
            helper_name:           helperName,
          })
        : await assignmentService.assignBooking(selectedId, {
            driver_id: assignDriverId,
            truck_id:  assignTruckId,
            second_driver_id: keepSecond ? assignSecondDriverId || null : null,
            helper_name:      helperName,
          })
      setCommittedAssignment({
        driverId:       assignDriverId,
        truckId:        assignTruckId,
        secondDriverId: keepSecond ? assignSecondDriverId : '',
        helperName:     helperName ?? '',
      })
      setAssignEditMode(false)
      await openDetail(selectedId)
      await loadPage()
      assignmentService.getAll().then(setAllAssignments).catch(() => null)
      // The assignment stands either way — operations may know something the
      // recorded figures do not — but an overloaded vehicle must not go by
      // silently. It is on the audit log too, not just this toast.
      const warning = result?.capacity_warning
      if (warning?.reasons?.length) {
        appToast.warn(
          `Assigned, but this vehicle may not fit the load. ${warning.reasons[0]}`,
          { action: 'assign', entityId: selectedId },
        )
      } else {
        appToast.success('Driver and vehicle assigned.', { action: 'assign', entityId: selectedId })
      }
    } catch (e) {
      const message = getApiErrorMessage(e, 'Request failed. Please try again.')
      appToast.error(message, { action: 'assign', entityId: selectedId })
      // The driver started first: show the booking as it now stands.
      if (/already started/i.test(message)) void refreshDetail(selectedId)
    } finally {
      setAssignBusy(false)
    }
  }

  const handleApprove = async (remarks: string) => {
    if (!selectedId || !detail) return
    setApproveModalOpen(false)
    setPendingStatus(true)
    try {
      await bookingService.updateBookingStatusAdmin(selectedId, 'approved', undefined, remarks)
      setDetail({ ...detail, status: 'approved' })
      mergeListRow(selectedId, { status: 'approved' })
      appToast.success('Booking approved.', { action: 'booking-status', entityId: selectedId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'booking-status', entityId: selectedId })
    } finally {
      setPendingStatus(false)
    }
  }

  const handleReject = async (remarks: string) => {
    if (!selectedId || !detail) return
    setRejectModalOpen(false)
    setPendingReject(true)
    try {
      // The administrator's own decision: their remarks are stored on the
      // booking and sent to the client, and the record shows they made the call
      // (not the GM, who may never have seen it).
      await bookingService.updateBookingStatusAdmin(selectedId, 'cancelled', remarks)
      setDetail({ ...detail, status: 'cancelled' })
      mergeListRow(selectedId, { status: 'cancelled' })
      appToast.success('Booking rejected.', { action: 'booking-status', entityId: selectedId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'booking-status', entityId: selectedId })
    } finally {
      setPendingReject(false)
    }
  }

  const refreshAfterAction = useCallback(async () => {
    if (selectedId) await openDetail(selectedId)
    await loadPage()
  }, [selectedId, openDetail, loadPage])

  // The GM decision — the single approval gate. Approving routes the booking to
  // operations; rejecting cancels it and sends the remarks to the client. The
  const handleGmReview = async (decision: 'approved' | 'rejected', remarks: string) => {
    if (!selectedId) return
    if (decision === 'approved') setPendingStatus(true); else setPendingReject(true)
    try {
      await bookingService.gmReview(selectedId, decision === 'approved'
        ? { gm_status: decision, approval_remarks: remarks }
        : { gm_status: decision, rejection_reason: remarks })
      await refreshAfterAction()
      appToast.success(decision === 'approved' ? 'Approved — sent to the Operations Manager.' : 'Booking rejected.', { action: 'gm-review', entityId: selectedId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'gm-review', entityId: selectedId })
    } finally {
      setPendingStatus(false); setPendingReject(false)
    }
  }

  // Dispatch the generic Approve/Reject modals to the right stage. Both run from
  // a click, so `decidesGmStage` below is already initialised by then.
  const confirmApprove = (remarks: string) => {
    setApproveModalOpen(false)
    if (decidesGmStage) return void handleGmReview('approved', remarks)
    return void handleApprove(remarks)
  }
  const confirmReject = (remarks: string) => {
    setRejectModalOpen(false)
    if (decidesGmStage) return void handleGmReview('rejected', remarks)
    return void handleReject(remarks)
  }

  const statusCounts = listMeta?.statusCounts ?? { all: 0 }

  const selectClass =
    'w-full rounded-lg border border-white/10 bg-[#1a1a1a] text-sm text-white px-3 py-2.5 outline-none focus:border-[var(--color-cyan)]/50 disabled:opacity-50'

  const deleteAskAddress = useMemo(() => {
    if (!deleteAskId || !detail) return ''
    return detail.booking_destinations?.find((d) => d.destination_id === deleteAskId)?.address ?? ''
  }, [deleteAskId, detail])

  const docCount = ((detail as DetailWithExtra | null)?.transaction_documents?.length) ?? 0
  const d        = detail as DetailWithExtra | null
  const cargoItems: CargoItem[] = d?.booking_cargo_items ?? []
  const cargoPieces = cargoItems.reduce((n, i) => n + (i.quantity ?? 0), 0)
  const sortedStops = (detail?.booking_destinations ?? [])
    .slice()
    .sort((a, b) => a.sequence_order - b.sequence_order)
  const stopCount = sortedStops.length
  // "Cargo 2 (drop off 1)": each line names the stop it goes to, numbered as listed.
  const stopNumberById = new Map(sortedStops.map((s, i) => [s.destination_id, i + 1]))

  /**
   * Whether this user's Approve/Reject acts on the GM stage specifically.
   *
   * The administrator deliberately does NOT: in a small operation they approve
   * or reject a booking on their own authority, without the GM being involved at
   * all. Routing them through the GM endpoint would stamp `gm_status` and tell
   * the client "rejected by the general manager" for a decision the GM never
   * made, so the admin keeps the status endpoint — which now carries their
   * remarks and records them as the decision-maker.
   */
  const decidesGmStage = actsAsGm

  // Approve/reject is shown to whoever holds the GM authority on a booking that
  // is still awaiting a decision, and to admins on the top-level status control.
  const showStageActions = !!detail && (
    (roleView === 'admin' && normalizeBookingStatus(detail.status) === 'pending') ||
    (actsAsGm && d?.gm_status === 'pending')
  )
  const showAssignment = !!detail &&
    (roleView === 'admin' || roleView === 'operations_manager') &&
    (normalizeBookingStatus(detail.status) === 'approved' || normalizeBookingStatus(detail.status) === 'assigned')

  /**
   * The trip planner appears once a vehicle is actually on the booking, and
   * stays visible for the rest of the job.
   *
   * Not on `approved`: the whole question is how many times THIS truck has to go
   * back and forth, which cannot be answered before one is chosen. And not
   * hidden again once the run starts — the panel is where operations reads the
   * per-run proof of loading, which only exists after the driver is moving.
   */
  // The assigned vehicle's limits, for the planner's per-trip warning.
  const plannerCapacity = useMemo(() => {
    if (!detail) return null
    const m = trucks.find((t) => t.truck_id === getAssignedTruckId(detail, trucks))?.truck_model
    return m ? { maxWeightKg: m.max_weight_kg ?? 0, maxVolumeCbm: m.max_volume_cbm ?? 0 } : null
  }, [detail, trucks])

  const showTripPlanner = !!detail &&
    (roleView === 'admin' || roleView === 'operations_manager') &&
    ['assigned', 'in_transit', 'delivered', 'completed'].includes(normalizeBookingStatus(detail.status))

  /**
   * One person edits a booking at a time. Operations and the Company Admin can
   * both crew it, the GM and the admin can both decide it — whoever opens it
   * first holds the lock, and everyone else sees it read-only with their name.
   * The API refuses colliding writes (423) regardless; this is what keeps
   * people from getting that far.
   *
   * Only for people who could change something here, and only while there is
   * something left to change: a read-only viewer or a finished booking must not
   * lock anybody out.
   */
  const bookingOpen = !!detail &&
    !['delivered', 'completed', 'cancelled'].includes(String(detail.status ?? '').toLowerCase())
  const mayEditBooking = roleView !== 'fleet_manager' && canEdit
  const bookingLock = useRecordLock({
    type:    'booking',
    id:      detail?.booking_id ?? null,
    enabled: bookingOpen && mayEditBooking && !detailLoading,
    onStale: () => {
      if (!selectedId) return
      void refreshDetail(selectedId)
      appToast.info('This booking was just updated by someone else — showing the latest.', {
        action: 'booking-stale', entityId: selectedId,
      })
    },
  })
  const bookingReadOnly = bookingLock.readOnly
  // The crew record on the open booking (vendor snapshot, helper), for the replacement pop-up.
  const currentAssignment = detail ? allAssignments.find((a) => a.booking_id === detail.booking_id) : undefined
  // Badges are informational, so read-only viewers see them too.
  const bookingLocks    = useRecordLocks('booking')
  const clockNow        = useMinuteClock()
  const showAfterHours  = (status: string | null | undefined, createdAt: string | null | undefined) =>
    normalizeBookingStatus(status ?? '') === 'pending' && submittedAfterCloseToday(createdAt, clockNow)

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden ff-sc bg-[var(--color-bg)]">

      {/* Notification deep-link: opens the booking named in ?booking=<id>. */}
      <Suspense fallback={null}>
        <BookingDeepLink onFocus={openDetail} />
      </Suspense>

      <RemarksModal
        open={approveModalOpen}
        title="Approve this booking?"
        description={
          (docCount > 0
            ? `Please confirm you have reviewed all ${docCount} transaction document${docCount > 1 ? 's' : ''} submitted by the client before proceeding.`
            : 'Please confirm you have reviewed all client-submitted documents and details before proceeding.')
          + (decidesGmStage
            ? ' The Operations Manager will then be asked to select a vehicle and driver. This cannot be undone.'
            : ' Approving cannot be undone.')
        }
        // Required on both paths (General Manager and Company Administrator).
        // The client sees these in their transaction history, and staff see
        // them on the Approvals card of the admin transaction history.
        remarksLabel="Remarks"
        remarksPlaceholder="e.g. Documents complete, schedule confirmed with the client…"
        tone="approve"
        confirmLabel="Approve"
        cancelLabel="Go back"
        onConfirm={confirmApprove}
        onCancel={() => setApproveModalOpen(false)}
        disableBackdropClose={pendingStatus}
        busy={pendingStatus}
      />

      <RemarksModal
        open={rejectModalOpen}
        title="Reject this booking?"
        // Remarks are the point of a rejection on either path: the GM endpoint
        // and the admin status endpoint both store them and send them on to the
        // client with the rejection notification.
        description="This booking will be cancelled and the client notified. Your remarks are sent to them, so explain why it was not approved."
        remarksLabel="Remarks — why this booking was not approved"
        remarksPlaceholder="e.g. Incomplete documents, route not serviceable, margin below threshold…"
        confirmLabel="Reject"
        cancelLabel="Go back"
        onConfirm={confirmReject}
        onCancel={() => setRejectModalOpen(false)}
        disableBackdropClose={pendingReject}
        busy={pendingReject}
      />

      <ReusableModal
        open={confirmAssign}
        title={committedAssignment.driverId ? 'Change the driver and vehicle?' : 'Assign this driver and vehicle?'}
        description={
          committedAssignment.driverId
            ? 'The booking will move to the crew you picked, and the drivers will be notified.'
            : 'The crew you picked will be assigned to this booking, and the drivers will be notified.'
        }
        confirmLabel="Yes"
        cancelLabel="No"
        zClassName="z-[80]"
        onConfirm={() => { setConfirmAssign(false); void handleAssign() }}
        onCancel={() => setConfirmAssign(false)}
      />

      <ReusableModal
        open={!!deleteAskId}
        title="Remove this stop?"
        description={
          deleteAskAddress
            ? `"${deleteAskAddress}" will be permanently removed from the booking. This cannot be undone.`
            : 'This stop will be permanently removed from the booking. This cannot be undone.'
        }
        confirmLabel={deleteBusy ? 'Removing…' : 'Remove'}
        cancelLabel="Cancel"
        onConfirm={() => void handleDeleteDest()}
        onCancel={() => !deleteBusy && setDeleteAskId(null)}
        disableBackdropClose={deleteBusy}
      />

      <div className="flex flex-[1_0_auto] lg:flex-1 lg:min-h-0 lg:overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 lg:min-h-0 p-3 lg:p-4 3xl:p-[34px] 3xl:pl-9 gap-3 3xl:gap-[14px] bg-[#0a0a0a]">

          {/* Untitled UI's table card from the "No vendors found" table, as in User
              Management: the header (title + count), then its filter row with the
              status tabs on the left (a dropdown on phones) and search + Refresh
              on the right. The General Manager and Fleet Manager views have one
              fixed status, so no tabs. */}
          <TableCard.Root className="flex-[1_0_auto] lg:flex-1 lg:min-h-0 flex flex-col">
            <TableCard.Header
              className="shrink-0"
              title="Bookings"
            />
            <FilterBar
              layout="split"
              search={{ value: search, onChange: (v) => { setSearch(v); setPage(0) }, placeholder: 'Search' }}
              // Untitled UI's "Select dates": the schedule-date window, filtered on the server.
              dateRange={{ value: dateRange, onChange: (r) => { setDateRange(r); setPage(0) } }}
              actions={<RefreshButton iconOnly onClick={() => void loadPage()} />}
              leading={!forcedStatus && (
                <TabsMinimal
                  label="Booking status"
                  items={(['all', ...BOOKING_STATUSES.filter((s) => !hidePending || s !== 'pending')]).map((key) => ({
                    id: key,
                    label: `${key === 'all' ? (hidePending ? 'All (active)' : 'All') : fmtStatus(key)} (${key === 'all' ? statusCounts.all : statusCounts[key] ?? 0})`,
                  }))}
                  selectedKey={statusFilter}
                  onSelectionChange={(key) => { setStatusFilter(key); setPage(0) }}
                />
              )}
            />

            {listLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
                <div className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
                <p className="text-sm text-white/45">Loading bookings…</p>
              </div>
            ) : listError ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-red-400 text-sm">{listError}</p>
                <button type="button" onClick={() => void loadPage()} className="text-[var(--color-cyan)] text-sm font-semibold">Try again</button>
              </div>
            ) : listRows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-sm text-white/45 py-12">
                No bookings match your filters.
                <ClearFiltersLink
                  show={!!search || statusFilter !== 'all' || !!dateRange}
                  onClear={() => { setSearch(''); setStatusFilter('all'); setDateRange(null); setPage(0) }}
                />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto lg:overflow-auto flex-[1_0_auto] lg:flex-1 lg:min-h-0">
                  <table className="w-full text-left border-collapse">
                    {/* Headers keep the small caps face; the data rows are regular Alegreya Sans. */}
                    <thead className="sticky top-0 z-[1] bg-[#181717]">
                      <tr className="text-[13px] 3xl:text-[16px] text-[#818181] [&>th]:border-b-[0.5px] [&>th]:border-[#818181] [&>th]:font-bold [&>th]:px-4 3xl:[&>th]:px-6 [&>th]:py-2.5 3xl:[&>th]:py-[13px] [&>th]:whitespace-nowrap">
                        <th>booking</th>
                        <th>status</th>
                        <th>schedule</th>
                        <th className="hidden md:table-cell">client</th>
                        <th>origin</th>
                        <th className="hidden lg:table-cell">vehicle</th>
                        <th>stops</th>
                      </tr>
                    </thead>
                    <tbody className="ff-regular text-[13px] 3xl:text-[16px] text-[#818181]">
                      {listRows.map((r) => {
                        const active = selectedId === r.booking_id
                        const c      = statusColor(r.status)
                        return (
                          <tr
                            key={r.booking_id}
                            role="button"
                            tabIndex={0}
                            onClick={() => void openDetail(r.booking_id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openDetail(r.booking_id) }
                            }}
                            className={`border-b-[0.5px] border-[#818181] cursor-pointer transition-colors 3xl:h-[55px] [&>td]:px-4 3xl:[&>td]:px-6 [&>td]:py-2.5 3xl:[&>td]:py-3 ${
                              active ? 'bg-[#4df9ed]/10' : 'hover:bg-white/[0.03]'
                            }`}
                          >
                            <td className="font-bold max-w-[200px]">
                              <div className="truncate text-[#4df9ed]">{r.display_id}</div>
                              {/* Status-type badges keep the small-caps face. */}
                              <div className="font-[family-name:var(--font-alegreya-sc)]">
                                {showAfterHours(r.status, r.created_at) && <AfterHoursBadge />}
                                {pulledByBooking.get(r.booking_id) && (
                                  <VehiclePulledBadge {...pulledByBooking.get(r.booking_id)!} />
                                )}
                                <RecordLockBadge holder={bookingLocks.get(r.booking_id)} />
                              </div>
                            </td>
                            <td className="font-[family-name:var(--font-alegreya-sc)]">
                              <span
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-[5px] border p-1 text-[12px] 3xl:text-[16px] leading-none"
                                style={{ color: c, borderColor: c, background: `${c}2e` }}
                              >
                                {fmtStatus(r.status)}
                              </span>
                              {r.pause_reason && <PausedBadge reason={r.pause_reason} />}
                              {r.issue_open && <ProblemReportedBadge note={r.issue_note} />}
                              <ResubmittedBadge count={r.resubmissions} />
                            </td>
                            <td className="whitespace-nowrap text-white">{r.schedule_date ?? '—'}</td>
                            <td className="max-w-[180px] 3xl:max-w-[260px] truncate hidden md:table-cell text-white">{r.company ?? '—'}</td>
                            <td className="max-w-[220px] truncate text-white">{r.origin ?? '—'}</td>
                            <td className="hidden lg:table-cell text-white">{r.truck_type_needed ?? '—'}</td>
                            <td className="text-white">{r.stops}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={pageSafe + 1} totalPages={pageCount} total={totalRows} pageSize={PAGE_SIZE} onPageChange={(p) => setPage(p - 1)} />
              </>
            )}
          </TableCard.Root>
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedId && (
            <>
              <motion.button
                type="button"
                aria-label="Close panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[40] bg-black/60 lg:hidden"
                onClick={closeDetail}
              />
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                className="fixed lg:relative z-[50] inset-y-0 right-0 w-full max-w-[455px] shrink-0 border-l border-[#424242] flex flex-col shadow-2xl lg:shadow-none"
                style={{ background: PANEL_BG }}
              >
                <div className="shrink-0 flex items-center justify-between gap-3 pl-4 sm:pl-[26px] pr-2 sm:pr-3 min-h-[59px] border-b border-[#424242]">
                  <span className="text-base font-bold uppercase text-[#818181]">Booking</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {detail && !detailLoading && (
                      <>
                        <ResubmittedBadge className="" count={resubmissionsOf(detail)} />
                        <Tag color={statusColor(detail.status)} size="md">{fmtStatus(detail.status)}</Tag>
                      </>
                    )}
                    <button type="button" onClick={closeDetail} className="p-2 rounded-lg hover:bg-white/5 text-[#818181] hover:text-white transition-colors" aria-label="Close">
                      <X size={19} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pt-[18px] pb-6 space-y-[18px]">
                  {detailLoading && (
                    <div className="flex flex-col items-center justify-center py-16 gap-2">
                      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
                      <p className="text-sm text-white/45">Loading…</p>
                    </div>
                  )}
                  {detailError && !detailLoading && (
                    <p className="text-sm text-red-400 text-center py-8">{detailError}</p>
                  )}
                  {detail && !detailLoading && (
                    <>
                      <RecordLockBanner lock={bookingLock} noun="booking" />

                      {/* Booking info */}
                      <BookingInfoCard
                        reference={bookingRef(detail)}
                        extras={(detail.created_at || hasOpenClientIssue(detail as unknown as Record<string, unknown>)) && (
                          <div className="space-y-1.5">
                            {detail.created_at && (
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[#818181]">
                                <span>Submitted {formatPhDateTime(detail.created_at)}</span>
                                {showAfterHours(detail.status, detail.created_at) && <AfterHoursBadge />}
                              </div>
                            )}
                            {hasOpenClientIssue(detail as unknown as Record<string, unknown>) && (
                              <ProblemReportedBadge className="" note={(detail as { client_issue_note?: string | null }).client_issue_note} />
                            )}
                          </div>
                        )}
                        origin={detail.origin}
                        company={detail.clients?.company_name}
                        date={detail.schedule_date}
                        time={detail.call_time}
                        vehicleType={detail.truck_type_needed}
                        // The assignment card carries the crew where it is shown.
                        driverLine={!showAssignment && detail.driver?.name
                          ? `${detail.driver.name}${detail.driver.truck?.plate_number ? ` · ${detail.driver.truck.plate_number}` : ''}`
                          : null}
                      />

                      {/* Cargo items */}
                      {cargoItems.length > 0 && (
                        <section>
                          <SectionHeading
                            icon={<Boxes size={18} strokeWidth={2} />}
                            right={
                              <span className="text-xs font-bold text-[#818181] whitespace-nowrap">
                                {cargoPieces > 0 ? cargoPieces : cargoItems.length} item{(cargoPieces > 0 ? cargoPieces : cargoItems.length) === 1 ? '' : 's'}
                                <span className="inline-block w-4" />
                                {stopCount} stop{stopCount === 1 ? '' : 's'}
                              </span>
                            }
                          >
                            Cargo Items
                          </SectionHeading>
                          <div className="space-y-3">
                            {cargoItems.map((item, idx) => {
                              const hasDims = item.length_cm && item.width_cm && item.height_cm
                              const dropOff = item.destination_id ? stopNumberById.get(item.destination_id) ?? null : null
                              return (
                                <CargoItemCard
                                  key={item.item_id ?? idx}
                                  index={idx + 1}
                                  dropOff={dropOff}
                                  quantity={item.quantity}
                                  commodity={resolveLabel(item.commodity_id, item.commodity_text, item.commodities)}
                                  product={resolveLabel(item.product_id, item.product_text, item.products)}
                                  shc={item.shc?.name ?? item.shc?.code ?? item.shc_text ?? null}
                                  ashc={item.ashc?.name ?? item.ashc?.code ?? item.ashc_text ?? null}
                                  weight={fmtNum(item.weight_kg, 'KG')}
                                  volume={fmtNum(item.volume_cbm, 'CBM', 4)}
                                  dims={hasDims ? `${item.length_cm} × ${item.width_cm} × ${item.height_cm} cm` : null}
                                  notes={item.notes}
                                />
                              )
                            })}
                          </div>
                        </section>
                      )}

                      {/* Cargo summary */}
                      <section>
                        <SectionHeading icon={<AssetIcon name="cargo-summary" />}>Cargo Summary</SectionHeading>
                        <CargoSummaryTiles
                          weightKg={d?.required_weight_kg ?? null}
                          volumeCbm={d?.required_volume_cbm ?? null}
                          lengthCm={d?.required_length_cm ?? null}
                        />
                        {/* The constraint worth flagging is cargo that must NOT
                            be stacked — it dictates how the truck is loaded.
                            `stackable_required` is the old field, set with the
                            opposite sense and never populated for loose cargo;
                            it is still read so historical bookings keep their
                            note. */}
                        {d?.non_stackable_cargo ? (
                          <p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
                            <Layers size={12} />Contains non-stackable cargo
                          </p>
                        ) : d?.stackable_required ? (
                          <p className="text-xs text-[var(--color-cyan)] mt-2 flex items-center gap-1.5">
                            <Layers size={12} />Stackable pallets included
                          </p>
                        ) : null}
                      </section>

                      {/* Proof of pickup, photographed by the driver at the origin. */}
                      {d?.pickup_proof_photo_url && (
                        <section>
                          <SectionHeading icon={<MapPin size={18} strokeWidth={2} />}>Proof of pickup</SectionHeading>
                          <ProofPhoto
                            url={d.pickup_proof_photo_url}
                            at={d.pickup_proof_at}
                            label="Pickup confirmed by driver"
                          />
                        </section>
                      )}

                      {/* Delivery stops */}
                      <section>
                        <SectionHeading icon={<AssetIcon name="delivery-stops" />}>Delivery Stops</SectionHeading>
                        <ul className="space-y-3">
                          {sortedStops.map((dest) => (
                            <StopCard
                              key={dest.destination_id}
                              address={dest.address}
                              status={dest.status}
                              statuses={DEST_STATUSES}
                              label={fmtStatus}
                            >
                              {/* Proof of delivery, photographed by the driver at this stop. */}
                              {dest.proof_photo_url
                                ? (
                                  <ProofPhoto
                                    url={dest.proof_photo_url}
                                    at={dest.proof_at ?? dest.delivered_at}
                                    label="Proof of delivery"
                                  />
                                )
                                : dest.status === 'delivered' && (
                                  <p className="text-xs text-white/30">No proof photo on file.</p>
                                )}
                            </StopCard>
                          ))}
                        </ul>
                        {sortedStops.length === 0 && (
                          <p className="text-sm text-white/40">No stops on this booking.</p>
                        )}
                      </section>

                      {/* Transaction documents */}
                      <TransactionDocs docs={d?.transaction_documents ?? []} />

                      {/* What the client changed when resubmitting after a rejection,
                          so the approver sees the old values next to the new. */}
                      <ResubmissionChanges key={`rev-${detail.booking_id}`} bookingId={detail.booking_id}
                        resubmissionCount={resubmissionsOf(detail)} />

                      {/* Booking status */}
                      <section className="space-y-3">
                        <SectionHeading
                          icon={<CalendarRange size={18} strokeWidth={2} />}
                          right={<Tag color={statusColor(detail.status)}>{fmtStatus(detail.status)}</Tag>}
                        >
                          Booking Status
                        </SectionHeading>

                        {showStageActions && (
                          <fieldset disabled={bookingReadOnly} className="flex gap-2.5 min-w-0 border-0 p-0 m-0">
                            <button
                              type="button"
                              disabled={pendingStatus || pendingReject}
                              onClick={() => setRejectModalOpen(true)}
                              {...writeAccess(canEdit)}
                              className="flex-1 min-h-[46px] px-3 py-2 rounded-[10px] border text-base font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ background: 'rgba(246,38,38,0.10)', borderColor: PALETTE.red, color: PALETTE.red }}
                            >
                              {pendingReject ? 'Rejecting…' : 'Reject'}
                            </button>
                            <button
                              type="button"
                              disabled={pendingStatus || pendingReject}
                              onClick={() => setApproveModalOpen(true)}
                              {...writeAccess(canEdit)}
                              className="flex-1 min-h-[46px] px-3 py-2 rounded-[10px] border text-base font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ background: 'rgba(77,249,237,0.19)', borderColor: PALETTE.cyan, color: PALETTE.cyan }}
                            >
                              {pendingStatus ? 'Approving…' : 'Approve'}
                            </button>
                          </fieldset>
                        )}

                        {/* Fleet sees where each vehicle went; readiness is managed
                            per vehicle in Vehicle Management, not per booking. */}
                        {roleView === 'fleet_manager' && (
                          <p className="text-xs text-white/40 leading-snug">
                            Read-only. Run BLOWBAGETS inspections in Vehicle Management — only a vehicle
                            whose latest inspection passed can be assigned to a booking.
                          </p>
                        )}

                        {/* The GM's remarks on a rejected booking. */}
                        {d?.gm_status === 'rejected' && d?.rejection_reason && (
                          <div
                            className="rounded-[10px] border px-3 py-2"
                            style={{ borderColor: 'rgba(246,38,38,0.30)', background: 'rgba(246,38,38,0.08)' }}
                          >
                            <p className="text-xs font-bold uppercase text-[#f62626]/80 mb-1">
                              Rejected by the General Manager
                            </p>
                            <p className="text-sm text-white/75 leading-snug">{d.rejection_reason}</p>
                          </div>
                        )}

                        {/* Inspection recorded against the booking itself, on records
                            predating the move to per-vehicle inspections. */}
                        {d?.blowbagets_check && <BlowbagetsRecord check={d.blowbagets_check} />}

                        {/* The vehicle was pulled after it was assigned. Shown at every
                            stage and to every role, not only inside the crew panel. */}
                        {pulledByBooking.get(detail.booking_id) && (
                          <VehiclePulledBanner
                            {...pulledByBooking.get(detail.booking_id)!}
                            onTheRoad={normalizeBookingStatus(detail.status) !== 'assigned'}
                          />
                        )}

                        {/* Pausing a delivery in transit, and ending the pause: the
                            Operations Manager's and the Company Administrator's, never
                            the driver's. Also lists every earlier pause. */}
                        <PausePanel
                          bookingId={detail.booking_id}
                          pausedAt={(detail as { paused_at?: string | null }).paused_at}
                          inTransit={normalizeBookingStatus(detail.status) === 'in_transit'}
                          canControl={(roleView === 'admin' || roleView === 'operations_manager') && !bookingReadOnly}
                          allowed={canEdit}
                          onUpdated={() => { void refreshDetail(detail.booking_id); void loadPage(true) }}
                        />

                        {/* On the road the crew can no longer be re-assigned; while the
                            delivery is paused, it can be replaced. Lists every
                            replacement on the booking too. */}
                        <ReplaceCrewPanel
                          bookingId={detail.booking_id}
                          reference={detail.reference_number ?? null}
                          inTransit={normalizeBookingStatus(detail.status) === 'in_transit'}
                          paused={!!(detail as { paused_at?: string | null }).paused_at}
                          canReplace={(roleView === 'admin' || roleView === 'operations_manager') && !bookingReadOnly}
                          allowed={canEdit}
                          drivers={drivers}
                          trucks={trucks}
                          currentDriverId={committedAssignment.driverId || null}
                          currentSecondDriverId={committedAssignment.secondDriverId || null}
                          currentTruckId={committedAssignment.truckId || null}
                          currentHelperName={currentAssignment?.helper_name ?? null}
                          currentIsVendor={!!currentAssignment?.is_vendor_supplied}
                          currentVendorDriverUserId={currentAssignment?.vendor_driver_user_id ?? null}
                          currentVendorPlate={currentAssignment?.vendor_vehicle_plate ?? null}
                          currentVendorType={currentAssignment?.vendor_vehicle_type ?? null}
                          onReplaced={() => {
                            void refreshDetail(detail.booking_id)
                            void loadPage(true)
                            assignmentService.getAll().then(setAllAssignments).catch(() => {})
                            adminFetchTrucks().then(setTrucks).catch(() => {})
                          }}
                        />

                        {/* Arrival, docking, start, finish and departure at the loading
                            and each drop-off, and the total loaded per trip. */}
                        <StopTimesPanel
                          bookingId={detail.booking_id}
                          staff
                          canEdit={(roleView === 'admin' || roleView === 'operations_manager') && !bookingReadOnly}
                          allowed={canEdit}
                        />

                        {/* Driver / vehicle assignment */}
                        {showAssignment && (
                          <fieldset disabled={bookingReadOnly} className="min-w-0 border-0 p-0 m-0">
                          <AssignmentPanel
                            detail={detail}
                            drivers={availableDrivers}
                            trucks={availableTrucks}
                            assignDriverId={assignDriverId}
                            assignSecondDriverId={assignSecondDriverId}
                            secondDriver={
                              allAssignments.find((a) => a.booking_id === detail.booking_id)?.second_driver ?? null
                            }
                            onSecondDriverChange={setAssignSecondDriverId}
                            helperName={assignHelperName}
                            savedHelperName={
                              allAssignments.find((a) => a.booking_id === detail.booking_id)?.helper_name ?? null
                            }
                            onHelperNameChange={setAssignHelperName}
                            route={routeDistance}
                            routeLoading={routeLoading}
                            assignTruckId={assignTruckId}
                            assignBusy={assignBusy}
                            pickerOpen={assignEditMode}
                            vendorMode={assignVendorMode}
                            vendorForm={vendorForm}
                            vendorDrivers={vendorDrivers}
                            vendorDriversLoading={vendorDriversLoading}
                            externalDriverUserId={
                              allAssignments.find((a) => a.booking_id === detail.booking_id)
                                ?.vendor_driver_user_id ?? null
                            }
                            selectClass={selectClass}
                            onDriverChange={handleDriverChange}
                            onTruckChange={handleTruckChange}
                            onVendorModeChange={setAssignVendorMode}
                            onVendorFieldChange={(key, value) =>
                              setVendorForm((prev) => {
                                const next = { ...prev, [key]: value }
                                // Never the same person as both drivers.
                                if (key === 'vendor_driver_user_id' && value && value === prev.second_vendor_driver_user_id) {
                                  next.second_vendor_driver_user_id = ''
                                }
                                return next
                              })
                            }
                            onAssign={() => setConfirmAssign(true)}
                            onOpenPicker={() => setAssignEditMode(true)}
                            canEdit={canEdit}
                            onClosePicker={() => {
                              setAssignEditMode(false)
                              const restore = committedAssignment.driverId || committedAssignment.truckId
                                ? committedAssignment
                                : getPrefillFromBookingDetail(detail, trucks)
                              setAssignDriverId(restore.driverId)
                              setAssignTruckId(restore.truckId)
                              setAssignSecondDriverId(committedAssignment.secondDriverId ?? '')
                              setAssignHelperName(committedAssignment.helperName ?? '')
                              setPairFilled(null)
                            }}
                          />
                          </fieldset>
                        )}
                      </section>

                      {/* Delivered: waiting on the client. Staff can only resolve a reported problem. */}
                      {(roleView === 'admin' || roleView === 'operations_manager') && (
                        <CompletionPanel booking={detail as unknown as BookingWithRelations} mode="staff" canAct={canEdit}
                          onUpdated={() => { void refreshDetail(detail.booking_id); void loadPage() }} />
                      )}

                      {/* How many runs the assigned vehicle makes. Only once a
                          vehicle actually exists: until then there is no body to
                          compare the load against, and nothing to plan around. */}
                      {showTripPlanner && (
                        <TripPlanner
                          key={`${detail.booking_id}:${plannerTick}`}
                          detail={detail}
                          canEdit={!bookingReadOnly}
                          allowed={canEdit}
                          capacity={plannerCapacity}
                        />
                      )}
                    </>
                  )}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

