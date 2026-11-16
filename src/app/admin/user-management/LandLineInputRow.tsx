'use client'

import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { systemMaintenanceService, type LandlinePrefix } from '@/lib/services/admin/system-maintenance.service'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { cachedFetch } from '@/lib/query/useApiQuery'
import Combobox from '@/components/ui/Combobox'

const inputBase =
  'w-full rounded-[10px] border border-[#424242] bg-[#2a2a2a99] px-3 py-2 text-[13px] text-white placeholder-[#555] outline-none transition-colors duration-150 focus:border-[#4df9ed] hover:border-[#4df9ed50]'

function Input({
  error,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'required'> & { error?: string }) {
  return (
    <input
      {...props}
      className={`${inputBase} ${error ? 'border-red-500/60' : ''} ${className}`}
    />
  )
}

function getRawPrefix(prefix: string): string {
  return prefix.replace(/^0+/, '')
}

function splitDigits(digits: string, areaCodes: LandlinePrefix[]): { areaCode: string; subscriber: string } {
  if (!digits) return { areaCode: '', subscriber: '' }
  const match = areaCodes
    .map(a => ({ ...a, raw: getRawPrefix(a.prefix) }))
    .sort((a, b) => b.raw.length - a.raw.length)
    .find(a => digits.startsWith(a.raw))
  if (!match) return { areaCode: '', subscriber: digits }
  return { areaCode: match.prefix, subscriber: digits.slice(match.raw.length) }
}

function subscriberMaxLength(areaCode: string): number {
  return getRawPrefix(areaCode) === '2' ? 8 : 7
}

export function toLocalLandlineDigits(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('63')) return digits.slice(2)
  if (digits.startsWith('0'))  return digits.slice(1)
  return digits
}

interface LandlineInputRowProps {
  value:    string
  onChange: (digits: string) => void
  error?:   string
}

export default function LandlineInputRow({ value, onChange, error }: LandlineInputRowProps) {
  const [areaCodes, setAreaCodes] = useState<LandlinePrefix[]>([])

  function loadPrefixes() {
    cachedFetch(['landline-prefixes'], () => systemMaintenanceService.getLandlinePrefixes(),
      prefixes => setAreaCodes(prefixes.filter(p => p.is_active)))
      .then(prefixes => setAreaCodes(prefixes.filter(p => p.is_active)))
      .catch(() => {})
  }

  useEffect(() => { loadPrefixes() }, [])
  // A prefix added or switched off in System Maintenance shows up here right away.
  useLiveTable(['live:catalog'], loadPrefixes)

  const { areaCode, subscriber } = splitDigits(value, areaCodes)
  const maxSub = subscriberMaxLength(areaCode)

  function handleAreaChange(code: string) {
    const rawCode = getRawPrefix(code)
    onChange(rawCode + subscriber.slice(0, subscriberMaxLength(code)))
  }

  function handleSubscriberChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, maxSub)
    onChange(getRawPrefix(areaCode) + digits)
  }

  return (
    <div className="flex">
      <Combobox
        value={areaCode}
        aria-label="City (area code)"
        searchPlaceholder="Search city or area code"
        emptyText="No city matches."
        onChange={e => handleAreaChange(e.target.value)}
        className={[
          'rounded-l-[10px] border border-r-0 border-[#424242] bg-[#232323] px-2 py-2',
          'text-[13px] text-white outline-none cursor-pointer',
          'transition-colors duration-150',
          error
            ? 'border-red-500/60 focus:border-red-500 hover:border-red-500/80'
            : 'focus:border-[#4df9ed] hover:border-[#4df9ed50]',
        ].join(' ')}
        style={{ minWidth: '180px' }}
      >
        <option value="">Select city</option>
        {areaCodes.map(a => (
          <option key={a.prefix_id} value={a.prefix}>
            ({a.prefix}) {a.city}
          </option>
        ))}
      </Combobox>

      <Input
        type="tel"
        value={subscriber}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSubscriberChange(e.target.value)}
        placeholder={areaCode ? `${maxSub}-digit number` : 'Select city first'}
        disabled={!areaCode}
        error={error}
        className={[
          'rounded-l-none disabled:opacity-40 disabled:cursor-not-allowed',
          error ? 'focus:border-red-500 hover:border-red-500/80' : '',
        ].join(' ')}
      />
    </div>
  )
}