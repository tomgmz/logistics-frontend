'use client'

import { useRef, useCallback } from 'react'
import { MapPin } from 'lucide-react'
import { usePlacesAutocomplete } from '../hooks/usePlacesAutoComplete'

interface PlacesInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  /** Show the map pin icon on the right — default true */
  showIcon?: boolean
}

export default function PlacesInput({
  value,
  onChange,
  placeholder = 'Enter location',
  className = '',
  showIcon = true,
}: PlacesInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Stable callback so the autocomplete listener doesn't re-bind on every render
  const handleSelect = useCallback(
    (selected: string) => onChange(selected),
    [onChange],
  )

  usePlacesAutocomplete(inputRef, { onSelect: handleSelect })

  return (
    <div className={`flex items-center gap-2 w-full ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="bg-transparent font-body booking-text text-white text-sm lg:text-base
                   focus:outline-none w-full placeholder-white/20"
      />
      {showIcon && (
        <MapPin size={16} className="text-[var(--color-muted)] shrink-0" />
      )}
    </div>
  )
}