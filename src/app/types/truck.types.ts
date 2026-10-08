import { TruckModel } from "./truck-model"
import type { BlowbagetsItems } from "@/lib/services/client/booking.service"
import type { DriverReport } from "./driver-report.types"

/**
 * One BLOWBAGETS inspection of a vehicle, recorded by the fleet manager. The
 * NEWEST inspection per vehicle decides whether operations may pick it for a
 * booking — a pass holds until a later inspection replaces it.
 */
export interface TruckInspection {
  inspection_id: string
  truck_id:      string
  items:         BlowbagetsItems
  passed:        boolean
  notes:         string | null
  inspected_by:  string | null
  inspected_at:  string
  created_at:    string
  inspector?:    { first_name: string; last_name: string } | null
}

/** The vehicle's regular driver, as Vehicle Management shows them. */
export interface AssignedDriver {
  driver_id:      string
  license_number: string | null
  status:         string | null
  first_name:     string | null
  last_name:      string | null
}

export interface Truck {
  truck_id:     string
  plate_number: string
  model_id?:    string | null
  vehicle_type: string | null
  model_name:   string | null
  truck_model?: TruckModel | null
  status:       'available' | 'recheck_due' | 'in_use' | 'under_maintenance' | 'inactive' | 'archived'
  // Most recent inspection, or null when the vehicle has never been inspected
  // (which reads the same as a fail: it can't be assigned).
  latest_inspection?: TruckInspection | null
  // When the vehicle last came home from a booking. A BLOWBAGETS pass clears it
  // for one job and expires on return, so readiness is the two dates compared —
  // see isRoadworthy.
  last_fleet_return_at?: string | null
  // Who normally drives it. This is a default for booking assignment, not a
  // lock — a paired driver on leave must not strand the vehicle.
  assigned_driver_id?: string | null
  assigned_driver?:    AssignedDriver | null
  // Routine service: every N km or N months since the last service, whichever
  // comes first. Entered per vehicle — there is no default.
  service_interval_km?:      number | null
  service_interval_months?:  number | null
  /** `YYYY-MM-DD` */
  last_service_at?:          string | null
  last_service_odometer_km?: number | null
  /** Latest odometer reading (km), typed by the Fleet Manager with a photo. */
  odometer_km?:              number | null
  odometer_recorded_at?:     string | null
  /** Worked out by the server so every screen agrees. */
  service_status?:           ServiceStatus
  /** Back from a delivery and the after-delivery odometer isn't recorded yet. */
  return_odometer_due?:      boolean
  created_at:   string
  updated_at:   string
}

/**
 * Routine service state (see logistics-backend/src/lib/service-schedule.ts):
 *   missing  — schedule or reading not entered yet (flagged, not blocked)
 *   ok       — nothing due
 *   due_soon — within 10% of the km interval, or 7 days of the date
 *   overdue  — past either limit; cannot be assigned until serviced
 */
export type ServiceState = 'missing' | 'ok' | 'due_soon' | 'overdue'

export interface ServiceStatus {
  state:     ServiceState
  due_km:    number | null
  due_date:  string | null
  km_left:   number | null
  days_left: number | null
}

/** Cleared for the Operations Manager to pick: BLOWBAGETS current and service not overdue. */
export function isAssignable(
  truck: Pick<Truck, 'latest_inspection' | 'last_fleet_return_at' | 'service_status'>,
): boolean {
  return isRoadworthy(truck) && truck.service_status?.state !== 'overdue'
}

export interface OdometerReading {
  reading_id:       string
  truck_id:         string
  reading_km:       number
  kind:             'initial' | 'pre_trip' | 'post_trip' | 'service'
  photo_url:        string | null
  booking_id:       string | null
  reference_number: string | null
  inspection_id:    string | null
  recorded_at:      string
  recorder:         { first_name: string | null; last_name: string | null } | null
}

export interface TruckService {
  service_id:  string
  truck_id:    string
  serviced_at: string
  odometer_km: number
  work_done:   string
  workshop:    string | null
  receipt_url: string | null
  created_at:  string
  recorder:    { first_name: string | null; last_name: string | null } | null
}

/** "Juan Dela Cruz", or null when the vehicle has no regular driver. */
export function assignedDriverName(truck: Pick<Truck, 'assigned_driver'>): string | null {
  const d = truck.assigned_driver
  if (!d) return null
  const name = `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim()
  return name || null
}

/**
 * True when this vehicle is cleared for operations to assign.
 *
 * Two conditions, mirroring `assertTruckAssignable` on the server: the latest
 * BLOWBAGETS inspection passed, and it was recorded since the vehicle last
 * returned to the yard. A pass clears a truck for the job in front of it — once
 * it comes back it has been loaded, driven and unloaded since anyone looked at
 * it, so the fleet manager inspects it again before it goes out.
 */
export function isRoadworthy(
  truck: Pick<Truck, 'latest_inspection' | 'last_fleet_return_at'>,
): boolean {
  const latest = truck.latest_inspection
  if (latest?.passed !== true) return false

  const lastReturn = truck.last_fleet_return_at
  if (!lastReturn) return true          // never been out; the first pass stands
  return latest.inspected_at > lastReturn
}

/** True when the vehicle is only blocked because it is due a re-check. */
export function needsReinspection(
  truck: Pick<Truck, 'latest_inspection' | 'last_fleet_return_at'>,
): boolean {
  return truck.latest_inspection?.passed === true && !isRoadworthy(truck)
}

/**
 * Why a vehicle is on the Maintenance tab (it can carry several):
 *   under_maintenance — someone took it out of service
 *   failed_inspection — its latest BLOWBAGETS failed
 *   driver_report     — a driver has an unresolved breakdown/accident open on it
 */
export type MaintenanceReason =
  | 'under_maintenance'
  | 'failed_inspection'
  | 'driver_report'
  | 'service_overdue'
  | 'service_due_soon'
  | 'service_schedule_missing'

export interface MaintenanceTruck extends Truck {
  maintenance_reasons: MaintenanceReason[]
  open_reports:        DriverReport[]
}

export interface TruckScheduleInput {
  service_interval_km?:      number
  service_interval_months?:  number
  last_service_at?:          string
  last_service_odometer_km?: number
}

export interface CreateTruckInput extends TruckScheduleInput {
  plate_number: string
  model_id?:    string | null
  odometer_km:  number
  odometer_photo_url?: string | null
  created_by?:  string | null
}

export interface UpdateTruckInput extends TruckScheduleInput {
  /** Only while the vehicle has no reading yet (setting up an older truck). */
  odometer_km?:  number
  plate_number?: string
  model_id?:     string | null
  status?:       'available' | 'recheck_due' | 'in_use' | 'under_maintenance' | 'inactive' | 'archived'
  /** `null` unpairs the vehicle; absent leaves the pairing untouched. */
  assigned_driver_id?: string | null
}

export interface CreateTruckModelInput {
  name:               string
  vehicle_type:       string
  length_mm:          number
  width_mm:           number
  height_mm:          number
  suitable_for?:      string | null
  stackable_friendly?: boolean
  max_volume_cbm?:    number | null
  max_weight_kg?:     number | null
  max_length_cm?:     number | null
  image_url:          string
}

export interface UpdateTruckModelInput {
  name?:               string
  vehicle_type?:       string
  length_mm?:          number
  width_mm?:           number
  height_mm?:          number
  suitable_for?:       string | null
  stackable_friendly?: boolean
  max_volume_cbm?:     number | null
  max_weight_kg?:      number | null
  max_length_cm?:      number | null
  image_url?:          string | null
}