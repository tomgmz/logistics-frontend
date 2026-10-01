import Image from 'next/image'
import Link from 'next/link'
import { ASSETS, CONTACT } from '@/lib/data'

/**
 * The footer every page carries.
 *
 * 'full' is the landing page's: brand, links and contact details. 'compact' is
 * a single copyright line for everywhere else — the standalone pages (sign-out,
 * 404, password screens) and the portal dashboards, where a tall footer would
 * only take room from the work. The app is dark-only, so both use plain
 * white-alpha colours.
 */

const YEAR = new Date().getFullYear()

const EXPLORE = [
  { label: 'About',    href: '/#about' },
  { label: 'Services', href: '/#services' },
  { label: 'FAQ',      href: '/#faq' },
  { label: 'Contact',  href: '/#contact' },
]

export default function SiteFooter({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <footer className="shrink-0 w-full border-t border-white/[0.07] px-4 sm:px-6 py-2.5">
        <p className="font-spartan text-center text-[0.65rem] tracking-[0.14em] uppercase text-white/30">
          © {YEAR} 8338 Logistics Services · All Rights Reserved
        </p>
      </footer>
    )
  }

  return (
    <footer className="w-full bg-[#0a0a0a] border-t border-white/[0.07]">
      <div className="sep-x-cyan" />
      <div className="max-w-[1100px] mx-auto px-5 sm:px-8 md:px-12 pt-12 pb-8 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <Link href="/#hero" aria-label="8338 Logistics Services home">
            <Image
              src={ASSETS.logo}
              alt="8338 Logistics"
              width={140}
              height={40}
              className="object-contain w-28 lg:w-[140px]"
            />
          </Link>
          <p className="font-spartan text-white/40 text-[0.8rem] leading-relaxed max-w-[300px]">
            Book, track and manage deliveries in one place — FMCG logistics serving
            businesses nationwide across the Philippines.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-col gap-3">
          <h2 className="ff-sc text-white/80 text-[0.78rem] tracking-[0.2em] uppercase">Explore</h2>
          <ul className="flex flex-col gap-2">
            {EXPLORE.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="font-spartan text-white/45 hover:text-[#4df9ed] text-[0.82rem] transition-colors no-underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
          <h2 className="ff-sc text-white/80 text-[0.78rem] tracking-[0.2em] uppercase">Get In Touch</h2>
          <ul className="flex flex-col gap-2.5 font-spartan text-[0.82rem]">
            <li>
              <a
                href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}
                className="text-white/55 hover:text-[#4df9ed] transition-colors no-underline"
              >
                {CONTACT.phone}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${CONTACT.email}`}
                className="text-white/55 hover:text-[#4df9ed] transition-colors no-underline break-all"
              >
                {CONTACT.email}
              </a>
            </li>
            <li className="text-white/40 leading-relaxed">
              {CONTACT.address.map((line) => <span key={line} className="block">{line}</span>)}
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.06]">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 md:px-12 py-5 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-spartan text-white/30 text-[0.68rem] tracking-[0.18em] uppercase">
            8338 Logistics Services
          </span>
          <span className="font-spartan text-white/30 text-[0.68rem] tracking-[0.18em] uppercase text-center">
            © {YEAR} 8338 Logistics Services. All Rights Reserved.
          </span>
        </div>
      </div>
    </footer>
  )
}
