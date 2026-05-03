export interface TruckModel {
  model_id: string
  name: string 
  body_type?: string | null
  dimension_mm?: string | null
  suitable_for?: string | null
  stackable_friendly?: boolean 
  max_volume_cbm?: number | null 
  max_weight_kg?: number | null
  max_length_cm?: number | null  
  image_url?: string | null 
  created_at: string
}

export interface Truck {
  truck_id: string
  plate_number: string
  truck_type: string 
  model_id?: string | null
  truck_model?: TruckModel | null
  status: 'available' | 'in_use' | 'under_maintenance' | 'inactive' | 'archived'
  owned_by: 'company' | 'vendor'
  vendor_id?: string | null
  created_at: string
  updated_at: string
}

export interface CreateTruckInput {
  plate_number: string
  truck_type: string
  model_id?: string | null
  owned_by: 'company' | 'vendor'
  vendor_id?: string | null
  created_by?: string | null
}

export interface UpdateTruckInput {
  plate_number?: string
  truck_type?: string
  model_id?: string | null
  status?: 'available' | 'in_use' | 'under_maintenance' | 'inactive' | 'archived'
  owned_by?: 'company' | 'vendor'
  vendor_id?: string | null
}

export interface CreateTruckModelInput {
  name: string
  body_type?: string | null
  dimension_mm?: string | null
  suitable_for?: string | null
  stackable_friendly?: boolean
  max_volume_cbm?: number | null
  max_weight_kg?: number | null
  max_length_cm?: number | null
  image_url: string
}

export interface UpdateTruckModelInput {
  name?: string
  body_type?: string | null
  dimension_mm?: string | null
  suitable_for?: string | null
  stackable_friendly?: boolean
  max_volume_cbm?: number | null
  max_weight_kg?: number | null
  max_length_cm?: number | null
  image_url?: string | null
}