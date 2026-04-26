/**
 * TRUCK MODEL TYPE - Matches Your Actual Supabase Schema
 * 
 * ✅ All fields verified against your database
 */

export interface TruckModel {
  model_id: string
  name: string                      // ✅ Your DB field (not 'model_name')
  body_type?: string | null         // ✅ e.g., 'Closed Van', 'Wing Van', 'Refrigerated'
  dimension_mm?: string | null      // ✅ Your DB field (format: "6000 x 2400 x 2400")
  suitable_for?: string | null      // ✅ Text description of cargo types
  stackable_friendly?: boolean      // ✅ Your DB uses underscore, not camelCase
  max_volume_cbm?: number | null    // ✅ Maximum cargo volume in cubic meters
  max_weight_kg?: number | null     // ✅ Maximum weight capacity in kg
  max_length_cm?: number | null     // ✅ Maximum cargo length in cm
  image_url?: string | null         // Model photo (shown in fleet UI when joined)
  created_at: string
}

/**
 * TRUCK TYPE - Matches Your Actual Supabase Schema
 */

export interface Truck {
  truck_id: string
  plate_number: string
  truck_type: string                                    // e.g., 'truck', 'wing_van'
  capacity_tons: number
  model_id?: string | null
  truck_model?: TruckModel | null                       // Joined data from truck_models
  status: 'available' | 'in_use' | 'under_maintenance' | 'inactive' | 'archived'
  owned_by: 'company' | 'vendor'
  vendor_id?: string | null
  created_at: string
  updated_at: string
}

/**
 * CREATE TRUCK INPUT - For API requests
 */

export interface CreateTruckInput {
  plate_number: string
  truck_type: string
  capacity_tons: number
  model_id?: string | null
  owned_by: 'company' | 'vendor'
  vendor_id?: string | null
  created_by?: string | null
}

/**
 * UPDATE TRUCK INPUT - For API requests
 */

export interface UpdateTruckInput {
  plate_number?: string
  truck_type?: string
  capacity_tons?: number
  model_id?: string | null
  status?: 'available' | 'in_use' | 'under_maintenance' | 'inactive' | 'archived'
  owned_by?: 'company' | 'vendor'
  vendor_id?: string | null
}

/**
 * SAMPLE DATA STRUCTURE
 * 
 * This is what your API returns when you call GET /trucks:
 */

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