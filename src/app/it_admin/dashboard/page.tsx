'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import {
  itLogisticsService,
  type ActivityRow,
  type LogisticsOverview,
  type LogisticsPeriod,
} from '@/lib/services/admin/it-dashboard.service'
import { CARD, DeliveryStatistics, FleetCards, StatCards, TrackingCard } from './DashboardCards'
import ActivitiesCard from './ActivitiesCard'
import ItAdminHandoverPanel from '@/components/admin/ItAdminHandoverPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import { cachedData, storeData } from '@/lib/query/useApiQuery'

/**
 * IT Administrator dashboard, copied from TailAdmin's logistics dashboard
 * (user 2026-11-26: "just copy the data that is in the link, not the errors
 * in the system"):
 *
 *   stat cards ×3          │ Delivery vehicles · On-route
 *   Delivery statistics    │ Tracking delivery
 *   ──────────── Delivery activities (table) ────────────
 *
 * System health, sign-in safety and error issues are no longer shown here;
 * system logs stay in the Logs module.
 */

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 3xl:gap-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex flex-col gap-3 xl:col-span-7 3xl:gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 3xl:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`${CARD} space-y-4 p-5`}>
              <Skeleton className="h-11 w-11 rounded-xl" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          ))}
        </div>
        <div className={`${CARD} space-y-4 p-5`}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
      <div className="flex flex-col gap-3 xl:col-span-5 3xl:gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 3xl:gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={`${CARD} flex items-center justify-between p-5`}>
              <div className="space-y-2"><Skeleton className="h-7 w-12" /><Skeleton className="h-3.5 w-28" /></div>
              <Skeleton className="h-16 w-16 rounded-2xl" />
            </div>
          ))}
        </div>
        <div className={`${CARD} space-y-4 p-5`}>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-12 w-full rounded-lg" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3"><Skeleton className="h-4 w-4 rounded-full" /><Skeleton className="h-3.5 flex-1" /></div>
          ))}
          <Skeleton className="h-10 w-48" />
        </div>
      </div>
    </div>
  )
}

export default function ItAdminDashboard() {
  const [period, setPeriod]     = useState<LogisticsPeriod>('monthly')
  const [overview, setOverview] = useState<LogisticsOverview | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  // A row picked in the table replaces the latest delivery in Tracking delivery.
  const [picked, setPicked]     = useState<ActivityRow | null>(null)
  const periodRef = useRef(period)
  periodRef.current = period

  const load = useCallback(async () => {
    const p = periodRef.current
    const key = ['page', `it-dashboard|logistics|${p}`] as const
    const cached = cachedData<LogisticsOverview>(key)
    if (cached) setOverview(cached)
    setLoading(true)
    try {
      const data = await itLogisticsService.getOverview(p)
      storeData(key, data)
      if (periodRef.current === p) setOverview(data)
      setError(null)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err.response?.data?.message ?? err.message ?? 'Failed to load the dashboard')
    } finally {
      if (periodRef.current === p) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, period])

  // Counts move as bookings change status and vehicles go out and come back.
  useLiveTable(['live:bookings', 'live:trucks'], load, { debounceMs: 3_000 })

  return (
    // The dashboard shell clips its content area (overflow-hidden), so the page
    // owns its scroll: fill that area and scroll inside it.
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white">
      <div className="flex w-full flex-col gap-3 px-3 py-3 sm:px-4 lg:px-5 lg:pt-3 lg:pb-4 3xl:gap-4 3xl:px-6 3xl:pb-5">

        {error && (
          <div className="rounded-xl border border-[#f62626]/30 bg-[#f62626]/10 px-4 py-2.5 text-sm text-[#f62626]">
            {error}
          </div>
        )}

        {!overview ? (
          loading && <DashboardSkeleton />
        ) : (
          // Two rows, so each row's cards share one height. In the second row the
          // chart sets the height: the tracking card is laid over its cell
          // (absolute on desktop) so it can't make the row taller.
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 3xl:gap-4">
            <div className="min-w-0 xl:col-span-7"><StatCards o={overview} /></div>
            <div className="min-w-0 xl:col-span-5"><FleetCards o={overview} /></div>
            <div className="flex min-w-0 xl:col-span-7">
              <DeliveryStatistics o={overview} period={period} onPeriod={setPeriod} loading={loading} />
            </div>
            <div className="relative flex min-w-0 xl:col-span-5">
              <TrackingCard row={picked ?? overview.tracked} picked={!!picked} className="xl:absolute xl:inset-0" />
            </div>
          </div>
        )}

        <ActivitiesCard
          selectedId={picked?.booking_id ?? null}
          onPick={(r) => setPicked((cur) => (cur?.booking_id === r.booking_id ? null : r))}
          onRows={(rows) => setPicked((cur) => (cur ? rows.find((r) => r.booking_id === cur.booking_id) ?? cur : cur))}
        />

        {/* The handover is rare, so it sits below everything else. */}
        <ItAdminHandoverPanel />
      </div>
    </div>
  )
}
