'use client'

import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import TableEmptyState from '@/components/ui/TableEmptyState'
import Pagination from '@/components/ui/Pagination'
import FilterBar from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import type { DateRange } from '@/components/ui/untitled/date-range-picker'
import { TruncatedText } from '@/components/ui/TruncatedText'
import BookingStatusTag from '@/components/transactions/BookingStatusTag'
import { rowClass, SkeletonRows } from '@/components/admin/LogTables'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useTablePageSize } from '@/lib/hooks/useTablePageSize'
import { cachedData, storeData } from '@/lib/query/useApiQuery'
import { formatDate, formatTime } from '@/app/utils/timeFormat'
import {
  itLogisticsService,
  type ActivityPage,
  type ActivityRow,
  type ActivityTab,
} from '@/lib/services/admin/it-dashboard.service'

/**
 * The link's "Delivery Activities" table (TailAdmin logistics, 2026-11-26):
 * the tabs All / Delivered / In transit / Pending / Processing, a date range,
 * and Booking, Cargo, Company, Arrival time, Route, Status. No Price column:
 * the system handles no amounts. Picking a row shows it in Tracking delivery.
 */

const TABS: { id: ActivityTab; label: string }[] = [
  { id: 'all',        label: 'All Bookings' },
  { id: 'delivered',  label: 'Delivered' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'pending',    label: 'Pending' },
  { id: 'processing', label: 'Processing' },
]

/**
 * The city in a Google address, for the short route: the part just before the
 * region ("…, Alabang, Muntinlupa, 1770 Metro Manila, Philippines" → Muntinlupa).
 */
function placeOf(address: string | null): string {
  if (!address) return '—'
  const parts = address.split(',').map((p) => p.trim().replace(/^\d{4}\s+/, '')).filter(Boolean)
  if (parts.length && /^philippines$/i.test(parts[parts.length - 1])) parts.pop()
  if (parts.length >= 3) return parts[parts.length - 2]
  return parts[0] ?? address
}

export default function ActivitiesCard({ selectedId, onPick, onRows }: {
  selectedId: string | null
  onPick: (row: ActivityRow) => void
  /** Every fresh page, so a picked booking shown above stays current. */
  onRows?: (rows: ActivityRow[]) => void
}) {
  const PAGE_SIZE = useTablePageSize()
  const [tab, setTab]                         = useState<ActivityTab>('all')
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateRange, setDateRange]             = useState<DateRange | null>(null)
  const [page, setPage]                       = useState(1)
  const [res, setRes]                         = useState<ActivityPage | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [reloadKey, setReloadKey]             = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [tab, debouncedSearch, dateRange])

  // Bookings move through their statuses all day; re-read when one changes.
  useLiveTable(['live:bookings'], () => setReloadKey((k) => k + 1), { debounceMs: 3_000 })

  const query = {
    tab,
    page,
    limit: PAGE_SIZE,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(dateRange && { date_from: dateRange.from, date_to: dateRange.to }),
  }
  const queryKey = JSON.stringify(query)

  useEffect(() => {
    let cancelled = false
    const key = ['it-dashboard', 'activities', queryKey] as const
    const cached = cachedData<ActivityPage>(key)
    if (cached) { setRes(cached); setLoading(false) }
    else if (reloadKey === 0 || !res) setLoading(true)
    itLogisticsService.getActivities(JSON.parse(queryKey))
      .then((r) => {
        storeData(key, r)
        if (!cancelled) { setRes(r); setError(null); onRows?.(r.data) }
      })
      .catch((e: { response?: { data?: { message?: string } }; message?: string }) => {
        if (!cancelled && !cached) setError(e.response?.data?.message ?? e.message ?? 'Failed to load bookings')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // res is read only to decide whether to show the skeleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, reloadKey])

  const rows       = res?.data ?? []
  const total      = res?.meta.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(1, totalPages))
  const filtered   = tab !== 'all' || !!search || !!dateRange
  const counts     = res?.counts

  return (
    <TableCard.Root className="flex flex-col">
      <div className="border-b border-[#424242] px-4 pt-5 pb-4 md:px-6">
        <h2 className="text-base font-semibold text-white">Delivery activities</h2>
        <p className="text-sm text-[#818181]">Every booking, newest first. Pick one to track it above.</p>
      </div>
      <FilterBar
        layout="split"
        leading={
          <TabsMinimal
            label="Bookings"
            items={TABS.map((t) => ({ id: t.id, label: counts ? `${t.label} (${counts[t.id]})` : t.label }))}
            selectedKey={tab}
            onSelectionChange={setTab}
          />
        }
        search={{ value: search, onChange: setSearch, placeholder: 'Search booking, company or pick-up' }}
        dateRange={{ value: dateRange, onChange: setDateRange }}
      />
      {error && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400">{error}</div>
      )}
      {/* The headers stay; an empty list shows its message under them. */}
      <div className="overflow-x-auto">
        <table className="data-table min-w-[960px]">
          <thead>
            <tr>
              <th>booking</th>
              <th>cargo</th>
              <th>company</th>
              <th>arrival time</th>
              <th>route</th>
              <th className="text-right">status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <SkeletonRows cols={6} rows={PAGE_SIZE} /> : rows.map((r) => (
              <tr key={r.booking_id} onClick={() => onPick(r)} className={rowClass(selectedId === r.booking_id)}>
                <td className="whitespace-nowrap">
                  <p className="t-name font-mono">{r.reference_number ?? '—'}</p>
                  {r.schedule_date && <p className="t-sub">Runs {formatDate(`${r.schedule_date}T00:00:00+08:00`)}</p>}
                </td>
                <td className="max-w-[180px]"><TruncatedText>{r.category ?? '—'}</TruncatedText></td>
                <td className="max-w-[200px]"><TruncatedText>{r.company}</TruncatedText></td>
                <td className="whitespace-nowrap">
                  {r.delivered_at ? (
                    <>
                      <p className="t-name">{formatDate(r.delivered_at)}</p>
                      <p className="t-sub">{formatTime(r.delivered_at)}</p>
                    </>
                  ) : <span className="text-[#818181]">Not yet</span>}
                </td>
                <td className="max-w-[260px]">
                  <TruncatedText text={`${r.origin ?? '—'} → ${r.destination ?? '—'}`}>
                    {placeOf(r.origin)} – {placeOf(r.destination)}
                  </TruncatedText>
                  {r.stops > 1 && <p className="t-sub">{r.stops} drop-offs</p>}
                </td>
                <td className="text-right"><BookingStatusTag booking={{ ...r.tag, status: r.status }} staff align="end" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !error && rows.length === 0 && (
          <TableEmptyState
            icon={Package}
            filtered={filtered}
            title={filtered ? undefined : 'No bookings yet'}
            message={filtered ? 'No bookings match your search or filters.' : 'Bookings appear here as clients make them.'}
            onClear={() => { setTab('all'); setSearch(''); setDateRange(null); setPage(1) }}
          />
        )}
      </div>
      {!loading && total > 0 && (
        <Pagination page={safePage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}
    </TableCard.Root>
  )
}
