'use client'

import {
  useEffect, useState,
  type ImgHTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactNode, type SyntheticEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Download, FileQuestion, Loader2, X } from 'lucide-react'

import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { downloadFile } from '@/app/types/documents.types'

/*
 * Every file in the web app (photos, PDFs, videos, documents) opens HERE,
 * inside the page, never in a new tab, and the storage link is not exposed:
 *
 *  - triggers are <button>s, not links, so there is nothing to right-click
 *    "Open in new tab" / "Copy link address" on and no URL in the status bar;
 *  - the viewer fetches the file and shows it from a blob: URL, which is only
 *    valid inside this page, so "Copy image address" gives nothing usable;
 *  - right-click, iOS long-press and drag are blocked in the viewer and on
 *    thumbnails (ProtectedImg);
 *  - PDFs open with the browser's PDF toolbar hidden (#toolbar=0; Chrome/Edge).
 *
 * This is a deterrent, not DRM: someone with the browser's developer tools can
 * still find the signed link. Those links expire (15 min – 2 h) anyway.
 */

type Kind = 'image' | 'pdf' | 'video' | 'other'

function kindOf(url: string, mime?: string | null): Kind {
  if (mime) {
    if (mime.startsWith('image/')) return 'image'
    if (mime === 'application/pdf') return 'pdf'
    if (mime.startsWith('video/')) return 'video'
  }
  const path = url.split('?')[0].split('#')[0].toLowerCase()
  if (/\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/.test(path)) return 'image'
  if (path.endsWith('.pdf')) return 'pdf'
  if (/\.(mp4|mov|webm|m4v|3gp)$/.test(path)) return 'video'
  return 'other'
}

/** The last path segment of a link, for a title / download name. */
export function fileNameOf(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/')
    return decodeURIComponent(parts[parts.length - 1] || 'file')
  } catch {
    return 'file'
  }
}

const blockMenu = (e: SyntheticEvent) => e.preventDefault()

/** Classes that stop iOS long-press "Open in New Tab" / "Save Image" and text selection. */
const NO_CALLOUT = 'select-none [-webkit-touch-callout:none] [-webkit-user-drag:none]'

/**
 * An <img> that can't be right-clicked, long-pressed or dragged out to a new tab.
 * Use it for every thumbnail of a stored file.
 */
export function ProtectedImg({ className = '', alt = '', ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed storage links, any host shape
    <img
      {...rest}
      alt={alt}
      draggable={false}
      onContextMenu={blockMenu}
      className={`${NO_CALLOUT} ${className}`}
    />
  )
}

/** Loads the file into a page-local blob: URL. Falls back to the link itself if storage refuses the fetch (CORS). */
function useBlobFile(url: string) {
  // Keyed by the link, so a new link (a refreshed signature) reads as loading
  // without resetting state inside the effect.
  const [state, setState] = useState<{ for: string; src: string | null; blob: Blob | null; failed: boolean }>(
    { for: '', src: null, blob: null, failed: false },
  )

  useEffect(() => {
    let alive = true
    let objectUrl: string | null = null
    const ctrl = new AbortController()
    // no-store: a thumbnail <img> may have cached this link without CORS headers.
    fetch(url, { cache: 'no-store', signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob() })
      .then((b) => {
        if (!alive) return
        objectUrl = URL.createObjectURL(b)
        setState({ for: url, src: objectUrl, blob: b, failed: false })
      })
      .catch(() => { if (alive) setState({ for: url, src: null, blob: null, failed: true }) })
    return () => {
      alive = false
      ctrl.abort()
      // Delay: Safari may still be reading the blob for a download started from the viewer.
      if (objectUrl) { const u = objectUrl; setTimeout(() => URL.revokeObjectURL(u), 60_000) }
    }
  }, [url])

  return state.for === url ? state : { src: null, blob: null, failed: false }
}

/**
 * The file itself, sized to its box. Shared by the full-screen viewer and
 * Document Management's preview pop-up.
 */
export function FilePreview({ url, name, onDownload }: { url: string; name: string; onDownload?: () => void }) {
  const { src, blob, failed } = useBlobFile(url)
  const [zoomed, setZoomed] = useState(false)
  const kind = kindOf(url, blob?.type)

  // Storage refused the fetch: images and videos still show from the link
  // (inside the page, menus blocked); a PDF too, with the toolbar hidden.
  const shown = src ?? (failed ? url : null)

  if (!shown) {
    return <Loader2 size={28} className="animate-spin text-white/40" aria-label="Loading file" />
  }

  if (kind === 'image') {
    return (
      <div
        className={`w-full h-full ${zoomed ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden'}`}
        onContextMenu={blockMenu}
      >
        <ProtectedImg
          src={shown}
          alt={name}
          onClick={() => setZoomed((z) => !z)}
          title={zoomed ? 'Tap to fit' : 'Tap to zoom'}
          className={zoomed
            ? 'max-w-none cursor-zoom-out'
            : 'max-h-full max-w-full object-contain cursor-zoom-in'}
        />
      </div>
    )
  }

  if (kind === 'pdf') {
    return (
      <iframe
        src={`${shown}#toolbar=0&navpanes=0`}
        title={name}
        className="w-full h-full bg-white"
      />
    )
  }

  if (kind === 'video') {
    return (
      <video
        src={shown}
        controls
        playsInline
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={blockMenu}
        className="max-h-full max-w-full"
      />
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center px-6">
      <FileQuestion size={40} className="text-white/25" />
      <p className="text-sm text-white/50">This file type can&apos;t be shown in the browser.</p>
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-black"
          style={{ background: 'var(--color-cyan)' }}
        >
          <Download size={14} /> Download to open
        </button>
      )}
    </div>
  )
}

/** Saves a stored file without opening it in a tab (see downloadFile). */
export const downloadStoredFile = downloadFile

/** Full-screen in-page viewer for one stored file. */
export function FileViewer({ url, name, onClose, canDownload = true }: {
  url:          string
  name?:        string
  onClose:      () => void
  canDownload?: boolean
}) {
  useBodyScrollLock(true)
  const title = name || fileNameOf(url)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const download = canDownload ? () => { void downloadStoredFile(url, title) } : undefined

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-0 sm:p-4"
      // React events bubble through portals: keep clicks from reaching a
      // clickable row / panel that rendered the trigger.
      onClick={(e) => { e.stopPropagation(); onClose() }}
      onContextMenu={blockMenu}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full h-dvh sm:h-[92dvh] sm:max-w-5xl flex flex-col sm:rounded-2xl border border-white/10 bg-[var(--color-surface,#141414)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.07] shrink-0">
          <h2 className="min-w-0 truncate text-sm font-bold text-white">{title}</h2>
          <div className="flex items-center gap-1 shrink-0">
            {download && (
              <button type="button" onClick={download}
                className="p-2 rounded-lg text-white/60 [@media(hover:hover)]:hover:bg-white/5"
                title="Download" aria-label="Download">
                <Download size={17} />
              </button>
            )}
            <button type="button" onClick={onClose}
              className="p-2 rounded-lg text-white/50 [@media(hover:hover)]:hover:bg-white/5"
              aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-black/60 flex items-center justify-center overflow-hidden">
          <FilePreview url={url} name={title} onDownload={download} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * A button that opens a stored file in the in-page viewer. Use it wherever a
 * file link used to be (`<a href={url} target="_blank">`).
 */
export function FileViewButton({ url, name, className, title, ariaLabel, children, canDownload }: {
  url:          string
  name?:        string
  className?:   string
  title?:       string
  ariaLabel?:   string
  children:     ReactNode
  canDownload?: boolean
}) {
  const [open, setOpen] = useState(false)
  const onClick = (e: ReactMouseEvent) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }
  return (
    <>
      <button type="button" onClick={onClick} onContextMenu={blockMenu}
        className={`${className ?? ''} text-left cursor-pointer`} title={title} aria-label={ariaLabel}>
        {children}
      </button>
      {open && <FileViewer url={url} name={name} onClose={() => setOpen(false)} canDownload={canDownload} />}
    </>
  )
}
