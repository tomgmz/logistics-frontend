/**
 * The driver app version the /download page offers (backend GET
 * /api/public/app-release). Read on the server and re-validated every minute,
 * so a newly published APK appears quickly. Any failure resolves to null and the
 * page says the download is not available yet.
 */

export interface AppRelease {
  version:    string
  notes:      string | null
  file_url:   string
  size_bytes: number
  created_at: string
}

export async function getLatestAppRelease(): Promise<AppRelease | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/app-release`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const body = await res.json()
    return (body?.data as AppRelease) ?? null
  } catch {
    return null
  }
}
