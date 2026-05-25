import type { Message } from '../types/messaging/messaging.types'

export function formatMessageTime(isoString: string): string {
  const date = new Date(isoString.endsWith('Z') ? isoString : `${isoString}Z`)
  return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function formatConversationTime(isoString: string): string {
  const date = new Date(isoString.endsWith('Z') ? isoString : `${isoString}Z`)
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

export function groupMessagesByDate(messages: Message[]): { date: string; messages: Message[] }[] {
  const groups: Record<string, Message[]> = {}
  for (const msg of messages) {
    const date = new Date(msg.created_at.endsWith('Z') ? msg.created_at : `${msg.created_at}Z`)
    const key = date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    if (!groups[key]) groups[key] = []
    groups[key].push(msg)
  }
  return Object.entries(groups).map(([date, messages]) => ({ date, messages }))
}