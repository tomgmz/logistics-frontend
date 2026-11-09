'use client'

import { useCallback, useMemo, useState } from 'react'
import authApi, { initCsrf } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/store/auth.store'
import { useApiQuery } from '@/lib/query/useApiQuery'
import { getApiErrorMessage } from '@/lib/api-error'
import type { OptimizedStop, OptimizeRouteResponse, BookingDetail } from '@/app/types/maps/routemap.types'
import type { BookingWithRelations } from '@/lib/types/booking-relations'

/**
 * Bookings + the selected booking's route and detail, for the tracking maps
 * (staff Transit Tracking, the client's tracking map). TanStack Query replaces
 * the old Redux routeMap slice; the selection is this screen's own state.
 *
 * - The list loads for the signed-in user (a client: only their company's).
 * - Picking a booking shows its last route at once if it was opened before,
 *   and always re-reads it.
 */
export function useRouteMap(initialSelectedId: string | null = null) {
  const user     = useAuthStore((s) => s.user)
  const clientId = user?.role === 'client' ? user.clients?.client_id ?? null : null

  const list = useApiQuery<BookingWithRelations[]>(
    ['route-map', 'bookings', user?.role ?? '', clientId ?? ''],
    async () => {
      if (user?.role === 'client') {
        if (!clientId) throw new Error('Client ID not found. Please log out and log in again.')
        const res = await authApi.get(`/booking/client/${clientId}`)
        return (res.data?.data ?? []) as BookingWithRelations[]
      }
      const res = await authApi.get('/booking')
      return (res.data?.data ?? []) as BookingWithRelations[]
    },
    { enabled: !!user },
  )

  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  // A new starting booking from the address (e.g. ?booking=) selects it.
  const [lastInitial, setLastInitial] = useState(initialSelectedId)
  if (initialSelectedId !== lastInitial) {
    setLastInitial(initialSelectedId)
    if (initialSelectedId) setSelectedId(initialSelectedId)
  }

  const route = useApiQuery<{ routeData: OptimizeRouteResponse; bookingDetail: BookingDetail }>(
    ['route-map', 'route', selectedId ?? ''],
    async () => {
      await initCsrf()
      const [routeRes, detailRes] = await Promise.all([
        authApi.get(`/route-optimization/${selectedId}`),
        authApi.get(`/booking/${selectedId}`),
      ])
      return {
        routeData:     routeRes.data?.data as OptimizeRouteResponse,
        bookingDetail: detailRes.data?.data as BookingDetail,
      }
    },
    { enabled: !!selectedId },
  )

  // A Refresh shows as loading; the quiet background re-reads don't.
  const [manualRoute, setManualRoute] = useState(0)

  const routeData     = route.data?.routeData ?? null
  const bookingDetail = route.data?.bookingDetail ?? null
  const stops = useMemo<OptimizedStop[]>(
    () => [...(routeData?.optimized_stops ?? [])].sort((a, b) => a.optimized_sequence_order - b.optimized_sequence_order),
    [routeData],
  )
  const encodedPolyline = (() => {
    const ext = routeData as unknown as { encoded_polyline?: string; encodedPolyline?: string } | null
    return ext?.encoded_polyline ?? ext?.encodedPolyline ?? null
  })()

  const listRefetch  = list.refetch
  const routeRefetch = route.refetch

  const loadBookings = useCallback(() => { void listRefetch() }, [listRefetch])
  const select       = useCallback((id: string) => setSelectedId(id), [])
  const clear        = useCallback(() => setSelectedId(null), [])
  const reloadRoute  = useCallback(async () => {
    if (!selectedId) return
    setManualRoute((n) => n + 1)
    try { await routeRefetch() } finally { setManualRoute((n) => n - 1) }
  }, [routeRefetch, selectedId])
  // A change the driver made (route_changed): re-read without a spinner.
  const refreshRoute = useCallback(() => { if (selectedId) void routeRefetch() }, [routeRefetch, selectedId])

  return {
    bookings:      list.data ?? [],
    listLoading:   list.isPending && !!user,
    listError:     list.data === undefined && list.error ? getApiErrorMessage(list.error, 'Failed to load bookings') : null,
    selectedId,
    routeData,
    bookingDetail,
    stops,
    encodedPolyline,
    detailLoading: !!selectedId && (route.isPending || manualRoute > 0),
    detailError:   route.data === undefined && route.error ? getApiErrorMessage(route.error, 'Failed to load route') : null,
    loadBookings,
    select,
    clear,
    reloadRoute,
    refreshRoute,
  }
}
