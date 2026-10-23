'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, FileUp, Loader2, Upload } from 'lucide-react'
import { appReleaseService, type AppRelease } from '@/lib/services/admin/app-release.service'
import { getApiErrorMessage } from '@/lib/api-error'
import { formatDateTime } from '@/app/utils/timeFormat'
import { appToast } from '@/lib/toast'
import RefreshButton from '@/components/ui/RefreshButton'

const inputCls =
  'w-full rounded-[10px] border border-[#424242] bg-[#2a2a2a99] px-3 py-2 text-[13px] text-white placeholder-[#555] outline-none transition-colors focus:border-[#4df9ed]'

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Publish a new driver app APK to the website's /download page.
 *
 * The app is not on the Play Store: drivers install it from /download, which
 * always offers the newest version published here.
 */
export default function AppReleasePage() {
  const [releases, setReleases] = useState<AppRelease[]>([])
  const [loading,  setLoading]  = useState(true)
  const [file,     setFile]     = useState<File | null>(null)
  const [version,  setVersion]  = useState('')
  const [notes,    setNotes]    = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [error,    setError]    = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const downloadPage = typeof window !== 'undefined' ? `${window.location.origin}/download` : '/download'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReleases(await appReleaseService.list())
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load app versions.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const busy = progress !== null

  async function handlePublish() {
    setError('')
    if (!file) { setError('Choose the app\'s .apk file.'); return }
    if (!/\.apk$/i.test(file.name)) { setError('That is not an .apk file.'); return }
    if (!version.trim()) { setError('Enter the version, e.g. 1.2.0.'); return }

    setProgress(0)
    try {
      const release = await appReleaseService.publish(file, { version, notes }, setProgress)
      appToast.success(`Version ${release.version} is now on the download page.`)
      setFile(null); setVersion(''); setNotes('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e) {
      setError(getApiErrorMessage(e, 'Publishing failed.'))
    } finally {
      setProgress(null)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(downloadPage)
      appToast.success('Download page link copied')
    } catch {
      appToast.error('Could not copy. Select the link and copy it instead.')
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#0a0a0a] px-3 py-3 text-white lg:px-4">
      <div className="flex w-full flex-col gap-3">
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="font-[family-name:var(--font-alegreya-sc)] text-[17px] font-bold text-white 3xl:text-[20px]">App Release</h1>
          <RefreshButton onClick={() => void load()} loading={loading} disabled={loading} />
        </div>

        {/* Where drivers get it */}
        <div className="flex flex-col gap-2 rounded-[10px] border border-[#424242] bg-[#1b1b1b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[13px]">
            <p className="text-[#818181]">Drivers download the app from</p>
            <a href="/download" target="_blank" rel="noreferrer" className="break-all text-[#4df9ed] underline underline-offset-2">
              {downloadPage}
            </a>
          </div>
          <button
            type="button"
            onClick={copyLink}
            className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#424242] px-3 py-2 text-[13px] text-white transition-colors max-sm:w-full [@media(hover:hover)]:hover:bg-[#2a2a2a]"
          >
            <Copy size={14} /> Copy Link
          </button>
        </div>

        {/* Publish */}
        <section className="rounded-[10px] border border-[#424242] bg-[#1b1b1b] p-4">
          <h2 className="text-[15px] font-bold text-white">Publish a New Version</h2>
          <p className="mt-0.5 text-[12px] text-[#818181]">
            Upload the release APK. As soon as it is published, the download page offers it to every driver.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#818181]">APK File <span className="text-[#4df9ed]">*</span></label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex items-center gap-3 rounded-[10px] border border-dashed border-[#424242] bg-[#2a2a2a99] px-3 py-3 text-left text-[13px] transition-colors disabled:opacity-50 [@media(hover:hover)]:hover:border-[#4df9ed]/60"
              >
                <FileUp size={18} className="shrink-0 text-[#4df9ed]" />
                <span className="min-w-0 truncate">
                  {file ? `${file.name} · ${formatSize(file.size)}` : 'Choose the .apk file'}
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError('') }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="app-version" className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#818181]">Version <span className="text-[#4df9ed]">*</span></label>
              <input id="app-version" className={inputCls} value={version} disabled={busy}
                onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label htmlFor="app-notes" className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#818181]">What&apos;s New</label>
              <textarea id="app-notes" rows={3} className={inputCls} value={notes} disabled={busy}
                onChange={(e) => setNotes(e.target.value)} placeholder="Optional. Shown to drivers on the download page." />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-[#f62626]/30 bg-[#f62626]/10 px-3 py-2 text-[13px] text-[#f62626]">{error}</p>
          )}

          {busy && (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#2a2a2a]">
                <div className="h-full bg-[#4df9ed] transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-[12px] text-[#818181]">
                {progress! < 100 ? `Uploading… ${progress}%` : 'Publishing…'} Keep this page open.
              </p>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handlePublish}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#4df9ed] px-5 py-2 text-sm font-semibold text-[#0a0a0a] transition active:scale-95 disabled:opacity-40 max-sm:w-full [@media(hover:hover)]:hover:bg-[#7bfbf5]"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Publish Version
            </button>
          </div>
        </section>

        {/* History */}
        <section className="rounded-[10px] border-[0.5px] border-[#424242] bg-[#1b1b1b]">
          <h2 className="px-4 pt-3 text-[15px] font-bold text-white">Published Versions</h2>
          {/* Phones scroll the table sideways rather than squeezing it. */}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="ff-sc text-[12px] text-[#818181]">
                <tr className="border-b border-[#2a2a2a]">
                  <th className="px-4 py-2 font-bold">Version</th>
                  <th className="px-4 py-2 font-bold">Published</th>
                  <th className="px-4 py-2 font-bold">Size</th>
                  <th className="px-4 py-2 font-bold">What&apos;s New</th>
                </tr>
              </thead>
              <tbody>
                {releases.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[#818181]">
                      {loading ? 'Loading…' : 'No version published yet. The download page says the app is coming soon.'}
                    </td>
                  </tr>
                ) : releases.map((r, i) => (
                  <tr key={r.release_id} className="border-b border-[#2a2a2a] last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <a href={r.file_url} className="text-white underline-offset-2 [@media(hover:hover)]:hover:underline">{r.version}</a>
                      {i === 0 && (
                        <span className="ml-2 rounded-full bg-[#3af626]/15 px-2 py-0.5 text-[11px] text-[#3af626]">Current</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[#b5b5b5]">{formatDateTime(r.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[#b5b5b5]">{formatSize(r.size_bytes)}</td>
                    <td className="max-w-[320px] truncate px-4 py-2.5 text-[#b5b5b5]" title={r.notes ?? undefined}>{r.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
