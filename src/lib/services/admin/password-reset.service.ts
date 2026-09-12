import proxyApi from '@/lib/api/auth.api'

interface ApiResponse<T> {
  status:   string
  data:     T
  message?: string
}

export type ResetRequestStatus =
  | 'pending' | 'sent' | 'completed' | 'cancelled' | 'expired'

export interface PasswordResetRequest {
  request_id:       string
  user_id:          string
  email:            string
  requested_role:   string
  handler_group:    'company_admin' | 'it_admin'
  status:           ResetRequestStatus
  token_expires_at: string | null
  sent_by:          string | null
  sent_at:          string | null
  completed_at:     string | null
  created_at:       string
  first_name:       string | null
  last_name:        string | null
}

const B = '/admin'

/**
 * The caller's own reset queue.
 *
 * There is no group parameter on purpose: the API derives the queue from the
 * caller's role, so the Company Admin and the IT Admin each see only their own
 * requests and neither can read the other's by asking.
 */
export const passwordResetService = {
  list: (includeClosed = false) =>
    proxyApi
      .get<ApiResponse<PasswordResetRequest[]>>(`${B}/password-resets`, {
        params: includeClosed ? { include_closed: 'true' } : undefined,
      })
      .then((r) => r.data.data ?? []),

  send: (requestId: string) =>
    proxyApi
      .post<ApiResponse<PasswordResetRequest>>(`${B}/password-resets/${requestId}/send`)
      .then((r) => r.data.data),

  cancel: (requestId: string) =>
    proxyApi
      .patch<ApiResponse<PasswordResetRequest>>(`${B}/password-resets/${requestId}/cancel`)
      .then((r) => r.data.data),
}
