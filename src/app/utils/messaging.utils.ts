const PHT = 'Asia/Manila'

function parseDate(iso: string): Date {
  if (!iso) return new Date(NaN)
  // Postgres timestamps without timezone — treat as UTC
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
}

export function formatMessageTime(iso: string): string {
  const d = parseDate(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: PHT })
}

export function formatConversationTime(iso: string): string {
  const d = parseDate(iso)
  if (isNaN(d.getTime())) return ''
  const nowPHT  = new Date(new Date().toLocaleString('en-US', { timeZone: PHT }))
  const datePHT = new Date(d.toLocaleString('en-US', { timeZone: PHT }))
  const diff = Math.floor((nowPHT.setHours(0,0,0,0) - datePHT.setHours(0,0,0,0)) / 86_400_000)
  if (diff === 0) return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: PHT })
  if (diff === 1) return 'Yesterday'
  if (diff < 7)  return d.toLocaleDateString('en-PH', { weekday: 'short', timeZone: PHT })
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: PHT })
}

export function groupMessagesByDate<T extends { created_at: string }>(
  messages: T[]
): { date: string; messages: T[] }[] {
  const map: Record<string, T[]> = {}
  for (const msg of messages) {
    const d = parseDate(msg.created_at)
    if (isNaN(d.getTime())) continue
    const key = d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: PHT })
    ;(map[key] ??= []).push(msg)
  }
  return Object.entries(map).map(([date, msgs]) => ({ date, messages: msgs }))
}