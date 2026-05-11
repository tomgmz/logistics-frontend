let offset = 0

export async function syncServerTime(): Promise<void> {
  try {
    const before = Date.now()
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
    const { serverTime } = await res.json()
    const after = Date.now()
    offset = serverTime - (before + (after - before) / 2)
  } catch {
    offset = 0
  }
}

export function now(): number {
  return Date.now() + offset
}

export function nowDate(): Date {
  return new Date(now())
}