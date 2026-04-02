export type BookingStatus = 'BOOKED' | 'IN TRANSIT' | 'ARRIVED' | 'CANCELED'

export interface BookingDetail {
  booking_id: string
  origin: string
  status: string
  schedule_date: string
  call_time: string
  truck_type_needed: string
  required_weight_kg?: number
  required_volume_cbm?: number
  cargo_details?: string
  booking_destinations?: {
    destination_id: string
    address: string
    sequence_order: number
    status: 'pending' | 'delivered' | 'failed'
    notes?: string | null
  }[]
  vehicle?: { plate_number?: string } | null
}