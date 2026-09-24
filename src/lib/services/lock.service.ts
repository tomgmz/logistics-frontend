import proxyApi from '@/lib/api/auth.api'

/**
 * Record locks — one staff member edits a record at a time.
 *
 * The server is the gate: every write to a lockable record is refused with 423
 * while someone else holds its lock. These calls only let a screen take the
 * lock up front, keep it alive, and show everyone else who has it.
 * See logistics-backend/src/lib/record-lock.ts.
 */

export type LockType =
  | 'booking'
  | 'user'
  | 'truck'
  | 'truck_model'
  | 'driver_report'
  | 'password_reset'
  | 'handling_code'
  | 'commodity'
  | 'product'
  | 'landline_prefix'

export interface LockView {
  resource_type:    LockType
  resource_id:      string
  locked:           boolean
  held_by_me:       boolean
  holder_name:      string | null
  expires_at:       string | null
  /** Successful writes to the record so far. Higher than what you loaded = your copy is stale. */
  write_seq:        number
  last_write_by_me: boolean
  /** Server has no lock table yet (migration pending): treat as unlocked. */
  unavailable?:     boolean
}

interface ApiResponse<T> { status: string; data: T }

const path = (type: LockType, id?: string) =>
  id ? `/locks/${type}/${encodeURIComponent(id)}` : `/locks/${type}`

export const lockService = {
  get: async (type: LockType, id: string) =>
    (await proxyApi.get<ApiResponse<LockView>>(path(type, id))).data.data,

  list: async (type: LockType) =>
    (await proxyApi.get<ApiResponse<LockView[]>>(path(type))).data.data,

  /** Acquire or renew. Resolves either way — check `held_by_me`. */
  acquire: async (type: LockType, id: string) =>
    (await proxyApi.post<ApiResponse<LockView>>(path(type, id))).data.data,

  release: async (type: LockType, id: string) => {
    await proxyApi.delete(path(type, id))
  },

  /**
   * Release from `pagehide`/unmount-on-unload, where an axios promise would be
   * cancelled with the page. `keepalive` lets the request outlive it.
   */
  releaseOnUnload: (type: LockType, id: string) => {
    if (typeof document === 'undefined') return
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    try {
      void fetch(`/api/proxy${path(type, id)}`, {
        method:      'DELETE',
        credentials: 'include',
        keepalive:   true,
        headers:     match ? { 'X-CSRF-Token': decodeURIComponent(match[1]) } : undefined,
      }).catch(() => {})
    } catch {
      /* the lock lapses on its own within a minute */
    }
  },
}

/** Is this error the server's "someone else is editing" refusal? */
export function isRecordLockedError(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: { code?: string } } })?.response
  return res?.status === 423 || res?.data?.code === 'RECORD_LOCKED'
}
