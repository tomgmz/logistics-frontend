function parseDate(isoString: string): Date {
  if (!isoString) return new Date(NaN)
  // Already has timezone info
  if (isoString.endsWith('Z') || isoString.includes('+')) {
    return new Date(isoString)
  }
  // Postgres timestamps without timezone — treat as UTC
  return new Date(`${isoString}Z`)
}

export function formatMessageTime(isoString: string): string {
  const date = parseDate(isoString)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function formatConversationTime(isoString: string): string {
  const date = parseDate(isoString)
  if (isNaN(date.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString('en-PH', { weekday: 'short' })
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

export function groupMessagesByDate<T extends { created_at: string }>(
  messages: T[]
): { date: string; messages: T[] }[] {
  const groups: Record<string, T[]> = {}
  for (const msg of messages) {
    const date = parseDate(msg.created_at)
    if (isNaN(date.getTime())) continue
    const key = date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    if (!groups[key]) groups[key] = []
    groups[key].push(msg)
  }
  return Object.entries(groups).map(([date, msgs]) => ({ date, messages: msgs }))
}