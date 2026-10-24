'use client'

import { useEffect, useState } from 'react'

/** Used by the emergency ringer. */

/* ── Ringtone ────────────────────────────────────────────────────────────── */

/**
 * A two-tone ring made with Web Audio, so there is no audio file to load. A
 * browser that has not had a click on the page yet may refuse to play it; the
 * ringer is still on screen and the tab title still flashes.
 */
export function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const Ctx = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return

    let ctx: AudioContext | null = null
    try { ctx = new Ctx() } catch { return }
    void ctx.resume().catch(() => {})

    const ring = () => {
      if (!ctx || ctx.state !== 'running') return
      const now = ctx.currentTime
      ;[0, 0.45].forEach((offset) => {
        const osc  = ctx!.createOscillator()
        const gain = ctx!.createGain()
        osc.frequency.value = offset === 0 ? 880 : 660
        gain.gain.setValueAtTime(0.0001, now + offset)
        gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.4)
        osc.connect(gain).connect(ctx!.destination)
        osc.start(now + offset)
        osc.stop(now + offset + 0.42)
      })
    }
    ring()
    const timer = window.setInterval(ring, 2000)

    return () => {
      window.clearInterval(timer)
      void ctx?.close().catch(() => {})
    }
  }, [active])
}

/** Flash the tab title so someone on another tab sees the call. */
export function useTitleFlash(text: string | null) {
  useEffect(() => {
    if (!text) return
    const original = document.title
    let on = false
    const timer = window.setInterval(() => {
      on = !on
      document.title = on ? text : original
    }, 1000)
    return () => {
      window.clearInterval(timer)
      document.title = original
    }
  }, [text])
}

export function useElapsed(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  if (!startedAt) return '0:00'
  const s = Math.max(0, Math.floor((now - startedAt) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
