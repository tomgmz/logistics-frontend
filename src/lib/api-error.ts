interface ApiErrorBody {
  status?: string
  message?: string
  errors?: { field: string; message: string }[]
}

const WRAPPER_PREFIXES = [
  /^Auth Error:\s*/i,
  /^Auth error:\s*/i,
  /^Auth update failed:\s*/i,
  /^Client creation failed:\s*/i,
  /^Vendor creation failed:\s*/i,
  /^Driver creation failed:\s*/i,
  /^Accountant Creation Failed:\s*/i,
  /^Operations Admin Creation Failed:\s*/i,
  /^IT Admin Creation Failed:\s*/i,
  /^Human Resources Creation Failed:\s*/i,
  /^General Manager Creation Failed:\s*/i,
  /^Fleet Admin Creation Failed:\s*/i,
  /^Admin creation failed:\s*/i,
]

function unwrapServiceMessage(raw: string): string {
  let msg = raw.trim()
  for (const prefix of WRAPPER_PREFIXES) {
    if (prefix.test(msg)) {
      msg = msg.replace(prefix, '').trim()
    }
  }
  return msg
}

function looksTechnical(msg: string): boolean {
  return /duplicate key|unique constraint|violates|constraint|relation "|column "|syntax error|pg_|pgrst\d+|sql state|23505|23503|23502|22P02/i.test(
    msg,
  )
}

/** Map raw API / database / auth error text to a user-facing message. */
export function toUserFriendlyMessage(raw: string): string {
  const msg = unwrapServiceMessage(raw)
  const lower = msg.toLowerCase()

  if (lower.includes('duplicate key') || lower.includes('unique constraint') || lower.includes('23505')) {
    if (lower.includes('plate_number') || lower.includes('trucks_plate')) {
      return 'A vehicle with this plate number already exists.'
    }
    if (lower.includes('email') || lower.includes('users_email')) {
      return 'This email address is already registered.'
    }
    if (lower.includes('phone')) {
      return 'This phone number is already in use.'
    }
    if (lower.includes('model') || lower.includes('truck_models')) {
      return 'A truck model with this name already exists.'
    }
    return 'This value is already in use. Please try a different one.'
  }

  if (lower.includes('foreign key') || lower.includes('23503') || lower.includes('violates foreign key')) {
    return 'A related record could not be found. Please refresh the page and try again.'
  }

  if (lower.includes('not null') || lower.includes('23502')) {
    return 'Please fill in all required fields.'
  }

  if (
    lower.includes('already registered') ||
    lower.includes('email address has already been') ||
    lower.includes('user already registered')
  ) {
    return 'This email address is already registered.'
  }

  if (lower.includes('invalid email') || lower.includes('unable to validate email')) {
    return 'Please enter a valid email address.'
  }

  if (lower.includes('invalid phone') || lower.includes('phone number')) {
    return 'Please enter a valid phone number.'
  }

  if (lower.includes('password') && (lower.includes('weak') || lower.includes('short'))) {
    return 'Password does not meet security requirements. Use at least 8 characters.'
  }

  if (/booking with id [0-9a-f-]+ not found/i.test(msg)) {
    return 'Booking not found. It may have been removed.'
  }
  if (/driver with id [0-9a-f-]+ not found/i.test(msg)) {
    return 'Driver not found.'
  }
  if (/truck with id [0-9a-f-]+ not found/i.test(msg) || /no truck found with id/i.test(msg)) {
    return 'Vehicle not found.'
  }
  if (/no assignment found for booking/i.test(msg)) {
    return 'No driver assignment exists for this booking yet.'
  }
  if (/no delivery found for booking/i.test(msg)) {
    return 'No delivery record exists for this booking yet.'
  }
  if (/cannot assign a booking with status/i.test(msg)) {
    return 'This booking cannot be assigned in its current status.'
  }
  if (/cannot change status from/i.test(msg)) {
    return 'This status change is not allowed. You cannot move a booking backward in the workflow.'
  }
  if (lower.includes('failed to update booking status')) {
    return 'Could not update booking status. Please try again.'
  }
  if (lower.includes('failed to create assignment') || lower.includes('failed to update delivery')) {
    return 'Could not save assignment details. Please try again.'
  }

  if (
    lower.includes('network error') ||
    lower.includes('econnrefused') ||
    lower.includes('timeout') ||
    lower.includes('failed to fetch')
  ) {
    return 'Unable to reach the server. Check your connection and try again.'
  }

  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('403')) {
    return 'You do not have permission to perform this action.'
  }

  if (looksTechnical(msg)) {
    return 'Something went wrong. Please try again or contact support if the problem continues.'
  }

  return msg || 'Something went wrong. Please try again.'
}

function getResponseData(err: unknown): ApiErrorBody | undefined {
  const fromAxios = (err as { response?: { data?: ApiErrorBody } })?.response?.data
  if (fromAxios && typeof fromAxios === 'object') return fromAxios
  const direct = (err as { data?: ApiErrorBody })?.data
  if (direct && typeof direct === 'object') return direct
  return undefined
}

/** Single-line message for toasts and list/detail error banners. */
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const data = getResponseData(err)

  if (data?.errors?.length) {
    return data.errors
      .map((e) => {
        const field = e.field.replace(/_/g, ' ')
        const msg = toUserFriendlyMessage(e.message)
        return field ? `${field}: ${msg}` : msg
      })
      .join(' · ')
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    if (data.message.trim() === 'Validation failed') {
      return 'Please fix the highlighted fields.'
    }
    return toUserFriendlyMessage(data.message.trim())
  }

  if (err instanceof Error && err.message && !/^request failed with status code \d+$/i.test(err.message)) {
    return toUserFriendlyMessage(err.message)
  }

  return fallback
}

export function extractApiError(err: unknown): {
  message: string
  fieldErrors: Record<string, string>
} {
  const data = getResponseData(err)

  if (data && typeof data === 'object') {
    const { errors, message } = data
    if (Array.isArray(errors) && errors.length > 0) {
      const fieldErrors: Record<string, string> = {}
      for (const ve of errors) {
        const key = ve.field.includes('.') ? ve.field.split('.').pop()! : ve.field
        const friendly = toUserFriendlyMessage(ve.message)
        fieldErrors[key] = fieldErrors[key] ? `${fieldErrors[key]}\n${friendly}` : friendly
      }
      return { message: '', fieldErrors }
    }
    if (typeof message === 'string' && message.trim()) {
      if (message.trim() === 'Validation failed') {
        return { message: 'Please fix the highlighted fields.', fieldErrors: {} }
      }
      return { message: toUserFriendlyMessage(message.trim()), fieldErrors: {} }
    }
  }

  if (err instanceof Error && err.message) {
    return {
      message: toUserFriendlyMessage(err.message),
      fieldErrors: {},
    }
  }

  return { message: 'Something went wrong. Please try again.', fieldErrors: {} }
}
