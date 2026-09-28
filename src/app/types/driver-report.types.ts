import type { BlowbagetsKey } from '@/lib/services/client/booking.service'

/**
 * An incident a driver raised from the road — the driver app's Reports tab.
 * Mirrors logistics-backend/src/types/driver/report.types.ts.
 *
 * 'quick'    — the SOS: sent under a countdown, may carry nothing but a position
 * 'detailed' — the full form (or a quick alert the driver filled in afterwards)
 */
export type ReportSource = 'quick' | 'detailed'

export type IncidentType =
  | 'accident'
  | 'vehicle_breakdown'
  | 'health_emergency'
  | 'security_threat'

/** 'reported' — nobody has picked it up; 'acknowledged' — seen; 'resolved' — dealt with. */
export type ReportStatus = 'reported' | 'acknowledged' | 'resolved'

interface PersonName {
  first_name: string | null
  last_name:  string | null
}

export interface DriverReport {
  report_id:  string
  driver_id:  string
  booking_id: string | null
  truck_id:   string | null

  source:        ReportSource
  /** NULL on a quick alert sent without picking a tile — "Unspecified Emergency". */
  incident_type: IncidentType | null
  sub_type:      string | null
  description:   string | null

  photo_urls: string[]
  video_urls: string[]

  latitude:   number | null
  longitude:  number | null
  accuracy_m: number | null
  address:    string | null

  /**
   * The driver's roadside re-check (breakdowns only). A tick means "I looked at
   * this", NOT "this passed" — an unticked item was not checked, never failed.
   */
  blowbagets_check:  { items: Record<BlowbagetsKey, boolean>; checked_at: string } | null
  trip_can_continue: boolean | null

  status:          ReportStatus
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_by:     string | null
  resolved_at:     string | null
  resolution_note: string | null

  created_at: string
  updated_at: string

  bookings?: { booking_id: string; reference_number: string | null; origin: string } | null
  trucks?:   { truck_id: string; plate_number: string; truck_models?: { name: string | null; vehicle_type: string | null } | null } | null
  drivers?:  { driver_id: string; users?: (PersonName & { phone: string | null }) | null } | null
  acknowledger?: PersonName | null
  resolver?:     PersonName | null
}

/**
 * Incidents about the VEHICLE — all the fleet manager's Reports view shows. An
 * unclassified alert is not one until the desk classifies it.
 */
export const VEHICLE_INCIDENTS: IncidentType[] = ['vehicle_breakdown', 'accident']

export function isVehicleIncident(type: IncidentType | null | undefined): boolean {
  return !!type && VEHICLE_INCIDENTS.includes(type)
}

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  accident:          'Accident',
  vehicle_breakdown: 'Vehicle Breakdown',
  health_emergency:  'Health Emergency',
  security_threat:   'Security Threat',
}

export function incidentLabel(type: IncidentType | null): string {
  return type ? INCIDENT_LABELS[type] : 'Unspecified Emergency'
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  reported:     'New',
  acknowledged: 'Acknowledged',
  resolved:     'Resolved',
}

/** Same rule the backend uses to pick `driver.emergency` over `driver.report`. */
export function isUrgentReport(r: Pick<DriverReport, 'source' | 'trip_can_continue'>): boolean {
  return r.source === 'quick' || r.trip_can_continue === false
}

export function personName(p: PersonName | null | undefined): string | null {
  if (!p) return null
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null
}

export function reportDriverName(r: DriverReport): string {
  return personName(r.drivers?.users) ?? 'Unknown driver'
}
