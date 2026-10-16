/**
 * Why a driver paused a delivery, in words. Shared by the staff views and the
 * client's tracking page — the reason category is the one part of a pause the
 * client is shown.
 */

export type PauseReason =
  | 'weather'
  | 'vehicle_breakdown'
  | 'pickup_closed'
  | 'dropoff_closed'
  | 'road_closed'
  | 'other'

export const PAUSE_REASON_LABEL: Record<PauseReason, string> = {
  weather:           'Bad weather',
  vehicle_breakdown: 'Vehicle breakdown',
  pickup_closed:     'Pickup point closed',
  dropoff_closed:    'Drop-off point closed',
  road_closed:       'Road closed',
  other:             'Other',
}

export function pauseReasonLabel(reason: string | null | undefined): string {
  return PAUSE_REASON_LABEL[reason as PauseReason] ?? 'Paused'
}
