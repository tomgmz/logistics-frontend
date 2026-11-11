import { expandCode } from '@/lib/roles'

/**
 * What the Action column of the audit logs and the Source column of the system
 * logs show: words, never the stored code ("booking_approved" → "Booking
 * approved"). The stored code stays the same; search still matches it.
 */

// Codes whose plain reading would be wrong or unclear. Everything else is
// read word by word (see humanise).
const AUDIT_ACTION_LABEL: Record<string, string> = {
  login:                                  'Signed in',
  login_succeeded:                        'Signed in with password',
  logout:                                 'Signed out',
  passkey_auth_success:                   'Signed in with passkey',
  passkey_registered:                     'Passkey added',
  account_locked:                         'Account locked',
  account_permanently_locked:             'Account locked for good',
  password_reset_link_sent:               'Password reset link sent',
  permissions_updated:                    'Access changed',
  module_permissions_updated:             'Access changed',
  booking_approved_to_ops:                'Booking approved, sent to the Operations Manager',
  gm_approved:                            'Approved by the General Manager',
  booking_cancelled:                      'Booking rejected',
  booking_completion_confirmed_by_client: 'Client confirmed completion',
  booking_delivery_issue_reported:        'Client reported a problem',
  booking_delivery_issue_resolved:        'Reported problem resolved',
  booking_documents_uploaded:             'Booking documents uploaded',
  booking_trips_planned:                  'Trips planned',
  booking_crew_replaced:                  'Driver and vehicle replaced',
  booking_driver_vehicle_replaced:        'Driver and vehicle replaced',
  assignment_capacity_warning:            'Assigned despite a fit warning',
  driver_booking_delivered:               'All drop-offs delivered',
  driver_started_delivery:                'Delivery started',
  driver_started_delivery_early:          'Delivery started early',
  driver_stop_order_changed:              'Drop-off order changed',
  driver_trip_completed:                  'Trip completed',
  driver_trip_paused:                     'Paused by the driver',
  driver_trip_resumed:                    'Resumed by the driver',
  staff_trip_paused:                      'Paused by the office',
  staff_trip_resumed:                     'Resumed by the office',
  trip_paused:                            'Delivery paused',
  pause_continuation_set:                 'Continuation date set',
  driver_trip_pickup_confirmed:           'Loading confirmed',
  driver_trip_pickup_confirmed_early:     'Loading confirmed early',
  driver_trip_pickup_confirmed_off_site:  'Loading confirmed away from the pickup',
  driver_trip_stop_confirmed:             'Drop-off confirmed',
  driver_trip_stop_confirmed_off_site:    'Drop-off confirmed away from the stop',
  stop_confirmed:                         'Drop-off confirmed',
  trip_started:                           'Navigation started',
  office_incident_reported:               'Problem reported by the office',
  late_confirmation_flagged:              'Late confirmation sent to the office',
  late_confirmation_accepted:             'Late confirmation accepted',
  late_confirmation_accepted_auto:        'Late confirmation recorded (passed checks)',
  late_confirmation_dismissed:            'Late confirmation dismissed',
  driver_set_availability_days:           'Available days set',
  driver_fleet_return_confirmed:          'Vehicle back at the yard',
  driver_quick_alert:                     'Quick alert raised',
  driver_emergency_call:                  'Emergency call placed',
  emergency_call_answered:                'Emergency call answered',
  driver_report_filed:                    'Driver report filed',
  vehicle_odometer_return:                'Return odometer recorded',
  vehicle_inspection_passed:              'BLOWBAGETS inspection passed',
  vehicle_inspection_failed:              'BLOWBAGETS inspection failed',
  vehicle_driver_paired:                  'Regular driver set',
  vehicle_driver_unpaired:                'Regular driver removed',
  vehicle_registration_updated:           'Registration date updated',
  external_driver_invited:                'Vendor driver invited',
  external_driver_provisioned:            'Vendor driver registered',
  external_driver_restored:               'Vendor driver access restored',
  external_driver_revoked:                'Vendor driver access revoked',
  driver_license_changed:                 'Driver license changed',
  contract_updated:                       'Contract date saved',
  app_release_published:                  'Driver app published',
  message_unsent:                         'Message unsent',
  export:                                 'Exported',
  support_ticket_opened:                  'Support ticket opened',
  support_ticket_resolved:                'Support ticket resolved',
}

// Words that keep their capitals wherever they appear.
const PROPER: [RegExp, string][] = [
  [/\bit administrator\b/g,      'IT Administrator'],
  [/\badministrator\b/g,         'Company Administrator'],
  [/\bgeneral manager\b/g,       'General Manager'],
  [/\boperations manager\b/g,    'Operations Manager'],
  [/\bfleet manager\b/g,         'Fleet Manager'],
  [/\bblowbagets\b/g,            'BLOWBAGETS'],
  [/\botp\b/g,                   'code'],
]

function humanise(code: string): string {
  let s = expandCode(code).replace(/[_.\-]+/g, ' ').trim().toLowerCase()
  for (const [rx, rep] of PROPER) s = s.replace(rx, rep)
  s = s.replace(/\bcompany company\b/gi, 'Company')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "booking_approved" → "Booking approved". */
export function auditActionLabel(code: string | null | undefined): string {
  if (!code) return '—'
  const expanded = expandCode(code)
  return AUDIT_ACTION_LABEL[expanded] ?? AUDIT_ACTION_LABEL[code] ?? humanise(code)
}

// Where a system row came from, in words.
const SYSTEM_SOURCE_LABEL: Record<string, string> = {
  'auth.service':                  'Sign-in',
  'auth.middleware':               'Sign-in check',
  'auth.authorize':                'Permission check',
  'auth.moduleAccess':             'Module access check',
  'rate-limit.authLimiter':        'Sign-in rate limit',
  'webauthn.service':              'Passkeys',
  'breakdown.scheduler':           'Breakdown reminders',
  'late-confirmation.scheduler':   'Late confirmation reminders',
  'completion.scheduler':          'Delivery auto-completion',
  'contract-expiry.scheduler':     'Contract expiry reminders',
  'delay.scheduler':               'Delay check',
  'driver-call.scheduler':         'Driver call time reminders',
  'fleet-recheck.scheduler':       'Vehicle re-check reminders',
  'it-admin-render.scheduler':     'IT Administrator handover',
  'license-expiry.scheduler':      'License expiry reminders',
  'pause-continuation.scheduler':  'Pause continuation reminders',
  'registration-expiry.scheduler': 'Registration expiry reminders',
  'tracking.pruneLocationHistory': 'Location history clean-up',
  'tracking.device':               'Driver phone tracking',
  'fleet-availability':            'Driver and vehicle status',
  database:                        'Database',
  'log-event':                     'Audit log writer',
  brevo:                           'Email (Brevo)',
  'brevo-mailer':                  'Email (Brevo)',
  'brevo.delivery':                'Email delivery',
  'brevo.webhook':                 'Email delivery webhook',
  'livekit.config':                'Emergency call setup',
  'livekit.connect':               'Emergency call connection',
  'maps.routes':                   'Google Maps routes',
  'push.web':                      'Web push notifications',
  'storage.sign':                  'File storage',
  'booking.service':               'Bookings',
  'global-error-handler':          'Server',
}

/** "breakdown.scheduler" → "Breakdown reminders"; unknown ones read word by word. */
export function systemSourceLabel(source: string | null | undefined): string {
  if (!source) return '—'
  if (SYSTEM_SOURCE_LABEL[source]) return SYSTEM_SOURCE_LABEL[source]
  // "foo-bar.scheduler" → "Foo bar scheduler"; camelCase parts split too.
  return humanise(source.replace(/([a-z])([A-Z])/g, '$1 $2'))
}
