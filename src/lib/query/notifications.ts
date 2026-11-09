'use client'

import { useCallback, useEffect } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import { create } from 'zustand'
import type { AppNotification, NotificationFilter } from '@/lib/services/notification.service'
import {
  notificationService, normalizeNotification, matchesNotificationFilter,
} from '@/lib/services/notification.service'
import { useApiQuery, cachedData, storeData, invalidateScoped } from './useApiQuery'

type NotificationsPage = { items: AppNotification[]; total: number; totalPages: number }

/** Notifications per page in the bell. */
export const NOTIFICATIONS_PAGE_SIZE = 10

/**
 * The bell: its page and filter are screen state (Zustand); the notifications
 * and the unread count are server data (TanStack Query). A new notification
 * arrives over realtime and is written into the cached page and count at
 * once; nothing polls.
 */
const useBellView = create<{ page: number; filter: NotificationFilter | null }>(() => ({ page: 1, filter: null }))

const pageKey  = (page: number, filter: NotificationFilter | null) => ['notifications', 'page', page, filter ?? 'all'] as const
const UNREAD   = ['notifications', 'unread'] as const

export function useNotifications(enabled = true) {
  const page   = useBellView((s) => s.page)
  const filter = useBellView((s) => s.filter)

  const list = useApiQuery<NotificationsPage>(
    pageKey(page, filter),
    () => notificationService.page(page, NOTIFICATIONS_PAGE_SIZE, filter),
    { enabled, placeholderData: keepPreviousData },
  )
  const unread = useApiQuery<number>(UNREAD, () => notificationService.unreadCount(), { enabled })

  // The page emptied (notifications went away): step back to the last one.
  const data = list.data
  const emptied = !!data && !list.isPlaceholderData && data.items.length === 0 && page > 1
  const lastPage = data?.totalPages ?? 1
  useEffect(() => {
    if (emptied) useBellView.setState({ page: Math.max(1, lastPage) })
  }, [emptied, lastPage])

  const setFilter = useCallback(async (f: NotificationFilter | null) => {
    useBellView.setState({ filter: f, page: 1 })
  }, [])
  const goToPage = useCallback(async (p: number) => { useBellView.setState({ page: p }) }, [])

  return {
    items:       data?.items ?? [],
    unreadCount: unread.data ?? 0,
    loaded:      unread.isSuccess,
    page,
    total:       data?.total ?? 0,
    totalPages:  data?.totalPages ?? 1,
    pageLoading: list.isFetching && list.isPlaceholderData,
    filter,
    setFilter,
    goToPage,
    markRead,
    markAllRead,
  }
}

/** Re-read the bell (its current page and the count). */
export function refreshNotifications() {
  return invalidateScoped(['notifications'])
}

function setUnread(fn: (n: number) => number) {
  storeData(UNREAD, fn(cachedData<number>(UNREAD) ?? 0))
}

function patchPage(fn: (items: AppNotification[]) => AppNotification[]) {
  const { page, filter } = useBellView.getState()
  const cur = cachedData<NotificationsPage>(pageKey(page, filter))
  if (cur) storeData(pageKey(page, filter), { ...cur, items: fn(cur.items) })
}

/**
 * A new notification from realtime. It joins the top of page 1; on a later
 * page only the counts move, so the page being read doesn't shift under the
 * reader. Outside the current filter, only the unread badge moves.
 */
export function pushNotification(raw: AppNotification) {
  const n = normalizeNotification(raw)
  const { page, filter } = useBellView.getState()
  if (!n.read_at) setUnread((c) => c + 1)
  if (!matchesNotificationFilter(n, filter)) return

  const first = cachedData<NotificationsPage>(pageKey(1, filter))
  if (first && !first.items.some((i) => i.notification_id === n.notification_id)) {
    const total = first.total + 1
    storeData(pageKey(1, filter), {
      ...first,
      items:      [n, ...first.items].slice(0, NOTIFICATIONS_PAGE_SIZE),
      total,
      totalPages: Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE)),
    })
  }
  if (page !== 1) {
    const cur = cachedData<NotificationsPage>(pageKey(page, filter))
    if (cur) {
      const total = cur.total + 1
      storeData(pageKey(page, filter), { ...cur, total, totalPages: Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE)) })
    }
  }
}

async function markRead(id: string) {
  const { page, filter } = useBellView.getState()
  const target = cachedData<NotificationsPage>(pageKey(page, filter))?.items.find((i) => i.notification_id === id)
  if (!target || target.read_at) return
  const now = new Date().toISOString()
  patchPage((items) => items.map((i) => (i.notification_id === id ? { ...i, read_at: now } : i)))
  setUnread((c) => Math.max(0, c - 1))
  try {
    await notificationService.markRead(id)
  } catch {
    // Put it back as it was.
    patchPage((items) => items.map((i) => (i.notification_id === id ? { ...i, read_at: null } : i)))
    setUnread((c) => c + 1)
  }
}

async function markAllRead() {
  const now = new Date().toISOString()
  patchPage((items) => items.map((i) => (i.read_at ? i : { ...i, read_at: now })))
  setUnread(() => 0)
  try {
    await notificationService.markAllRead()
    void refreshNotifications()   // other pages and filters too
  } catch {
    void refreshNotifications()
  }
}
