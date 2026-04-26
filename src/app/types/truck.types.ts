
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
  capacity_tons: number
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
  capacity_tons: number
  model_id?: string | null
  owned_by: 'company' | 'vendor'
  vendor_id?: string | null
  created_by?: string | null
}

export interface UpdateTruckInput {
  plate_number?: string
  truck_type?: string
  capacity_tons?: number
  model_id?: string | null
  status?: 'available' | 'in_use' | 'under_maintenance' | 'inactive' | 'archived'
  owned_by?: 'company' | 'vendor'
  vendor_id?: string | null
}


/*
{
  "status": "success",
  "data": [
    {
      "truck_id": "uuid-here",
      "plate_number": "ABC 1234",
      "truck_type": "truck",
      "capacity_tons": 4,
      "model_id": "model-uuid",
      "truck_model": {
        "model_id": "model-uuid",
        "name": "Isuzu NQR 4HK1",
        "body_type": "Closed Van",
        "dimension_mm": "6000 x 2400 x 2400",
        "suitable_for": "Medium cargo, FMCG deliveries",
        "stackable_friendly": true,
        "max_volume_cbm": 34.56,
        "max_weight_kg": 4000,
        "max_length_cm": 600,
        "image_url": "/images/vehicles/isuzu-nqr.png"
      },
      "status": "available",
      "owned_by": "company",
      "created_at": "2025-01-15T08:00:00Z",
      "updated_at": "2025-01-15T08:00:00Z"
    }
  ]
}
*/