'use client'

import { useCallback, useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { getProfile, type Profile, type ProfileContract } from '@/lib/api/auth.api'
import { roleLabel } from '@/lib/roles'
import { formatContractDay } from '@/lib/contract-status'
import { Skeleton } from '@/components/ui/Skeleton'
import { cachedFetch } from '@/lib/query/useApiQuery'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { SecurityCard, UserGuideCard } from './ProfileActions'
import { CardHeader, FIELD_GRID, Field, INNER_CARD, OUTER_CARD } from './profile-ui'

/**
 * The Profile page (2026-11-07), opened from the user card in the sidebar.
 * Shows the account's own details (changed by whoever manages the account, not
 * here). No device sign-out (user, 2026-11-07). Since 2026-11-23 it also has
 * the user guide (PDF, new tab, the person's own role's guide since 2026-11-26)
 * and a password change: an emailed link for the IT Administrator, Company
 * Administrator and General Manager, a request to the IT Administrator for
 * everyone else (ProfileActions.tsx).
 *
 * Laid out like TailAdmin's profile page since 2026-11-26 (user: "use this
 * layout for all profile module"; its "Profile" title inside the card removed
 * by request, the page header already names it): user meta card, Personal Information,
 * Account (TailAdmin's Address slot), Contract for a client, Security, User
 * Guide. TailAdmin's Danger Zone, social links, two-factor row and Edit
 * buttons are left out: details are changed by whoever manages the account.
 */

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

/**
 * Who can change the name, email and mobile number for this role. Every staff
 * account (Company Administrator, General Manager, Operations Manager, Fleet
 * Manager) is edited on the IT Administrator's User Management page; only
 * clients and drivers are edited by a Company Administrator.
 */
function detailsOwner(role: string): string | null {
  if (role === 'it_admin') return null
  if (role === 'client') return 'Contact 8338 Logistics to change these.'
  return 'Ask the IT Administrator to change these.'
}

export default function ProfileView() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState(false)

  const fetchProfile = useCallback(() => {
    cachedFetch(['profile'], () => getProfile(), setProfile).then(setProfile, () => setLoadError(true))
  }, [])

  useEffect(() => { fetchProfile() }, [fetchProfile])
  // Live: details or a contract date changed by the office show at once.
  useLiveTable(['live:users'], fetchProfile)

  const load = () => { setLoadError(false); fetchProfile() }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className="ff-regular flex w-full flex-col gap-3 px-3 py-3 sm:px-4 lg:px-5 lg:pt-3 lg:pb-4 3xl:gap-4 3xl:px-6 3xl:pb-5">
        <div className={`${OUTER_CARD} p-4 sm:p-5 lg:p-6`}>
          {loadError ? (
            <div className={`${INNER_CARD} flex flex-col items-center gap-3 py-10 text-center`}>
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
            <div className="flex flex-col gap-4 lg:gap-6">
              <MetaCard profile={profile} />
              <PersonalCard profile={profile} />
              <AccountCard profile={profile} />
              {/* A client also sees their company's contract, as one more card
                  under their details (no tabs, user 2026-11-07). */}
              {profile.role === 'client' && <ContractCard profile={profile} />}
              <SecurityCard profile={profile} />
              <UserGuideCard role={profile.role} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-busy="true" aria-label="Loading profile">
      <div className={`${INNER_CARD} flex flex-col items-center gap-5 xl:flex-row`}>
        <Skeleton className="size-20 rounded-full" />
        <div className="flex flex-col items-center gap-2 xl:items-start">
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      {Array.from({ length: 2 }).map((_, c) => (
        <div key={c} className={INNER_CARD}>
          <Skeleton className="mb-6 h-5 w-44" />
          <div className={FIELD_GRID}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-40 max-w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** TailAdmin's user meta card: avatar, name, and the role (| company for a client). No social links, no Edit. */
function MetaCard({ profile }: { profile: Profile }) {
  const initial = (profile.first_name?.[0] ?? profile.email[0] ?? '?').toUpperCase()
  return (
    <section className={INNER_CARD}>
      <div className="flex flex-col items-center gap-5 xl:flex-row">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-[var(--color-cyan)]">
          <span className="font-card !text-[1.6rem] font-bold text-[var(--color-bg)]">{initial}</span>
        </div>
        <div className="min-w-0 max-w-full text-center xl:text-left">
          <p className="mb-2 break-words text-[clamp(1.15rem,5vw,1.4rem)] font-semibold leading-tight text-white">
            {fullName(profile)}
          </p>
          <div className="flex flex-col items-center gap-1 xl:flex-row xl:gap-3">
            <p className="text-[15px] text-[#818181]">{roleLabel(profile.role)}</p>
            {profile.company_name && (
              <>
                <div className="hidden h-3.5 w-px bg-[#424242] xl:block" aria-hidden />
                <p className="break-words text-[15px] text-[#818181]">{profile.company_name}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * TailAdmin's Personal Information card. Read-only here: where TailAdmin has
 * its Edit button, the card says who changes these details.
 */
function PersonalCard({ profile }: { profile: Profile }) {
  const owner = detailsOwner(profile.role)
  const middle = profile.middle_name?.trim()
  const suffix = profile.suffix?.trim()
  return (
    <section className={INNER_CARD}>
      <CardHeader
        title="Personal Information"
        aside={owner && <p className="text-[14px] leading-snug text-[#818181] sm:max-w-[260px] sm:text-right">{owner}</p>}
      />
      <dl className={FIELD_GRID}>
        <Field label="First name" value={profile.first_name?.trim() || 'Not set'} />
        <Field label="Last name" value={profile.last_name?.trim() || 'Not set'} />
        {middle && <Field label="Middle name" value={middle} />}
        {suffix && <Field label="Suffix" value={suffix} />}
        <Field label="Email" value={profile.email} />
        <Field label="Mobile number" value={profile.phone?.trim() || 'Not set'} />
      </dl>
    </section>
  )
}

/** Where TailAdmin has its Address card: the account's own facts. */
function AccountCard({ profile }: { profile: Profile }) {
  return (
    <section className={INNER_CARD}>
      <CardHeader title="Account" />
      <dl className={FIELD_GRID}>
        <Field label="Role" value={roleLabel(profile.role)} />
        {profile.company_name && <Field label="Company" value={profile.company_name} />}
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

/** The contract as a TailAdmin card: its state badge sits where TailAdmin has Edit. */
function ContractCard({ profile }: { profile: Profile }) {
  const c = profile.contract
  if (!c) return null
  const summary = contractSummary(c)
  const expired = c.state === 'grace' || c.state === 'ended'
  return (
    <section className={INNER_CARD}>
      <CardHeader
        title="Contract validity"
        aside={
          <span
            className="inline-flex w-fit shrink-0 items-center rounded-[10px] border-[0.5px] px-2.5 py-0.5 text-[14px] font-bold"
            style={{ color: summary.color, borderColor: summary.color, background: `${summary.color}1f` }}
          >
            {summary.label}
          </span>
        }
      />
      <p className="mb-5 text-[15px] leading-snug text-white/80">{summary.note}</p>
      <dl className={FIELD_GRID}>
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
