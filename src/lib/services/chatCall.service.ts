import proxyApi from '@/lib/api/auth.api'

/** A call from a direct conversation, as either end shows it. */
export interface ChatCallView {
  call_id:         string
  conversation_id: string
  caller_id:       string
  caller_name:     string
  caller_role:     string
  callee_id:       string
  callee_name:     string
  callee_role:     string
  status:          'ringing' | 'answered' | 'ended' | 'missed' | 'declined'
  created_at:      string
}

export interface JoinedCall {
  call:  ChatCallView
  url:   string
  token: string
}

interface ApiResponse<T> {
  success: boolean
  data:    T
}

export const chatCallService = {
  /** Ring the other person in this conversation. 409 when either of you is on a call. */
  start: async (conversationId: string): Promise<JoinedCall & { ring_seconds: number }> => {
    const { data } = await proxyApi.post<ApiResponse<JoinedCall & { ring_seconds: number }>>(
      '/messaging/calls',
      { conversation_id: conversationId },
    )
    return data.data
  },

  /** Calls ringing for me right now — for a page that just opened. */
  ringing: async (): Promise<ChatCallView[]> => {
    const { data } = await proxyApi.get<ApiResponse<ChatCallView[]>>('/messaging/calls/ringing')
    return data.data ?? []
  },

  answer: async (callId: string): Promise<JoinedCall> => {
    const { data } = await proxyApi.post<ApiResponse<JoinedCall>>(
      `/messaging/calls/${encodeURIComponent(callId)}/answer`,
    )
    return data.data
  },

  decline: async (callId: string): Promise<void> => {
    await proxyApi.post(`/messaging/calls/${encodeURIComponent(callId)}/decline`)
  },

  end: async (callId: string, reason: 'hangup' | 'no_answer' | 'failed' = 'hangup', detail?: string): Promise<void> => {
    await proxyApi.post(`/messaging/calls/${encodeURIComponent(callId)}/end`, {
      reason,
      ...(detail ? { detail: detail.slice(0, 500) } : {}),
    })
  },
}
