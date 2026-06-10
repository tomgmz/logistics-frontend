'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { registerWebPush } from '@/lib/push/web-push'

/**
 * Registers web push for the signed-in user and routes notification taps to the
 * messages view. Mounted once inside the authenticated shell.
 */
export default function PushProvider() {
  const userId = useAuthStore((s) => s.user?.user_id ?? null)
  const router = useRouter()

  useEffect(() => {
    if (!userId) return
    registerWebPush().catch(() => {})
  }, [userId])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_CONVERSATION') router.push('/messages')
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  return null
}
