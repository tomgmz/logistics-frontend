import proxyApi from '@/lib/api/auth.api'

/**
 * Driver app releases (IT Admin). The APK goes straight from the browser to
 * Cloudflare R2 through a presigned URL — it is far over the Vercel proxy's
 * body limit — and only the version details go through the API.
 */

export interface AppRelease {
  release_id:  string
  version:     string
  notes:       string | null
  file_url:    string
  size_bytes:  number
  created_at:  string
  uploaded_by: string | null
}

interface ApiResponse<T> { status: string; data: T }

const B = '/admin/app-releases'

/** PUT the file to R2 with upload progress (fetch has no upload progress). */
function putToR2(url: string, file: File, contentType: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(`Upload failed (${xhr.status}). Check the R2 bucket's CORS settings.`)))
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and the R2 bucket\'s CORS settings.'))
    xhr.send(file)
  })
}

export const appReleaseService = {
  list: async () => (await proxyApi.get<ApiResponse<AppRelease[]>>(B)).data.data,

  /** Upload the APK, then publish it as the newest version. */
  async publish(
    file: File,
    details: { version: string; notes: string },
    onProgress: (pct: number) => void,
  ): Promise<AppRelease> {
    const { data: slot } = await proxyApi.post<ApiResponse<{ key: string; upload_url: string; content_type: string }>>(
      `${B}/upload-url`,
      { file_name: file.name, size_bytes: file.size },
    )
    await putToR2(slot.data.upload_url, file, slot.data.content_type, onProgress)
    const { data } = await proxyApi.post<ApiResponse<AppRelease>>(B, {
      key:     slot.data.key,
      version: details.version.trim(),
      notes:   details.notes.trim() || null,
    })
    return data.data
  },
}
