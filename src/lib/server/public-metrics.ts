/**
 * The landing page's live delivery figures (backend GET /api/public/metrics).
 *
 * Fetched on the server and re-validated every 10 minutes, so visitors never
 * call the backend themselves and the page stays fast. Any failure resolves to
 * null; the section then shows dashes rather than breaking the page.
 */

export interface PublicMetrics {
  onTimeRate:          number | null
  deliverySuccessRate: number | null
  shipmentsManaged:    number
  dropOffsDelivered:   number
  clientsServed:       number
}

export async function getPublicMetrics(): Promise<PublicMetrics | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/metrics`, {
      next: { revalidate: 600 },
    })
    if (!res.ok) return null
    const body = await res.json()
    return (body?.data as PublicMetrics) ?? null
  } catch {
    return null
  }
}
