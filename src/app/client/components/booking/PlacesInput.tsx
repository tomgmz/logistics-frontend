'use client'

import { useRef, useCallback } from 'react'
import { MapPin } from 'lucide-react'
import { usePlacesAutocomplete } from '../../hooks/usePlacesAutoComplete'

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

  const handleSelect = useCallback(
    (selected: string) => onChange(selected),
    [onChange],
  )

  usePlacesAutocomplete(inputRef, { onSelect: handleSelect })

  return (
    <>
      <style>{`
        /* Container */
        .pac-container {
          background-color: #1b1b1b !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          border-top: none !important;
          border-radius: 0 0 12px 12px !important;
          box-shadow: 0 16px 40px rgba(0,0,0,0.6) !important;
          font-family: inherit !important;
          margin-top: 2px !important;
        }

        /* Hide the Google logo */
        .pac-container::after {
          display: none !important;
          height: 0 !important;
        }

        /* Each suggestion row */
        .pac-item {
          background-color: #1b1b1b !important;
          border-top: 1px solid rgba(255,255,255,0.05) !important;
          color: #818181 !important;
          padding: 10px 14px !important;
          cursor: pointer !important;
          transition: background 0.15s ease !important;
          font-size: 0.8rem !important;
          line-height: 1.4 !important;
        }

        .pac-item:first-child {
          border-top: none !important;
        }

        /* Hovered / keyboard-selected row */
        .pac-item:hover,
        .pac-item-selected {
          background-color: rgba(77,249,237,0.07) !important;
        }

        /* Main text (place name) */
        .pac-item-query {
          color: #ffffff !important;
          font-size: 0.85rem !important;
        }

        /* Matched portion highlight */
        .pac-matched {
          color: #4df9ed !important;
          font-weight: 600 !important;
        }

        /* The little pin/location icon */
        .pac-icon {
          filter: invert(1) brightness(0.5) !important;
          margin-top: 2px !important;
        }
      `}</style>

      <div className={`flex items-center gap-2 w-full ${className}`}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="bg-transparent font-body booking-text text-white text-sm lg:text-base
                     focus:outline-none w-full placeholder-white/20 caret-[var(--color-cyan)]"
        />
        {showIcon && (
          <MapPin size={16} className="text-[var(--color-muted)] shrink-0" />
        )}
      </div>
    </>
  )
}