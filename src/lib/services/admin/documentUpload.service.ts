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
  /**
   * `existingUrls`: documents already on the booking that stay (Edit &
   * Resubmit), so the server can number a same-named file and refuse one
   * that is already attached.
   */
  uploadBookingDocuments: (files: File[], bookingRef?: string, existingUrls: string[] = []) => {
    const form = new FormData()
    files.forEach((f) => form.append('documents', f))
    if (bookingRef) form.append('booking_ref', bookingRef)
    existingUrls.forEach((u) => form.append('existing_urls', u))

    return post<UploadDocumentsResponse>(
      `${B}/booking-documents`,
      form,
      { 'Content-Type': 'multipart/form-data' },
    )
  },

}