'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Calendar,
  Clock,
  Truck,
  Building2,
  User,
  UserCheck,
  Package,
  Weight,
  Layers,
  Ruler,
  Check,
  ClipboardCheck,
} from 'lucide-react'

import { statusColor } from '@/components/map/status.colors'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import type { BookingDetail } from '@/app/types/maps/routemap.types'
import {
  bookingService,
  type AdminBookingLifecycleStatus,
  type DestinationDeliveryStatus,
  type BlowbagetsKey,
  type BlowbagetsItems,
  type BlowbagetsCheck,
} from '@/lib/services/client/booking.service'
import {
  assignmentService,
  type AssignmentRecord,
} from '@/lib/services/admin/assignment.service'
import { driverService } from '@/lib/services/admin/user-management.service'
import { adminFetchTrucks } from '@/lib/services/admin/trucks.service'
import type { DriverUser } from '@/app/types/admin/user-management.types'
import type { Truck as TruckType } from '@/app/types/truck.types'
import { nowDate } from '@/app/utils/serverTime'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import ReusableModal, { RemarksModal } from '@/components/layout/ReusableModal'

const PAGE_SIZE = 12

const BOOKING_STATUSES: AdminBookingLifecycleStatus[] = [
  'pending',
  'approved',
  'assigned',
  'in_transit',
  'completed',
  'cancelled',
]

const DEST_STATUSES: DestinationDeliveryStatus[] = ['pending', 'delivered', 'failed']

// The fleet manager's pre-dispatch vehicle inspection. Every item must be
// ticked before the booking can be approved for dispatch. `key` is the stable
// state id (unique — note Battery and Brakes share the letter B).
const BLOWBAGETS_ITEMS: { key: BlowbagetsKey; letter: string; label: string; hint: string }[] = [
  { key: 'battery', letter: 'B', label: 'Battery', hint: 'Terminals clean, charge holding' },
  { key: 'lights',  letter: 'L', label: 'Lights',  hint: 'Head, tail, signal & hazard working' },
  { key: 'oil',     letter: 'O', label: 'Oil',     hint: 'Engine oil at proper level' },
  { key: 'water',   letter: 'W', label: 'Water',   hint: 'Radiator coolant topped up' },
  { key: 'brakes',  letter: 'B', label: 'Brakes',  hint: 'Pedal firm, no leaks' },
  { key: 'air',     letter: 'A', label: 'Air',     hint: 'Tyre pressure within range' },
  { key: 'gas',     letter: 'G', label: 'Gas',     hint: 'Fuel sufficient for the route' },
  { key: 'engine',  letter: 'E', label: 'Engine',  hint: 'Starts clean, no warning lights' },
  { key: 'tires',   letter: 'T', label: 'Tires',   hint: 'Tread & sidewalls sound, spare present' },
  { key: 'self',    letter: 'S', label: 'Self',    hint: 'Driver fit, rested & licensed' },
]

// Roles that share this view. Each non-admin role sees a filtered slice of
// bookings and acts only on its own approval stage.
export type BookingRoleView =
  | 'admin'
  | 'accountant'
  | 'general_manager'
  | 'operations_manager'
  | 'fleet_manager'

const ROLE_FORCED_STATUS: Partial<Record<BookingRoleView, AdminBookingLifecycleStatus>> = {
  accountant:         'pending',
  general_manager:    'pending',
  fleet_manager:      'assigned',
}

// Operations sees every status EXCEPT pending (a booking only reaches ops once
// approved). It keeps the status dropdown but with 'pending' removed.
const ROLE_HIDE_PENDING: Partial<Record<BookingRoleView, boolean>> = {
  operations_manager: true,
}

const ROLE_TITLE: Record<BookingRoleView, string> = {
  admin:              'Booking management',
  accountant:         'Bookings — accounting review',
  general_manager:    'Bookings — GM approval',
  operations_manager: 'Bookings — vehicle & driver assignment',
  fleet_manager:      'Bookings — vehicle readiness (BLOWBAGETS)',
}

type DetailWithExtra = BookingDetail & {
  transaction_documents?: string[] | null
  required_weight_kg?: number | null
  required_volume_cbm?: number | null
  required_length_cm?: number | null
  stackable_required?: boolean | null
  accounting_status?: 'pending' | 'approved' | 'rejected' | 'forwarded' | null
  gm_status?:         'pending' | 'approved' | 'rejected' | null
  ops_status?:        'pending' | 'assigned' | null
  fleet_status?:      'pending' | 'approved' | 'rejected' | null
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

interface ListRow {
  booking_id: string
  display_id: string
  origin?: string
  status: string
  schedule_date?: string
  truck_type_needed?: string
  company?: string | null
  stops: number
}

function toRows(raw: Record<string, unknown>[]): ListRow[] {
  return raw.map((b) => {
    const clients = b.clients as { company_name?: string | null } | undefined
    const dests   = b.booking_destinations as unknown[] | undefined
    const referenceNumber = typeof b.reference_number === 'string' && b.reference_number.trim()
      ? b.reference_number
      : undefined

    return {
      booking_id:        String(b.booking_id ?? ''),
      display_id:        referenceNumber ?? String(b.booking_id ?? '').slice(0, 8).toUpperCase(),
      origin:            typeof b.origin === 'string' ? b.origin : undefined,
      status:            typeof b.status === 'string' ? b.status : 'pending',
      schedule_date:     typeof b.schedule_date === 'string' ? b.schedule_date : undefined,
      truck_type_needed: typeof b.truck_type_needed === 'string' ? b.truck_type_needed : undefined,
      company:           clients?.company_name ?? null,
      stops:             Array.isArray(dests) ? dests.length : 0,
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

interface VendorAssignForm {
  vendor_name:           string
  vendor_contact:        string
  vendor_driver_name:    string
  vendor_driver_license: string
  vendor_driver_phone:   string
  vendor_vehicle_plate:  string
  vendor_vehicle_type:   string
}

const emptyVendorForm: VendorAssignForm = {
  vendor_name:           '',
  vendor_contact:        '',
  vendor_driver_name:    '',
  vendor_driver_license: '',
  vendor_driver_phone:   '',
  vendor_vehicle_plate:  '',
  vendor_vehicle_type:   '',
}

const VENDOR_FIELDS: { key: keyof VendorAssignForm; label: string; required?: boolean }[] = [
  { key: 'vendor_name',           label: 'Vendor / subcontractor' },
  { key: 'vendor_contact',        label: 'Vendor contact' },
  { key: 'vendor_driver_name',    label: 'Driver name', required: true },
  { key: 'vendor_driver_license', label: 'Driver license #' },
  { key: 'vendor_driver_phone',   label: 'Driver phone' },
  { key: 'vendor_vehicle_plate',  label: 'Vehicle plate', required: true },
  { key: 'vendor_vehicle_type',   label: 'Vehicle type' },
]

function AssignmentPanel({
  detail,
  drivers,
  trucks,
  assignDriverId,
  assignTruckId,
  assignBusy,
  assignEditMode,
  vendorMode,
  vendorForm,
  selectClass,
  onDriverChange,
  onTruckChange,
  onVendorModeChange,
  onVendorFieldChange,
  onAssign,
  onEditClick,
  onCancelEdit,
}: {
  detail:          BookingDetail
  drivers:         DriverUser[]
  trucks:          TruckType[]
  assignDriverId:  string
  assignTruckId:   string
  assignBusy:      boolean
  assignEditMode:  boolean
  vendorMode:      boolean
  vendorForm:      VendorAssignForm
  selectClass:     string
  onDriverChange:  (id: string) => void
  onTruckChange:   (id: string) => void
  onVendorModeChange:  (on: boolean) => void
  onVendorFieldChange: (key: keyof VendorAssignForm, value: string) => void
  onAssign:        () => void
  onEditClick:     () => void
  onCancelEdit:    () => void
}) {
  const isAssigned = normalizeBookingStatus(detail.status) === 'assigned'
  const locked     = isAssigned && !assignEditMode

  const driverLabel = (() => {
    if (vendorMode) return vendorForm.vendor_driver_name || '—'
    const dr = drivers.find((d) => (d.drivers?.driver_id ?? d.user_id) === assignDriverId)
    if (!dr) return assignDriverId || '—'
    return `${dr.first_name} ${dr.last_name}${dr.drivers?.license_number ? ` · ${dr.drivers.license_number}` : ''}`
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

  const canSubmit = vendorMode
    ? !!vendorForm.vendor_driver_name.trim() && !!vendorForm.vendor_vehicle_plate.trim()
    : !!assignDriverId && !!assignTruckId

  return (
    <div className="rounded-xl border border-white/[0.08] p-3 space-y-3 bg-black/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCheck size={14} className="text-[var(--color-cyan)]" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">
            Driver and vehicle assignment
          </h3>
        </div>
        {locked && (
          <button
            type="button"
            onClick={onEditClick}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-white/10
                       text-white/50 hover:text-white hover:border-white/25 transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {locked ? (
        <div className="space-y-2 text-sm text-white/70">
          {vendorMode && (
            <span className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
              style={{ color: '#fbbf24', borderColor: 'rgba(246,159,38,0.35)', background: 'rgba(246,159,38,0.12)' }}>
              Vendor-supplied
            </span>
          )}
          <div className="flex items-center gap-2">
            <User size={13} className="text-white/35 shrink-0" />
            <span>{driverLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <Truck size={13} className="text-white/35 shrink-0" />
            <span>{truckLabel}</span>
          </div>
          {vendorMode && vendorForm.vendor_name && (
            <div className="text-[11px] text-white/45">Vendor: {vendorForm.vendor_name}</div>
          )}
        </div>
      ) : (
        <>
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
                ? { background: 'rgba(246,159,38,0.14)', color: '#fbbf24' }
                : { color: '#888' }}
            >
              Vendor-supplied
            </button>
          </div>

          {vendorMode ? (
            <div className="space-y-2">
              {VENDOR_FIELDS.map(({ key, label, required }) => (
                <div key={key}>
                  <label className="text-[11px] text-white/40 block mb-1">
                    {label}{required && <span className="text-red-400"> *</span>}
                  </label>
                  <input
                    value={vendorForm[key]}
                    disabled={assignBusy}
                    onChange={(e) => onVendorFieldChange(key, e.target.value)}
                    className={selectClass}
                    placeholder={label}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-white/40 block mb-1">Driver</label>
                <select
                  value={assignDriverId}
                  disabled={assignBusy}
                  onChange={(e) => onDriverChange(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select driver</option>
                  {drivers.map((dr) => (
                    <option key={dr.user_id} value={dr.drivers?.driver_id ?? dr.user_id}>
                      {dr.first_name} {dr.last_name}
                      {dr.drivers?.license_number ? ` · ${dr.drivers.license_number}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-1">Vehicle</label>
                <select
                  value={assignTruckId}
                  disabled={assignBusy}
                  onChange={(e) => onTruckChange(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select vehicle</option>
                  {trucks.map((t) => (
                    <option key={t.truck_id} value={t.truck_id}>
                      {t.plate_number}
                      {t.vehicle_type ? ` · ${t.vehicle_type}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {assignEditMode && (
              <button
                type="button"
                disabled={assignBusy}
                onClick={onCancelEdit}
                className="flex-1 py-2 rounded-lg text-sm font-bold border border-white/10
                           text-white/50 hover:text-white transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            )}
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
              {assignBusy ? 'Assigning…' : assignEditMode ? 'Update' : 'Assign'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function BlowbagetsChecklist({
  checked,
  onToggle,
  disabled,
}: {
  checked:  Record<string, boolean>
  onToggle: (key: string) => void
  disabled: boolean
}) {
  const doneCount = BLOWBAGETS_ITEMS.filter((it) => checked[it.key]).length
  const total     = BLOWBAGETS_ITEMS.length
  const complete  = doneCount === total

  return (
    <div className="rounded-xl border border-white/[0.08] p-3 space-y-3 bg-black/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={14} className="text-[var(--color-cyan)]" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">
            BLOWBAGETS vehicle check
          </h3>
        </div>
        <span
          className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-md border"
          style={
            complete
              ? { color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.40)', background: 'rgba(77,249,237,0.12)' }
              : { color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.15)' }
          }
        >
          {doneCount}/{total}
        </span>
      </div>

      <ul className="space-y-1.5">
        {BLOWBAGETS_ITEMS.map((it) => {
          const on = !!checked[it.key]
          return (
            <li key={it.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle(it.key)}
                aria-pressed={on}
                className="w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left
                           transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={
                  on
                    ? { borderColor: 'rgba(77,249,237,0.35)', background: 'rgba(77,249,237,0.08)' }
                    : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.20)' }
                }
              >
                <span
                  className="shrink-0 w-5 h-5 rounded-md border flex items-center justify-center"
                  style={
                    on
                      ? { borderColor: 'var(--color-cyan)', background: 'var(--color-cyan)', color: '#04201e' }
                      : { borderColor: 'rgba(255,255,255,0.25)' }
                  }
                >
                  {on && <Check size={13} strokeWidth={3} />}
                </span>
                <span
                  className="shrink-0 w-4 text-center text-[12px] font-black"
                  style={{ color: on ? 'var(--color-cyan)' : 'rgba(255,255,255,0.4)' }}
                >
                  {it.letter}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className={`text-sm font-semibold ${on ? 'text-white' : 'text-white/75'}`}>
                    {it.label}
                  </span>
                  <span className="text-[10px] text-white/35 truncate">{it.hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {!complete && (
        <p className="text-[11px] text-white/40 leading-snug">
          Tick every item to enable approval. Found a fault? Reject to send the booking back to operations.
        </p>
      )}
    </div>
  )
}

// Read-only view of a previously recorded BLOWBAGETS inspection (shown once the
// fleet review is done, e.g. to admins or when reopening an approved booking).
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
                  : { color: '#fca5a5', borderColor: 'rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.10)' }
              }
            >
              {on ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
              {it.label}
            </span>
          )
        })}
      </div>

      {failed.length > 0 && (
        <p className="text-[11px] text-[#fca5a5]/90 leading-snug">
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
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
        Transaction Documents
      </h3>
      <ul className="space-y-1.5">
        {docs.map((url, i) => {
          const filename  = fileNameFromUrl(url) || `Document ${i + 1}`
          const ext       = filename.split('.').pop()?.toLowerCase() ?? ''
          const fileLabel = ext === 'pdf'  ? 'PDF'
                          : ext === 'xlsx' ? 'XLSX'
                          : ext === 'docx' ? 'DOCX'
                          : ext === 'doc'  ? 'DOC'
                          : ext.toUpperCase() || 'FILE'
          return (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-lg border border-white/[0.08]
                           bg-black/20 px-3 py-2 text-sm text-white/80
                           hover:border-[var(--color-cyan)]/40 hover:text-white
                           transition-colors group"
              >
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide
                                 px-1.5 py-0.5 rounded border
                                 border-[var(--color-cyan)]/30 text-[var(--color-cyan)]">
                  {fileLabel}
                </span>
                <span className="flex-1 truncate font-mono text-xs">{filename}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13" height="13" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0 opacity-40 group-hover:opacity-80 transition-opacity"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
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
  const forcedStatus = ROLE_FORCED_STATUS[roleView]
  const hidePending  = !!ROLE_HIDE_PENDING[roleView]
  const [rawBookings, setRawBookings] = useState<Record<string, unknown>[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError]     = useState<string | null>(null)
  const [listMeta, setListMeta]       = useState<{
    total: number
    totalPages: number
    statusCounts: Record<string, number>
  } | null>(null)

  // Booking-management tier for this user (full access in the admin shell unless
  // restricted). Write controls below are hidden when the user can't edit.
  const { canEdit } = useModuleAccess()

  const [search, setSearch]               = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter]   = useState<string>('all')
  const [page, setPage]                   = useState(0)

  const [selectedId, setSelectedId]       = useState<string | null>(null)
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

  // Fleet manager's BLOWBAGETS inspection state — reset whenever the detail
  // panel opens/closes so each booking starts from an unchecked list.
  const [blowbagetsChecked, setBlowbagetsChecked] = useState<Record<string, boolean>>({})
  const blowbagetsComplete = BLOWBAGETS_ITEMS.every((it) => blowbagetsChecked[it.key])

  const [drivers, setDrivers]             = useState<DriverUser[]>([])
  const [trucks, setTrucks]               = useState<TruckType[]>([])
  const [allAssignments, setAllAssignments] = useState<AssignmentRecord[]>([])
  const [assignDriverId, setAssignDriverId] = useState<string>('')
  const [assignTruckId, setAssignTruckId]   = useState<string>('')
  const [assignBusy, setAssignBusy]         = useState(false)
  const [assignEditMode, setAssignEditMode] = useState(false)

  // Vendor-supplied crew: entered ad-hoc and snapshotted onto the delivery instead
  // of picking a registered driver/vehicle.
  const [assignVendorMode, setAssignVendorMode] = useState(false)
  const [vendorForm, setVendorForm]             = useState<VendorAssignForm>(emptyVendorForm)

  const [committedAssignment, setCommittedAssignment] = useState<{
    driverId: string
    truckId: string
  }>({ driverId: '', truckId: '' })

  useEffect(() => {
    void Promise.all([
      driverService.getAll().then(setDrivers).catch(() => setDrivers([])),
      adminFetchTrucks().then(setTrucks).catch(() => setTrucks([])),
      assignmentService.getAll().then(setAllAssignments).catch(() => setAllAssignments([])),
    ])
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(t)
  }, [search])

  const loadPage = useCallback(async () => {
    try {
      setListLoading(true)
      setListError(null)
      const res = await bookingService.fetchBookingsAdminPaginated({
        page:   page + 1,
        limit:  PAGE_SIZE,
        status: forcedStatus ?? statusFilter,
        search: debouncedSearch,
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
      setListError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    } finally {
      setListLoading(false)
    }
  }, [page, statusFilter, debouncedSearch])

  useEffect(() => { void loadPage() }, [loadPage])

  const listRows  = useMemo(() => {
    const rows = toRows(rawBookings)
    return hidePending ? rows.filter((r) => normalizeBookingStatus(r.status) !== 'pending') : rows
  }, [rawBookings, hidePending])
  const pageCount = Math.max(1, listMeta?.totalPages ?? 1)
  const pageSafe  = Math.min(page, pageCount - 1)
  const totalRows = listMeta?.total ?? 0

  const busyElsewhere = useMemo(
    () =>
      allAssignments.filter(
        (a) =>
          a.booking_id !== selectedId &&
          (a.status === 'pending' || a.status === 'in_transit'),
      ),
    [allAssignments, selectedId],
  )

  const busyDriverIds = useMemo(
    () => new Set(busyElsewhere.map((a) => a.driver_id).filter(Boolean) as string[]),
    [busyElsewhere],
  )

  const busyTruckIds = useMemo(
    () => new Set(busyElsewhere.map((a) => a.truck_id).filter(Boolean) as string[]),
    [busyElsewhere],
  )

  const availableDrivers = useMemo(
    () =>
      drivers.filter((dr) => {
        const id = dr.drivers?.driver_id ?? dr.user_id
        return !busyDriverIds.has(id) || id === assignDriverId
      }),
    [drivers, busyDriverIds, assignDriverId],
  )

  const availableTrucks = useMemo(
    () =>
      trucks.filter(
        (t) => !busyTruckIds.has(t.truck_id) || t.truck_id === assignTruckId,
      ),
    [trucks, busyTruckIds, assignTruckId],
  )

  const restoreAssignment = useCallback((detail: BookingDetail, assignment?: AssignmentRecord | { driver_id?: string | null; truck_id?: string | null }) => {
    const record = assignment as AssignmentRecord | undefined
    const isVendor = record?.is_vendor_supplied === true
    setAssignVendorMode(isVendor)
    setVendorForm(isVendor ? {
      vendor_name:           record?.vendor_name           ?? '',
      vendor_contact:        record?.vendor_contact        ?? '',
      vendor_driver_name:    record?.vendor_driver_name    ?? '',
      vendor_driver_license: record?.vendor_driver_license ?? '',
      vendor_driver_phone:   record?.vendor_driver_phone   ?? '',
      vendor_vehicle_plate:  record?.vendor_vehicle_plate  ?? '',
      vendor_vehicle_type:   record?.vendor_vehicle_type   ?? '',
    } : emptyVendorForm)

    const fallback = getPrefillFromBookingDetail(detail, trucks)
    const ids = {
      driverId: (isVendor ? '' : assignment?.driver_id) ?? fallback.driverId,
      truckId:  (isVendor ? '' : assignment?.truck_id)  ?? fallback.truckId,
    }
    setAssignDriverId(ids.driverId)
    setAssignTruckId(ids.truckId)
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
    setAssignTruckId('')
    setAssignVendorMode(false)
    setVendorForm(emptyVendorForm)
    setAssignEditMode(false)
    setBlowbagetsChecked({})
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

  const closeDetail = useCallback(() => {
    setSelectedId(null)
    setDetail(null)
    setDetailError(null)
    setDeleteAskId(null)
    setApproveModalOpen(false)
    setRejectModalOpen(false)
    setAssignDriverId('')
    setAssignTruckId('')
    setAssignVendorMode(false)
    setVendorForm(emptyVendorForm)
    setAssignEditMode(false)
    setCommittedAssignment({ driverId: '', truckId: '' })
    setBlowbagetsChecked({})
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
      if (!vendorForm.vendor_driver_name.trim() || !vendorForm.vendor_vehicle_plate.trim()) return
    } else if (!assignDriverId || !assignTruckId) {
      return
    }
    setAssignBusy(true)
    try {
      if (assignVendorMode) {
        await assignmentService.assignBooking(selectedId, {
          is_vendor_supplied: true,
          ...Object.fromEntries(
            Object.entries(vendorForm).map(([k, v]) => [k, v.trim() || undefined]),
          ),
        })
      } else {
        await assignmentService.assignBooking(selectedId, {
          driver_id: assignDriverId,
          truck_id:  assignTruckId,
        })
      }
      setCommittedAssignment({ driverId: assignDriverId, truckId: assignTruckId })
      setAssignEditMode(false)
      await openDetail(selectedId)
      await loadPage()
      assignmentService.getAll().then(setAllAssignments).catch(() => null)
      appToast.success('Driver and vehicle assigned.', { action: 'assign', entityId: selectedId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'assign', entityId: selectedId })
    } finally {
      setAssignBusy(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedId || !detail) return
    setApproveModalOpen(false)
    setPendingStatus(true)
    try {
      await bookingService.updateBookingStatusAdmin(selectedId, 'approved')
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
      await bookingService.updateBookingStatusAdmin(selectedId, 'cancelled')
      void remarks
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

  // Workflow stage actions. Each hits its dedicated endpoint, which fires the
  // next-stage notification on the backend.
  const handleAccountingReview = async (decision: 'approved' | 'rejected', remarks?: string) => {
    if (!selectedId) return
    if (decision === 'approved') setPendingStatus(true); else setPendingReject(true)
    try {
      await bookingService.accountingReview(selectedId, { accounting_status: decision, rejection_reason: remarks })
      await refreshAfterAction()
      appToast.success(decision === 'approved' ? 'Approved — forwarded for the next stage.' : 'Booking rejected.', { action: 'accounting-review', entityId: selectedId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'accounting-review', entityId: selectedId })
    } finally {
      setPendingStatus(false); setPendingReject(false)
    }
  }

  const handleGmReview = async (decision: 'approved' | 'rejected', remarks?: string) => {
    if (!selectedId) return
    if (decision === 'approved') setPendingStatus(true); else setPendingReject(true)
    try {
      await bookingService.gmReview(selectedId, { gm_status: decision, rejection_reason: remarks })
      await refreshAfterAction()
      appToast.success(decision === 'approved' ? 'Approved — sent to operations.' : 'Booking rejected.', { action: 'gm-review', entityId: selectedId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'gm-review', entityId: selectedId })
    } finally {
      setPendingStatus(false); setPendingReject(false)
    }
  }

  const handleFleetReview = async (decision: 'approved' | 'rejected', remarks?: string) => {
    if (!selectedId) return
    if (decision === 'approved') setPendingStatus(true); else setPendingReject(true)
    // Snapshot the checklist so the recorded inspection shows exactly which items
    // passed — on a rejection this captures the fault(s) the fleet manager found.
    const blowbagets = BLOWBAGETS_ITEMS.reduce((acc, it) => {
      acc[it.key] = !!blowbagetsChecked[it.key]
      return acc
    }, {} as BlowbagetsItems)
    try {
      await bookingService.fleetReview(selectedId, { decision, rejection_reason: remarks, blowbagets })
      await refreshAfterAction()
      appToast.success(decision === 'approved' ? 'Vehicle cleared — driver notified.' : 'Sent back to operations.', { action: 'fleet-review', entityId: selectedId })
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'fleet-review', entityId: selectedId })
    } finally {
      setPendingStatus(false); setPendingReject(false)
    }
  }

  // Dispatch the generic Approve/Reject modals to the right stage per role.
  const confirmApprove = () => {
    setApproveModalOpen(false)
    if (roleView === 'accountant')      return void handleAccountingReview('approved')
    if (roleView === 'general_manager') return void handleGmReview('approved')
    if (roleView === 'fleet_manager')   return void handleFleetReview('approved')
    return void handleApprove()
  }
  const confirmReject = (remarks: string) => {
    setRejectModalOpen(false)
    if (roleView === 'accountant')      return void handleAccountingReview('rejected', remarks)
    if (roleView === 'general_manager') return void handleGmReview('rejected', remarks)
    if (roleView === 'fleet_manager')   return void handleFleetReview('rejected', remarks)
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

  const accApprovedOrFwd = d?.accounting_status === 'approved' || d?.accounting_status === 'forwarded'
  const showStageActions = !!detail && (
    (roleView === 'admin'           && canEdit && normalizeBookingStatus(detail.status) === 'pending') ||
    (roleView === 'accountant'      && d?.accounting_status === 'pending') ||
    (roleView === 'general_manager' && d?.gm_status === 'pending' && accApprovedOrFwd) ||
    (roleView === 'fleet_manager'   && d?.fleet_status === 'pending' && d?.ops_status === 'assigned')
  )
  const showAssignment = !!detail &&
    (roleView === 'admin' || roleView === 'operations_manager') &&
    (normalizeBookingStatus(detail.status) === 'approved' || normalizeBookingStatus(detail.status) === 'assigned')

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-sc bg-[var(--color-bg)]">

      {/* Notification deep-link: opens the booking named in ?booking=<id>. */}
      <Suspense fallback={null}>
        <BookingDeepLink onFocus={openDetail} />
      </Suspense>

      <ReusableModal
        open={approveModalOpen}
        title={roleView === 'fleet_manager' ? 'Clear vehicle for dispatch?' : 'Approve this booking?'}
        description={
          roleView === 'fleet_manager'
            ? `Confirm all ${BLOWBAGETS_ITEMS.length} BLOWBAGETS items have been physically inspected and passed. The assigned driver will be notified to proceed. This cannot be undone.`
            : docCount > 0
              ? `Please confirm you have reviewed all ${docCount} transaction document${docCount > 1 ? 's' : ''} submitted by the client before proceeding. Approving cannot be undone.`
              : 'Please confirm you have reviewed all client-submitted documents and details before proceeding. Approving cannot be undone.'
        }
        confirmLabel={roleView === 'fleet_manager' ? 'Clear & dispatch' : 'Approve'}
        cancelLabel="Go back"
        onConfirm={confirmApprove}
        onCancel={() => setApproveModalOpen(false)}
        disableBackdropClose={pendingStatus}
      />

      <RemarksModal
        open={rejectModalOpen}
        title="Reject this booking?"
        description="This booking will be marked as cancelled. Please provide a reason before proceeding."
        remarksLabel="Reason for rejection"
        remarksPlaceholder="e.g. Incomplete documents, route not serviceable…"
        confirmLabel="Reject"
        cancelLabel="Go back"
        onConfirm={confirmReject}
        onCancel={() => setRejectModalOpen(false)}
        disableBackdropClose={pendingReject}
        busy={pendingReject}
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

      <header className="shrink-0 px-3 py-3 lg:px-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <h1 className="text-lg font-bold text-white tracking-tight">{ROLE_TITLE[roleView]}</h1>
        <button
          type="button"
          onClick={() => void loadPage()}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 p-3 lg:p-4 gap-3">

          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between shrink-0">
            <div
              className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-md"
              style={{ background: '#2a2828' }}
            >
              <Search size={16} className="text-white/40 shrink-0" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                placeholder="Search ID, client, origin, truck type…"
                className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
              />
            </div>
            {!forcedStatus && (
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="booking-status-filter" className="text-[10px] uppercase tracking-wider text-white/35">
                  Status
                </label>
                <select
                  id="booking-status-filter"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
                  className="rounded-lg border border-white/10 bg-[#1a1a1a] text-xs font-bold text-white/80 px-3 py-2 outline-none focus:border-[var(--color-cyan)]/50 cursor-pointer"
                >
                  {(['all', ...BOOKING_STATUSES.filter((s) => !hidePending || s !== 'pending')]).map((key) => {
                    const label = key === 'all' ? (hidePending ? 'All (active)' : 'All') : fmtStatus(key)
                    const count = key === 'all' ? statusCounts.all : statusCounts[key] ?? 0
                    return (
                      <option key={key} value={key}>
                        {label} ({count})
                      </option>
                    )
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
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
              <div className="flex-1 flex items-center justify-center text-sm text-white/45 py-12">
                No bookings match your filters.
              </div>
            ) : (
              <>
                <div className="overflow-auto flex-1 min-h-0">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                      <tr className="text-[11px] uppercase tracking-wider text-white/40">
                        <th className="px-3 py-2.5 font-bold">Booking</th>
                        <th className="px-3 py-2.5 font-bold">Status</th>
                        <th className="px-3 py-2.5 font-bold">Schedule</th>
                        <th className="px-3 py-2.5 font-bold hidden md:table-cell">Client</th>
                        <th className="px-3 py-2.5 font-bold">Origin</th>
                        <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Vehicle</th>
                        <th className="px-3 py-2.5 font-bold text-right">Stops</th>
                      </tr>
                    </thead>
                    <tbody>
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
                            className="border-b border-white/[0.05] cursor-pointer transition-colors hover:bg-white/[0.04]"
                            style={{ background: active ? 'rgba(77,249,237,0.06)' : undefined }}
                          >
                            <td className="px-3 py-2.5 text-white/85 max-w-[160px] truncate">{r.display_id}</td>
                            <td className="px-3 py-2.5">
                              <span
                                className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                                style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}
                              >
                                {fmtStatus(r.status)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-white/75 whitespace-nowrap">{r.schedule_date ?? '—'}</td>
                            <td className="px-3 py-2.5 text-white/70 max-w-[180px] truncate hidden md:table-cell">{r.company ?? '—'}</td>
                            <td className="px-3 py-2.5 text-white/85 max-w-[220px] truncate">{r.origin ?? '—'}</td>
                            <td className="px-3 py-2.5 text-white/55 text-xs hidden lg:table-cell">{r.truck_type_needed ?? '—'}</td>
                            <td className="px-3 py-2.5 text-right text-white/60">{r.stops}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-white/[0.07] text-xs text-white/50">
                  <span>
                    Showing{' '}
                    {totalRows === 0 ? '0' : `${pageSafe * PAGE_SIZE + 1}–${Math.min((pageSafe + 1) * PAGE_SIZE, totalRows)}`}
                    {' '}of {totalRows}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={pageSafe <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="p-1.5 rounded-md border border-white/10 disabled:opacity-30 hover:bg-white/5">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="px-2 tabular-nums">{pageSafe + 1} / {pageCount}</span>
                    <button type="button" disabled={pageSafe >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="p-1.5 rounded-md border border-white/10 disabled:opacity-30 hover:bg-white/5">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
                className="fixed lg:relative z-[50] inset-y-0 right-0 w-full max-w-md lg:max-w-[420px] shrink-0 border-l border-white/[0.08] bg-[var(--color-surface)] flex flex-col shadow-2xl lg:shadow-none"
              >
                <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-white/[0.07]">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/45">Booking</span>
                  <button type="button" onClick={closeDetail} className="p-2 rounded-lg hover:bg-white/5 text-white/60" aria-label="Close">
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
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
                      {/* Booking info */}
                      <div className="rounded-xl border border-white/[0.08] p-3 space-y-2 bg-black/20">
                        <p className="text-[10px] font-mono text-white/35 break-all">
                          {detail.reference_number ?? detail.booking_id}
                        </p>
                        <div className="flex items-start gap-2 text-white/90 text-sm">
                          <MapPin size={16} className="text-[var(--color-cyan)] shrink-0 mt-0.5" />
                          <span>{detail.origin}</span>
                        </div>
                        <div className="grid gap-2 text-sm text-white/70">
                          <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-white/35" />
                            {detail.clients?.company_name ?? '—'}
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-white/35" />
                            {detail.schedule_date}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-white/35" />
                            {detail.call_time}
                          </div>
                          <div className="flex items-center gap-2">
                            <Truck size={14} className="text-white/35" />
                            {detail.truck_type_needed}
                          </div>
                          {detail.driver?.name && (
                            <div className="flex items-center gap-2">
                              <User size={14} className="text-white/35" />
                              Driver: {detail.driver.name}
                              {detail.driver.truck?.plate_number ? ` · ${detail.driver.truck.plate_number}` : ''}
                            </div>
                          )}
                          {detail.payment_terms && (
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-white/35" />
                              Payment terms: {detail.payment_terms} days
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Transaction documents */}
                      {(d?.transaction_documents?.length ?? 0) > 0 && (
                        <TransactionDocs docs={d!.transaction_documents!} />
                      )}

                      {/* Cargo summary */}
                      {(d?.required_weight_kg || d?.required_volume_cbm || d?.required_length_cm) && (
                        <div>
                          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
                            <Layers size={12} className="text-white/35" />
                            Cargo Summary
                          </h3>
                          <div className="grid grid-cols-3 gap-1.5">
                            {d.required_weight_kg != null && d.required_weight_kg > 0 && (
                              <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2 flex flex-col gap-0.5">
                                <span className="text-[9px] uppercase tracking-widest text-white/35 flex items-center gap-1"><Weight size={9} />Gross Wt.</span>
                                <span className="text-white text-sm font-bold tabular-nums">{d.required_weight_kg.toFixed(2)}</span>
                                <span className="text-[9px] text-white/35">kg</span>
                              </div>
                            )}
                            {d.required_volume_cbm != null && d.required_volume_cbm > 0 && (
                              <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2 flex flex-col gap-0.5">
                                <span className="text-[9px] uppercase tracking-widest text-white/35 flex items-center gap-1"><Package size={9} />Volume</span>
                                <span className="text-white text-sm font-bold tabular-nums">{d.required_volume_cbm.toFixed(4)}</span>
                                <span className="text-[9px] text-white/35">CBM</span>
                              </div>
                            )}
                            {d.required_length_cm != null && d.required_length_cm > 0 && (
                              <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2 flex flex-col gap-0.5">
                                <span className="text-[9px] uppercase tracking-widest text-white/35 flex items-center gap-1"><Ruler size={9} />Max Len.</span>
                                <span className="text-white text-sm font-bold tabular-nums">{d.required_length_cm.toFixed(0)}</span>
                                <span className="text-[9px] text-white/35">cm</span>
                              </div>
                            )}
                          </div>
                          {d.stackable_required && (
                            <p className="text-[11px] text-[var(--color-cyan)] mt-1.5 flex items-center gap-1.5">
                              <Layers size={11} />Stackable pallets included
                            </p>
                          )}
                        </div>
                      )}

                      {/* Cargo items */}
                      {cargoItems.length > 0 && (
                        <div>
                          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
                            <Package size={12} className="text-white/35" />
                            Cargo Items
                            <span className="ml-auto text-white/25 font-normal normal-case tracking-normal">
                              {cargoItems.length} item{cargoItems.length !== 1 ? 's' : ''}
                            </span>
                          </h3>
                          <div className="space-y-2">
                            {cargoItems.map((item, idx) => {
                              const commodity = resolveLabel(item.commodity_id, item.commodity_text, item.commodities)
                              const product   = resolveLabel(item.product_id,   item.product_text,   item.products)
                              const shc       = item.shc?.code  ?? item.shc_text  ?? null
                              const ashc      = item.ashc?.code ?? item.ashc_text ?? null
                              const weightStr = fmtNum(item.weight_kg,  'kg')
                              const volumeStr = fmtNum(item.volume_cbm, 'CBM', 4)
                              const hasDims   = item.length_cm && item.width_cm && item.height_cm
                              const dimsStr   = hasDims ? `${item.length_cm} × ${item.width_cm} × ${item.height_cm} cm` : null

                              return (
                                <div key={item.item_id ?? idx} className="rounded-lg border border-white/[0.07] bg-black/20 overflow-hidden">
                                  <div className="px-2.5 py-1.5 border-b border-white/[0.05] flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-cyan)]">Item {idx + 1}</span>
                                    {item.quantity != null && item.quantity > 0 && (
                                      <span className="text-[10px] text-white/40 tabular-nums">×{item.quantity}</span>
                                    )}
                                  </div>
                                  <div className="divide-y divide-white/[0.04]">
                                    {commodity  && <CargoRow label="Commodity" value={commodity} />}
                                    {product    && <CargoRow label="Product"   value={product} />}
                                    {shc        && <CargoRow label="SHC"       value={shc}  mono />}
                                    {ashc       && <CargoRow label="Add. SHC"  value={ashc} mono />}
                                    {weightStr  && <CargoRow label="Weight"    value={weightStr} accent />}
                                    {volumeStr  && <CargoRow label="Volume"    value={volumeStr} accent />}
                                    {dimsStr    && <CargoRow label="L × W × H" value={dimsStr} />}
                                    {item.notes && <CargoRow label="Notes"     value={item.notes} />}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Booking status */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                            Booking status
                          </label>
                          <span
                            className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                            style={{
                              color:       statusColor(detail.status),
                              borderColor: `${statusColor(detail.status)}55`,
                              background:  `${statusColor(detail.status)}14`,
                            }}
                          >
                            {fmtStatus(detail.status)}
                          </span>
                        </div>

                        {roleView === 'fleet_manager' && showStageActions && (
                          <BlowbagetsChecklist
                            checked={blowbagetsChecked}
                            onToggle={(key) =>
                              setBlowbagetsChecked((prev) => ({ ...prev, [key]: !prev[key] }))
                            }
                            disabled={pendingStatus || pendingReject}
                          />
                        )}

                        {showStageActions && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={pendingStatus || pendingReject || (roleView === 'fleet_manager' && !blowbagetsComplete)}
                              onClick={() => setApproveModalOpen(true)}
                              className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
                              style={{ background: 'rgba(77,249,237,0.12)', border: '1px solid rgba(77,249,237,0.30)', color: 'var(--color-cyan)' }}
                            >
                              {pendingStatus
                                ? 'Approving…'
                                : roleView === 'fleet_manager'
                                  ? 'Approve & dispatch'
                                  : 'Approve'}
                            </button>
                            <button
                              type="button"
                              disabled={pendingStatus || pendingReject}
                              onClick={() => setRejectModalOpen(true)}
                              className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
                              style={{ background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', color: '#fca5a5' }}
                            >
                              {pendingReject ? 'Rejecting…' : 'Reject'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Recorded BLOWBAGETS inspection (read-only, once reviewed) */}
                      {d?.blowbagets_check && !(roleView === 'fleet_manager' && showStageActions) && (
                        <BlowbagetsRecord check={d.blowbagets_check} />
                      )}

                      {/* Driver / vehicle assignment */}
                      {showAssignment && (
                        <AssignmentPanel
                          detail={detail}
                          drivers={availableDrivers}
                          trucks={availableTrucks}
                          assignDriverId={assignDriverId}
                          assignTruckId={assignTruckId}
                          assignBusy={assignBusy}
                          assignEditMode={assignEditMode}
                          vendorMode={assignVendorMode}
                          vendorForm={vendorForm}
                          selectClass={selectClass}
                          onDriverChange={setAssignDriverId}
                          onTruckChange={setAssignTruckId}
                          onVendorModeChange={setAssignVendorMode}
                          onVendorFieldChange={(key, value) =>
                            setVendorForm((prev) => ({ ...prev, [key]: value }))
                          }
                          onAssign={() => void handleAssign()}
                          onEditClick={() => setAssignEditMode(true)}
                          onCancelEdit={() => {
                            setAssignEditMode(false)
                            const restore = committedAssignment.driverId || committedAssignment.truckId
                              ? committedAssignment
                              : getPrefillFromBookingDetail(detail, trucks)
                            setAssignDriverId(restore.driverId)
                            setAssignTruckId(restore.truckId)
                          }}
                        />
                      )}

                      {/* Proof of pickup, photographed by the driver at the origin. */}
                      {d?.pickup_proof_photo_url && (
                        <div>
                          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
                            Proof of pickup
                          </h3>
                          <ProofPhoto
                            url={d.pickup_proof_photo_url}
                            at={d.pickup_proof_at}
                            label="Pickup confirmed by driver"
                          />
                        </div>
                      )}

                      {/* Delivery stops */}
                      <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
                          Delivery stops
                        </h3>
                        <ul className="space-y-2">
                          {(detail.booking_destinations ?? [])
                            .slice()
                            .sort((a, b) => a.sequence_order - b.sequence_order)
                            .map((dest) => (
                              <li key={dest.destination_id} className="rounded-lg border border-white/[0.08] p-2.5 space-y-2 bg-black/20">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm text-white/85 leading-snug min-w-0">{dest.address}</p>
                                  <span
                                    className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border"
                                    style={{ color: statusColor(dest.status), borderColor: `${statusColor(dest.status)}44` }}
                                  >
                                    {fmtStatus(dest.status)}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {DEST_STATUSES.map((st) => (
                                    <span
                                      key={st}
                                      className="text-[11px] font-semibold px-2 py-1 rounded-md border border-white/10"
                                      style={
                                        dest.status === st
                                          ? { borderColor: 'var(--color-cyan)', color: 'var(--color-cyan)' }
                                          : { color: 'rgba(255,255,255,0.3)' }
                                      }
                                    >
                                      {fmtStatus(st)}
                                    </span>
                                  ))}
                                </div>
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
                                    <p className="text-[11px] text-white/30">No proof photo on file.</p>
                                  )}
                              </li>
                            ))}
                        </ul>
                        {(detail.booking_destinations?.length ?? 0) === 0 && (
                          <p className="text-sm text-white/40">No stops on this booking.</p>
                        )}
                      </div>
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

function CargoRow({
  label,
  value,
  accent = false,
  mono   = false,
}: {
  label:   string
  value:   string
  accent?: boolean
  mono?:   boolean
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 gap-3">
      <span className="text-[10px] uppercase tracking-wider text-white/30 shrink-0">{label}</span>
      <span
        className={`text-xs text-right truncate ${mono ? 'font-mono' : ''}`}
        style={{ color: accent ? 'var(--color-cyan)' : 'rgba(255,255,255,0.75)' }}
      >
        {value}
      </span>
    </div>
  )
}