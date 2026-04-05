export function statusColor(s: string) {
  const u = (s ?? '').toUpperCase()
  if (u.includes('TRANSIT')) return 'var(--color-cyan)'
  if (u === 'COMPLETED')     return 'var(--color-green)'
  if (u === 'CANCELLED')     return '#f62626'
  if (u === 'ASSIGNED')      return '#f69f26'
  if (u === 'ARRIVED')       return 'var(--color-green)'
  return '#9f9c9c'
}