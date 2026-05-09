const LOCALE   = 'en-PH'
const TIMEZONE = 'Asia/Manila'

function toUTC(iso: string): string {
  if (iso.endsWith('Z') || iso.includes('+')) return iso
  return iso + 'Z'
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(toUTC(iso)).toLocaleDateString(LOCALE, {
    timeZone: TIMEZONE,
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(toUTC(iso)).toLocaleTimeString(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(toUTC(iso)).toLocaleString(LOCALE, {
    timeZone: TIMEZONE,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: true,
  })
}