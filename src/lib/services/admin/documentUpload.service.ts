import proxyApi, { initCsrf } from '@/lib/api/auth.api'

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
}

export interface UploadedDocumentMeta {
  url:           string
  public_id:     string
  original_name: string
  format:        string
  bytes:         number
}

export interface UploadDocumentsResponse {
  urls:  string[]
  files: UploadedDocumentMeta[]
}

async function post<T>(url: string, payload: unknown, headers?: Record<string, string>): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.post<ApiResponse<T>>(url, payload, { headers })
  return data.data
}

const B = '/uploads'

export const uploadService = {
  uploadBookingDocuments: (files: File[], bookingRef?: string) => {
    const form = new FormData()
    files.forEach((f) => form.append('documents', f))
    if (bookingRef) form.append('booking_ref', bookingRef)

    return post<UploadDocumentsResponse>(
      `${B}/booking-documents`,
      form,
      { 'Content-Type': 'multipart/form-data' },
    )
  },

  /**
   * Billing attachments: a client's billing summary, or proof that a payment
   * made outside the system happened. Filed apart from booking paperwork so a
   * finance audit does not have to sift delivery documents to find them.
   */
  uploadBillingDocuments: (files: File[], ref?: string) => {
    const form = new FormData()
    files.forEach((f) => form.append('documents', f))
    if (ref) form.append('ref', ref)

    return post<UploadDocumentsResponse>(
      `${B}/billing-documents`,
      form,
      { 'Content-Type': 'multipart/form-data' },
    )
  },
}