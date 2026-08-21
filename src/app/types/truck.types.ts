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
  created_at:   string
  updated_at:   string
}

/** True when this vehicle is cleared for operations to assign. */
export function isRoadworthy(truck: Pick<Truck, 'latest_inspection'>): boolean {
  return truck.latest_inspection?.passed === true
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