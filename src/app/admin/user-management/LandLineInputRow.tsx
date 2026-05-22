'use client'

import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { systemMaintenanceService, type LandlinePrefix } from '@/lib/services/admin/system-maintenance.service'

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

  useEffect(() => {
    systemMaintenanceService.getLandlinePrefixes()
      .then(prefixes => setAreaCodes(prefixes.filter(p => p.is_active)))
      .catch(() => {})
  }, [])

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
      <select
        value={areaCode}
        onChange={e => handleAreaChange(e.target.value)}
        className={[
          'rounded-l-[10px] border border-r-0 border-[#424242] bg-[#232323] px-2 py-2',
          'text-[13px] text-white outline-none cursor-pointer',
          'transition-colors duration-150 appearance-none',
          error
            ? 'border-red-500/60 focus:border-red-500 hover:border-red-500/80'
            : 'focus:border-[#4df9ed] hover:border-[#4df9ed50]',
        ].join(' ')}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat:   'no-repeat',
          backgroundPosition: 'right 8px center',
          paddingRight: '24px',
          minWidth:     '180px',
        }}
      >
        <option value="">Select city</option>
        {areaCodes.map(a => (
          <option key={a.prefix_id} value={a.prefix}>
            ({a.prefix}) {a.city}
          </option>
        ))}
      </select>

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