export type BookingStatus =
  | 'BOOKED'
  | 'PENDING'
  | 'APPROVED'
  | 'ASSIGNED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED'

export function asBookingStatus(raw: string): BookingStatus | 'UNKNOWN' {
  const normalized = raw.replace(/\s+/g, '_').toUpperCase()
  const known: BookingStatus[] = [
    'BOOKED', 'PENDING', 'APPROVED', 'ASSIGNED',
    'IN_TRANSIT', 'ARRIVED', 'COMPLETED', 'CANCELLED',
  ]
  return (known as string[]).includes(normalized)
    ? (normalized as BookingStatus)
    : 'UNKNOWN'
}

export interface CargoGroup {
  id:            string
  pieces:        string
  looseLength:   string
  looseWidth:    string
  looseHeight:   string
  weight:        string
  weightUnit:    string
  perItem:       string
  nonTiltable:   boolean
  nonStackable:  boolean
  commodity:     string
  product:       string
  shc:           string
  additionalShc: string
  stackable:     boolean
  oversize:      boolean
}

export interface CargoSection {
  dropoffIndex: number
  groups:       CargoGroup[]
}

export interface ParsedCargoDetails {
  service:  string
  mode:     string
  sections: CargoSection[]
}

export interface BookingDetail {
  booking_id:       string
  reference_number?: string | null
  client_id:        string

  origin:             string
  origin_latitude?:   number | null
  origin_longitude?:  number | null

  truck_type_needed:  string
  cargo_details?:     string | null
  parsed_cargo?:      ParsedCargoDetails | null

  schedule_date:  string
  call_time:      string
  status:         string

  required_volume_cbm?:  number | null
  required_weight_kg?:   number | null
  required_length_cm?:   number | null
  stackable_required?:   boolean | null

  created_at?:         string
  updated_at?:         string

  total_cost?:         number | null
  estimated_delivery?: string | null

  transaction_documents?:  string[] | null
  payment_terms?:          string | null

  driver?: {
    driver_id?: string
    name?:      string
    truck?: {
      plate_number?: string
      vehicle_type?:   string
    }
  } | null

  booking_destinations?: {
    destination_id:  string
    address:         string
    sequence_order:  number
    status:          'pending' | 'delivered' | 'failed'
    delivered_at?:   string | null
    latitude?:       number | null
    longitude?:      number | null
  }[]

  vehicle?: {
    plate_number: string
    vehicle_type:   string
  } | null

  clients?: {
    client_id:      string
    company_name?:  string | null
  } | null

    booking_cargo_items?: {
    item_id:         string
    commodity_id?:   string | null
    commodity_text?: string | null
    product_id?:     string | null
    product_text?:   string | null
    shc_id?:         string | null
    shc_text?:       string | null
    ashc_id?:        string | null
    ashc_text?:      string | null
    quantity?:       number | null
    weight_kg?:      number | null
    volume_cbm?:     number | null
    length_cm?:      number | null
    width_cm?:       number | null
    height_cm?:      number | null
    notes?:          string | null
    commodities?:    { name: string; category?: string | null } | null
    products?:       { name: string; unit?: string | null } | null
    shc?:            { code: string; name: string; type: string } | null
    ashc?:           { code: string; name: string; type: string } | null
  }[]
}

export interface OptimizedStop {
  destination_id:           string
  address:                  string
  latitude:                 number
  longitude:                number
  optimized_sequence_order: number
  status:                   'pending' | 'delivered' | 'failed'
  notes?:                   string | null
  estimated_arrival?:       string
  total_duration?:          number
}

export interface OptimizeRouteResponse {
  booking_id:   string
  total_stops:  number

  origin: {
    address:   string
    latitude:  number
    longitude: number
  }

  optimized_stops: OptimizedStop[]

  total_duration?: number
  total_distance?: number
}