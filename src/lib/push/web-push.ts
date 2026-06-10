import proxyApi from '@/lib/api/auth.api'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/sw.js')
  return existing ?? (await navigator.serviceWorker.register('/sw.js'))
}

/**
 * Register the service worker, request notification permission, subscribe to
 * web push, and persist the subscription on the backend. Safe to call repeatedly.
 */
export async function registerWebPush(): Promise<void> {
  if (!isSupported() || !VAPID_PUBLIC_KEY) return
  if (Notification.permission === 'denied') return

  const registration = await getRegistration()
  await navigator.serviceWorker.ready

  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission()
    if (result !== 'granted') return
  } else if (Notification.permission !== 'granted') {
    return
  }

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    }))

  const json = subscription.toJSON()
  await proxyApi.post('/notifications/push/subscribe', {
    platform: 'web',
    token: subscription.endpoint,
    keys: json.keys,
    device_info: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
  })
}

/** Unsubscribe and remove the subscription from the backend (call on logout). */
export async function unregisterWebPush(): Promise<void> {
  if (!isSupported()) return
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js')
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    const endpoint = subscription.endpoint
    await subscription.unsubscribe().catch(() => {})
    await proxyApi.post('/notifications/push/unsubscribe', { token: endpoint }).catch(() => {})
  } catch {
    /* best-effort */
  }
}
