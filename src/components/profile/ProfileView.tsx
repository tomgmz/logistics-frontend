'use client'

import { useCallback, useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { getProfile, type Profile, type ProfileContract } from '@/lib/api/auth.api'
import { roleLabel } from '@/lib/roles'
import { formatContractDay } from '@/lib/contract-status'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * The Profile page (2026-11-07), opened from the user card in the sidebar.
 * Shows the account's own details (changed by whoever manages the account, not
 * here). Read-only: no password change (it goes through the Company
 * Administrator) and no device sign-out (user, 2026-11-07).
 */

const CARD = 'rounded-[10px] border-[0.5px] border-[#424242] bg-[#141414]'

const manila = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : manila.format(d)
}

function fullName(p: Profile): string {
  const name = [p.first_name, p.middle_name, p.last_name, p.suffix]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')
  return name || p.email
}

/** Who can change the name, email and mobile number for this role. */
function detailsOwner(role: string): string | null {
  if (role === 'admin') return 'Ask the IT Administrator to change these.'
  if (role === 'it_admin') return null
  if (role === 'client') return 'Contact 8338 Logistics to change these.'
  return 'Ask a Company Administrator to change these.'
}

export default function ProfileView() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState(false)

  const fetchProfile = useCallback(() => {
    getProfile().then(setProfile, () => setLoadError(true))
  }, [])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  const load = () => { setLoadError(false); fetchProfile() }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="ff-regular mx-auto flex w-full max-w-[880px] flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-6">
        {loadError ? (
          <div className={`${CARD} flex flex-col items-center gap-3 px-5 py-10 text-center`}>
            <p className="text-[16px] text-white/80">Your profile could not be loaded.</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-[8px] border-[0.5px] border-[#424242] px-4 py-2 text-[15px] text-white transition-colors [@media(hover:hover)]:hover:bg-white/5"
            >
              <RotateCw size={15} /> Retry
            </button>
          </div>
        ) : !profile ? (
          <ProfileSkeleton />
        ) : (
          <>
            <IdentityCard profile={profile} />
            <DetailsCard profile={profile} />
            {/* A client also sees their company's contract, as one more card
                under their details (no tabs, user 2026-11-07). */}
            {profile.role === 'client' && <ContractCard profile={profile} />}
          </>
        )}
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <>
      <div className={`${CARD} flex items-center gap-4 p-5`}>
        <Skeleton className="size-[64px] rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className={`${CARD} grid gap-4 p-5 sm:grid-cols-2`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-40 max-w-full" />
          </div>
        ))}
      </div>
    </>
  )
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <h2 className="ff-sc text-[18px] leading-tight text-white">{children}</h2>
      {hint && <p className="text-[14px] leading-snug text-[#818181]">{hint}</p>}
    </div>
  )
}

function IdentityCard({ profile }: { profile: Profile }) {
  const initial = (profile.first_name?.[0] ?? profile.email[0] ?? '?').toUpperCase()
  return (
    <section className={`${CARD} flex items-center gap-4 p-4 sm:p-5`}>
      <div className="flex size-[56px] shrink-0 items-center justify-center rounded-full bg-[var(--color-cyan)] sm:size-[64px]">
        <span className="font-card !text-[1.4rem] font-bold text-[var(--color-bg)]">{initial}</span>
      </div>
      <div className="min-w-0">
        <p className="break-words text-[clamp(1.15rem,5vw,1.5rem)] leading-tight text-white">{fullName(profile)}</p>
        <p className="mt-1 text-[16px] text-[#818181]">{roleLabel(profile.role)}</p>
      </div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="ff-sc text-[13px] tracking-wide text-[#818181]">{label}</dt>
      <dd className="mt-1 break-words text-[16px] text-white">{value}</dd>
    </div>
  )
}

function DetailsCard({ profile }: { profile: Profile }) {
  const owner = detailsOwner(profile.role)
  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <SectionTitle hint={owner ?? undefined}>Account details</SectionTitle>
      <dl className="grid gap-4 sm:grid-cols-2">
        {profile.company_name && <Field label="Company" value={profile.company_name} />}
        <Field label="Email" value={profile.email} />
        <Field label="Mobile number" value={profile.phone?.trim() || 'Not set'} />
        <Field label="Role" value={roleLabel(profile.role)} />
        <Field label="Account created" value={formatWhen(profile.created_at)} />
        <Field label="Last sign-in" value={formatWhen(profile.last_login_at)} />
      </dl>
    </section>
  )
}

/** "12 days", "1 day". */
function dayCount(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`
}

/** The badge and one-line explanation for the contract's state, on the fixed palette. */
function contractSummary(c: ProfileContract): { label: string; color: string; note: string } {
  if (!c.valid_until) {
    return {
      label: 'No end date on file',
      color: '#818181',
      note:  'No contract end date has been entered for your company. Contact 8338 Logistics if this is wrong.',
    }
  }
  if (c.state === 'grace' || c.state === 'ended') {
    return {
      label: 'Expired',
      color: '#F62626',
      note:  c.access_until
        ? `New bookings are closed. You can still sign in and view your records until ${formatContractDay(c.access_until)}. Contact 8338 Logistics to renew.`
        : 'New bookings are closed. Contact 8338 Logistics to renew.',
    }
  }
  const left = c.days_left ?? 0
  if (left === 0) {
    return { label: 'Last day today', color: '#FF7A30', note: 'Your contract ends today. Contact 8338 Logistics to renew it so booking stays open.' }
  }
  if (left <= 7) {
    return { label: 'Expiring soon', color: '#FF7A30', note: `${dayCount(left)} left. Contact 8338 Logistics to renew it so booking stays open.` }
  }
  if (left <= 30) {
    return { label: 'Expiring soon', color: '#FFEA00', note: `${dayCount(left)} left. Contact 8338 Logistics to renew it.` }
  }
  return { label: 'Active', color: '#3AF626', note: `${dayCount(left)} left.` }
}

function ContractCard({ profile }: { profile: Profile }) {
  const c = profile.contract
  if (!c) return null
  const summary = contractSummary(c)
  const expired = c.state === 'grace' || c.state === 'ended'
  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <SectionTitle>Contract validity</SectionTitle>
      <div className="mb-4 flex flex-col gap-2">
        <span
          className="inline-flex w-fit items-center rounded-[10px] border-[0.5px] px-2.5 py-0.5 text-[14px] font-bold"
          style={{ color: summary.color, borderColor: summary.color, background: `${summary.color}1f` }}
        >
          {summary.label}
        </span>
        <p className="text-[15px] leading-snug text-white/80">{summary.note}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        {profile.company_name && <Field label="Company" value={profile.company_name} />}
        <Field label="Valid until" value={c.valid_until ? formatContractDay(c.valid_until) : 'Not on file'} />
        {c.valid_until && !expired && c.days_left !== null && (
          <Field label="Days left" value={c.days_left === 0 ? 'Ends today' : dayCount(c.days_left)} />
        )}
        {c.valid_until && expired && c.days_left !== null && (
          <Field label="Ended" value={`${dayCount(-c.days_left)} ago`} />
        )}
        {expired && c.access_until && (
          <Field label="Sign-in open until" value={formatContractDay(c.access_until)} />
        )}
      </dl>
    </section>
  )
}
