'use client'

import { useState, useCallback } from 'react'
import MuiAutocomplete from '@mui/material/Autocomplete'
import TextField      from '@mui/material/TextField'
import type { TextFieldProps } from '@mui/material/TextField'
import CircularProgress from '@mui/material/CircularProgress'
import { usePlacesAutocomplete } from '@/lib/hooks/usePlacesAutoComplete'
import type { PlaceSuggestion, ResolvedPlace } from '@/lib/hooks/usePlacesAutoComplete'

type PlacesInputProps = Omit<TextFieldProps, 'onChange'> & {
  value:      string
  onChange:   (value: string) => void
  onResolve?: (resolved: ResolvedPlace) => void
  error?:     boolean
  errorMsg?:  string
}

export default function PlacesInput({
  value,
  onChange,
  onResolve,
  error,
  errorMsg,
  placeholder,
  ...textFieldProps
}: PlacesInputProps) {
  const [inputValue, setInputValue] = useState(value)

  const { suggestions, loading, onInputChange, resolvePlace } = usePlacesAutocomplete({
    includedPrimaryTypes: ['geocode', 'street_address', 'premise'],
  })

  const handleInputChange = useCallback(
    (_: unknown, newInput: string) => {
      setInputValue(newInput)
      onInputChange(newInput)
    },
    [onInputChange],
  )

  const handleSelect = useCallback(
    async (_: unknown, selected: string | PlaceSuggestion | null) => {
      if (!selected || typeof selected === 'string') return
      const resolved = await resolvePlace(selected.placeId)
      setInputValue(resolved.address)
      onChange(resolved.address)
      onResolve?.(resolved)
    },
    [resolvePlace, onChange, onResolve],
  )

  const handleBlur = useCallback(async () => {
    if (!inputValue || suggestions.length === 0) return
    const first = suggestions[0]
    if (first) {
      const resolved = await resolvePlace(first.placeId)
      setInputValue(resolved.address)
      onChange(resolved.address)
      onResolve?.(resolved)
    }
  }, [inputValue, suggestions, resolvePlace, onChange, onResolve])

  return (
    <div className="flex flex-col gap-1.5">
      <MuiAutocomplete<PlaceSuggestion, false, false, true>
        fullWidth
        freeSolo
        options={suggestions}
        getOptionLabel={o => (typeof o === 'string' ? o : o.label)}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onChange={handleSelect}
        loading={loading}
        filterOptions={x => x}
        slotProps={{
          paper: {
            sx: {
              bgcolor:      '#1b1b1b',
              border:       '1px solid #2a2a2a',
              borderRadius: '10px',
              mt:           '4px',
              boxShadow:    '0 8px 32px rgba(0,0,0,0.6)',
              '& .MuiAutocomplete-option': {
                fontSize:  '13px',
                color:     '#ccc',
                px:        '12px',
                py:        '8px',
                '&[aria-selected="true"]':      { bgcolor: '#2a2a2a' },
                '&.Mui-focused':                { bgcolor: '#252525' },
                '&:hover':                      { bgcolor: '#252525' },
              },
            },
          },
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            {...textFieldProps}
            fullWidth
            variant="outlined"
            placeholder={placeholder as string ?? 'Search address…'}
            error={error}
            onBlur={handleBlur}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading && <CircularProgress size={14} sx={{ color: '#4df9ed' }} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius:    '10px',
                backgroundColor: '#2a2a2a99',
                color:           '#fff',
                fontSize:        '13px',
                transition:      'border-color 150ms',
                '& fieldset': {
                  borderColor: error ? 'rgba(239,68,68,0.6)' : '#424242',
                },
                '&:hover fieldset': {
                  borderColor: error ? 'rgba(239,68,68,0.6)' : 'rgba(77,249,237,0.3)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: error ? '#ef4444' : '#4df9ed',
                  borderWidth: '1px',
                },
              },
              '& .MuiOutlinedInput-input': {
                padding:     '8px 12px',
                '&::placeholder': { color: '#555', opacity: 1 },
              },
              '& .MuiAutocomplete-endAdornment': {
                '& .MuiIconButton-root': { color: '#555' },
              },
            }}
          />
        )}
      />

      {error && errorMsg && (
        <p className="text-[11px] text-red-400 leading-tight">{errorMsg}</p>
      )}
    </div>
  )
}