'use client'

/**
 * The PH mobile input every form uses: a fixed "+63" prefix and ten digits typed
 * after it, shown as 929-2143-537. The form state holds only the local digits;
 * attachCountryCode() turns them into the +639XXXXXXXXX the validators and the
 * API expect.
 */

const inputBase =
  'w-full rounded-[10px] border border-[#424242] bg-[#2a2a2a99] px-3 py-2 text-[13px] text-white placeholder-[#555] outline-none transition-colors duration-150 focus:border-[#4df9ed] hover:border-[#4df9ed50]'

const MAX_DIGITS = 10

/** A stored number ("+639171234567", "09171234567") as the local digits the input holds. */
export function toLocalDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('63')) return digits.slice(2)
  if (digits.startsWith('0'))  return digits.slice(1)
  return digits
}

export function attachCountryCode(local: string): string {
  return `+63${local.replace(/\D/g, '')}`
}

function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '')
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 10)}`
}

export default function PhoneInputRow({
  value,
  onChange,
  placeholder = '929-2143-537',
  error,
}: {
  /** Local digits, without the +63. */
  value: string
  onChange: (digits: string) => void
  placeholder?: string
  error?: string
}) {
  return (
    <div className="flex">
      <span className="flex items-center rounded-l-[10px] border border-r-0 border-[#424242] bg-[#232323] px-3 text-[13px] font-medium text-[#818181] select-none">
        +63
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={formatPhone(value)}
        onChange={e => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, MAX_DIGITS)
          // A PH mobile starts with 9 after the +63; a leading 0 or 1 is never right.
          if (digits.length > 0 && (digits.startsWith('0') || digits.startsWith('1'))) return
          onChange(digits)
        }}
        placeholder={placeholder}
        maxLength={MAX_DIGITS + Math.floor(MAX_DIGITS / 3)}
        className={`${inputBase} rounded-l-none ${error ? 'border-red-500/60' : ''}`}
      />
    </div>
  )
}
