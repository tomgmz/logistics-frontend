/* Push notifications service worker for message alerts. */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'New message', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'New message'
  const body  = payload.body || ''
  const data  = payload.data || {}

  event.waitUntil(
    (async () => {
      // Suppress when the user is actively focused on the web app — the in-app
      // realtime UI already surfaces the message.
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = clientList.some((c) => c.focused)
      if (focused) return

      await self.registration.showNotification(title, {
        body,
        data,
        icon: '/8338-logo.png',
        badge: '/8338-logo.png',
        tag: data.booking_id || data.conversation_id || data.group_id || 'message',
        renotify: true,
      })
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  // Booking-workflow notifications carry a deep-link (action_url) into the right
  // module + booking; chat notifications fall back to the messages view.
  const url = typeof data.action_url === 'string' ? data.action_url : '/messages'

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          client.postMessage({ type: 'OPEN_NOTIFICATION', url, data })
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })()
  )
})
