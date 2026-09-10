import { TruckModel } from "./truck-model"
import type { BlowbagetsItems } from "@/lib/services/client/booking.service"

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
  status:       'available' | 'in_use' | 'under_maintenance' | 'inactive' | 'archived'
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
  created_at:   string
  updated_at:   string
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

export interface CreateTruckInput {
  plate_number: string
  model_id?:    string | null
  created_by?:  string | null
}

export interface UpdateTruckInput {
  plate_number?: string
  model_id?:     string | null
  status?:       'available' | 'in_use' | 'under_maintenance' | 'inactive' | 'archived'
  /** `null` unpairs the vehicle; absent leaves the pairing untouched. */
  assigned_driver_id?: string | null
}

export interface CreateTruckModelInput {
  name:               string
  vehicle_type:       string
  dimension_mm?:      string | null
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
  dimension_mm?:       string | null
  suitable_for?:       string | null
  stackable_friendly?: boolean
  max_volume_cbm?:     number | null
  max_weight_kg?:      number | null
  max_length_cm?:      number | null
  image_url?:          string | null
}