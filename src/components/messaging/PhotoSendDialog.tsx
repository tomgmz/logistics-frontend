'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { MapPin, ImageIcon, Loader2, X } from 'lucide-react'
import { messagingService, type PhotoStampInput } from '@/lib/services/messaging.service'

/** The most a chosen photo may weigh, before it is shrunk for upload. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

// The server keeps at most 2048 px on the long side, so shrinking to that here
// loses nothing — and keeps the upload under the hosting proxy's ~4.5 MB body
// limit, which a 10 MB original would not be.
const MAX_EDGE = 2048

async function shrinkForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale  = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read that photo'))), 'image/jpeg', 0.9))
}

/** The browser's position, or nothing if it is refused or slow. Never throws. */
function currentPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise(resolve =>
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }))
}

type Mode = 'stamp' | 'plain'

/**
 * Sending a photo: preview, then the choice the driver's proof photos make
 * for them — with the time-and-place stamp, or as the plain picture — and an
 * optional message. Uploads, then hands the stored URL to `onSend`.
 */
export default function PhotoSendDialog({ file, onCancel, onSend }: {
  file:     File | null
  onCancel: () => void
  onSend:   (attachmentUrl: string, caption: string) => void
}) {
  if (typeof document === 'undefined') return null
  // Keyed by the file, so every photo starts with a fresh caption and choice.
  return createPortal(
    <AnimatePresence>
      {file && <PhotoSendPanel key={`${file.name}:${file.size}:${file.lastModified}`} file={file} onCancel={onCancel} onSend={onSend} />}
    </AnimatePresence>,
    document.body,
  )
}

function PhotoSendPanel({ file, onCancel, onSend }: {
  file:     File
  onCancel: () => void
  onSend:   (attachmentUrl: string, caption: string) => void
}) {
  const [mode, setMode]       = useState<Mode>('stamp')
  const [caption, setCaption] = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const preview               = useMemo(() => URL.createObjectURL(file), [file])

  useEffect(() => () => URL.revokeObjectURL(preview), [preview])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const send = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      // The time is when the photo was chosen to send — the browser cannot
      // tell when a picked file was actually taken.
      const takenAt = new Date()
      const [blob, pos] = await Promise.all([
        shrinkForUpload(file),
        mode === 'stamp' ? currentPosition() : Promise.resolve(null),
      ])
      const stamp: PhotoStampInput | null = mode === 'stamp'
        ? { takenAt, latitude: pos?.coords.latitude, longitude: pos?.coords.longitude, accuracyM: pos?.coords.accuracy }
        : null
      // If the stamp fails to render the server stores the photo plain; the
      // bubble then shows no "Stamped" tag, which is the honest outcome.
      const { url } = await messagingService.uploadPhoto(blob, stamp)
      onSend(url, caption.trim())
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string })
      setError(msg.response?.data?.message ?? 'The photo could not be sent. Try again.')
      setBusy(false)
    }
  }

  const option = (value: Mode, icon: React.ReactNode, title: string, hint: string) => (
    <button type="button" onClick={() => setMode(value)} disabled={busy}
      className={`flex-1 flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
        mode === value ? 'border-[var(--color-cyan)]/60 bg-[var(--color-cyan)]/10' : 'border-white/10 hover:bg-white/[0.04]'
      }`}>
      <span className={mode === value ? 'text-[var(--color-cyan)]' : 'text-white/50'}>{icon}</span>
      <span className="flex flex-col">
        <span className="ff-body text-sm text-white">{title}</span>
        <span className="ff-body text-[11px] text-white/40 leading-snug">{hint}</span>
      </span>
    </button>
  )

  return (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={e => { if (e.target === e.currentTarget && !busy) onCancel() }}
          role="dialog" aria-modal="true" aria-labelledby="photo-send-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md bg-[var(--color-bg)] border border-white/[0.09] rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h3 id="photo-send-title" className="ff-body text-sm font-semibold text-white">Send a photo</h3>
              <button type="button" onClick={onCancel} disabled={busy} aria-label="Close"
                className="p-1 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors">
                <X size={14} />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-black/30 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Photo to send" className="max-h-64 w-auto object-contain" />
            </div>

            <div className="flex gap-2">
              {option('stamp', <MapPin size={16} />, 'With stamp', 'Time, date and place burned into the photo')}
              {option('plain', <ImageIcon size={16} />, 'No stamp', 'The photo exactly as it is')}
            </div>
            {mode === 'stamp' && (
              <p className="ff-body text-[11px] text-white/35 -mt-2">Your browser may ask to share your location for the stamp.</p>
            )}

            <input
              value={caption}
              onChange={e => setCaption(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void send() } }}
              maxLength={5000}
              placeholder="Add a message (optional)"
              disabled={busy}
              className="w-full glass rounded-xl border border-white/[0.08] focus:border-[var(--color-cyan)]/30 bg-transparent px-3 py-2.5 ff-body text-sm text-white placeholder:text-white/25 focus:outline-none"
            />

            {error && <p className="ff-body text-xs text-red-400">{error}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={onCancel} disabled={busy}
                className="flex-1 py-2 rounded-xl border border-white/10 ff-body text-sm text-white/70 hover:text-white transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={() => void send()} disabled={busy}
                className="flex-1 py-2 rounded-xl bg-[var(--color-cyan)] text-[var(--color-bg)] ff-body text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-70">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </motion.div>
        </motion.div>
  )
}
