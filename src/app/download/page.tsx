import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Download, ShieldCheck, Smartphone } from 'lucide-react'
import { ASSETS } from '@/lib/data'
import SiteFooter from '@/components/layout/SiteFooter'
import { getLatestAppRelease } from '@/lib/server/app-release'

export const metadata: Metadata = {
  title: 'Download the Driver App',
  description: 'Download and install the 8338 Logistics driver app on your Android phone.',
  alternates: { canonical: '/download' },
}

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric',
  })
}

// Worded for drivers installing an app outside the Play Store for the first
// time: Android asks for permission once, and the wording differs by phone.
const STEPS: { title: string; body: string }[] = [
  {
    title: 'Download the app',
    body: 'Tap the Download button on this page. Open this page on the Android phone you will drive with.',
  },
  {
    title: 'Open the downloaded file',
    body: 'When the download finishes, tap "Open" in the notification, or open your Files / Downloads app and tap the 8338 file.',
  },
  {
    title: 'Allow the install',
    body: 'Android may say it cannot install apps from this source. Tap "Settings", turn on "Allow from this source" (or "Install unknown apps"), then go back.',
  },
  {
    title: 'Install and sign in',
    body: 'Tap "Install". If Play Protect asks, tap "More details" then "Install anyway". Open the app and sign in with the details from your welcome email.',
  },
]

export default async function DownloadPage() {
  const release = await getLatestAppRelease()

  return (
    <>
      {/* Not the landing Navbar: its links scroll to sections only the home page has. */}
      <header className="bg-[#0a0a0a] px-4 pt-5 sm:px-8">
        <Link href="/" aria-label="8338 Logistics Services home" className="inline-block">
          <Image src={ASSETS.logo} alt="8338 Logistics" width={140} height={40} className="w-28 object-contain sm:w-[140px]" />
        </Link>
      </header>
      <main className="min-h-svh bg-[#0a0a0a] text-white pt-10 pb-16 sm:pt-14">
        <div className="mx-auto w-full max-w-[720px] px-4 sm:px-8">
          <h1 className="font-display-italic text-center leading-[1.0]">
            Driver <span className="text-[#4df9ed]">App</span>
          </h1>
          <p className="ff-regular mx-auto mt-4 max-w-md text-center text-[15px] leading-relaxed text-[#b5b5b5]">
            The 8338 Logistics driver app is not on the Play Store. Download it here and install it
            on your Android phone.
          </p>

          <section className="mt-8 rounded-[20px] border border-white/[0.10] bg-[#111] p-5 sm:p-8">
            {release ? (
              <div className="flex flex-col items-center gap-4 text-center">
                <a
                  href={release.file_url}
                  download
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#4df9ed] px-6 py-4 text-base font-bold text-[#0a0a0a] transition-transform active:scale-[0.98] sm:w-auto sm:min-w-[320px] [@media(hover:hover)]:hover:bg-[#7bfbf5]"
                >
                  <Download size={20} />
                  Download for Android
                </a>
                <p className="text-[13px] text-[#818181]">
                  Version {release.version} · {formatSize(release.size_bytes)} · {formatDate(release.created_at)}
                </p>
                {release.notes && (
                  <div className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[#818181]">What&apos;s new</p>
                    <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-white/80">{release.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="py-6 text-center text-[15px] text-[#b5b5b5]">
                The app download will be available here soon. Ask your Operations Manager if you need it now.
              </p>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-[13px] font-bold uppercase tracking-widest text-[#818181]">How to install</h2>
            <ol className="mt-4 flex flex-col gap-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4 rounded-xl border border-white/[0.08] bg-[#111] p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4df9ed]/15 text-sm font-bold text-[#4df9ed]">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{step.title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-[#b5b5b5]">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="flex gap-3 rounded-xl border border-white/[0.08] bg-[#111] p-4">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#3af626]" />
              <p className="text-[13px] leading-relaxed text-[#b5b5b5]">
                Only download the app from this page. Never install a copy someone sends you in a chat.
              </p>
            </div>
            <div className="flex gap-3 rounded-xl border border-white/[0.08] bg-[#111] p-4">
              <Smartphone size={18} className="mt-0.5 shrink-0 text-[#ffea00]" />
              <p className="text-[13px] leading-relaxed text-[#b5b5b5]">
                Android only. To update, download again from this page and install over the old app —
                you stay signed in.
              </p>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
