'use client'

import { type InputHTMLAttributes } from 'react'

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

const PH_AREA_CODES: { code: string; city: string }[] = [
  { code: '2',  city: 'Metro Manila' },
  { code: '32', city: 'Cebu City' },
  { code: '33', city: 'Iloilo City' },
  { code: '34', city: 'Bacolod City' },
  { code: '35', city: 'Dumaguete City' },
  { code: '36', city: 'Roxas City' },
  { code: '38', city: 'Tacloban City' },
  { code: '42', city: 'Lucena City' },
  { code: '43', city: 'Batangas City' },
  { code: '44', city: 'Cabanatuan City' },
  { code: '45', city: 'San Fernando, Pampanga' },
  { code: '46', city: 'Cavite City' },
  { code: '47', city: 'Olongapo City' },
  { code: '48', city: 'Puerto Princesa' },
  { code: '49', city: 'Calamba, Laguna' },
  { code: '52', city: 'Legazpi City' },
  { code: '53', city: 'Catbalogan City' },
  { code: '54', city: 'Naga City' },
  { code: '55', city: 'Sorsogon City' },
  { code: '62', city: 'Davao City' },
  { code: '63', city: 'General Santos City' },
  { code: '64', city: 'Cotabato City' },
  { code: '65', city: 'Pagadian City' },
  { code: '68', city: 'Dipolog City' },
  { code: '72', city: 'Dagupan City' },
  { code: '74', city: 'Baguio City' },
  { code: '75', city: 'Urdaneta City' },
  { code: '77', city: 'Vigan City' },
  { code: '78', city: 'Laoag City' },
  { code: '82', city: 'Davao City (alt)' },
  { code: '83', city: 'Kidapawan City' },
  { code: '85', city: 'Butuan City' },
  { code: '86', city: 'Cagayan de Oro City' },
  { code: '87', city: 'Iligan City' },
  { code: '88', city: 'Ozamiz City' },
]

function splitDigits(digits: string): { areaCode: string; subscriber: string } {
  if (!digits) return { areaCode: '', subscriber: '' }
  if (digits.startsWith('2')) {
    return { areaCode: '2', subscriber: digits.slice(1) }
  }
  const twoDigit = PH_AREA_CODES.find(a => a.code.length === 2 && digits.startsWith(a.code))
  if (twoDigit) {
    return { areaCode: twoDigit.code, subscriber: digits.slice(2) }
  }
  return { areaCode: '', subscriber: digits }
}

function subscriberMaxLength(areaCode: string): number {
  return areaCode === '2' ? 7 : 7 // Metro Manila 7, others 7–8; 7 as safe default
}

export function toLocalLandlineDigits(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('63')) return digits.slice(2)
  if (digits.startsWith('0'))  return digits.slice(1)
  return digits
}

interface LandlineInputRowProps {
  value: string       
  onChange: (digits: string) => void
  error?: string
}

export default function LandlineInputRow({ value, onChange, error }: LandlineInputRowProps) {
  const { areaCode, subscriber } = splitDigits(value)
  const maxSub = subscriberMaxLength(areaCode)

  function handleAreaChange(code: string) {
    onChange(code + subscriber.slice(0, maxSub))
  }

  function handleSubscriberChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, maxSub)
    onChange(areaCode + digits)
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
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          paddingRight: '24px',
          minWidth: '180px',
        }}
      >
        <option value="">Select city</option>
        {PH_AREA_CODES.map(a => (
          <option key={a.code} value={a.code}>
            ({a.code.length === 1 ? `0${a.code}` : a.code}) {a.city}
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
          error
            ? 'focus:border-red-500 hover:border-red-500/80'
            : '',
        ].join(' ')}
      />
      </div>
    )
}