export interface TruckModel {
  model_id:           string
  name:               string
  vehicle_type?:         string | null
  dimension_mm?:      string | null
  suitable_for?:      string | null
  stackable_friendly: boolean
  max_volume_cbm?:    number | null
  max_weight_kg?:     number | null
  max_length_cm?:     number | null
  // Cargo bed dimensions. Already returned by the API (it selects *), they were
  // simply never declared here — so the pallet floor-space check had nothing to
  // measure against.
  length_mm?:         number | null
  width_mm?:          number | null
  height_mm?:         number | null
  image_url?:         string | null
  created_at?:        string
}