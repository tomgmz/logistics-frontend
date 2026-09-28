/**
 * A planned arrival shown as a window, not a minute.
 *
 * The planned estimate (backend planned-eta.service.ts) is Google's predicted
 * drive time plus flat unloading/reloading allowances, so an exact "2:43 PM"
 * would claim precision it does not have. Fleet systems show a window for the
 * same reason. It opens at the estimate, rounded down to 5 minutes, and runs
 * WINDOW_MINUTES past it, because trucks run late far more often than early.
 *
 * Times are Philippine time regardless of the viewer's device, which is where
 * the delivery happens.
 */

const WINDOW_MINUTES = 30
const ROUND_MS       = 5 * 60_000
const TZ             = 'Asia/Manila'

export interface ArrivalWindow {
  start: Date
  end:   Date
}

export function arrivalWindow(iso: string | null | undefined): ArrivalWindow | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  const start = new Date(Math.floor(at / ROUND_MS) * ROUND_MS)
  return { start, end: new Date(start.getTime() + WINDOW_MINUTES * 60_000) }
}

const time = (d: Date) => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
const day  = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: TZ })

/** "2:40 – 3:10 PM", with the day in front when it is not today: "Oct 2, 2:40 – 3:10 PM". */
export function formatArrivalWindow(iso: string | null | undefined): string | null {
  const w = arrivalWindow(iso)
  if (!w) return null
  const range   = `${time(w.start)} – ${time(w.end)}`
  const isToday = day(w.start) === day(new Date())
  return isToday ? range : `${day(w.start)}, ${range}`
}

/** A single planned instant (a departure, a return): "3:10 PM", or "Oct 2, 3:10 PM". */
export function formatArrivalClock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return day(d) === day(new Date()) ? time(d) : `${day(d)}, ${time(d)}`
}

/** Past the end of the window — the truck is behind its plan. */
export function isPastWindow(iso: string | null | undefined, at: Date | number = Date.now()): boolean {
  const w = arrivalWindow(iso)
  return !!w && new Date(at).getTime() > w.end.getTime()
}
