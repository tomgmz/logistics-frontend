'use client'

import { useState, useCallback } from 'react'
import MuiAutocomplete from '@mui/material/Autocomplete'
import TextField, { TextFieldProps } from '@mui/material/TextField'
import CircularProgress from '@mui/material/CircularProgress'
import { usePlacesAutocomplete, PlaceSuggestion, ResolvedPlace } from '@/lib/hooks/usePlacesAutoComplete'

const CYAN  = '#4DF9ED'
const ERROR = '#f87171'

type PlacesInputProps = Omit<TextFieldProps, 'onChange'> & {
  value: string
  onChange: (value: string) => void
  onResolve?: (resolved: ResolvedPlace) => void
  showIcon?: boolean
  error?: boolean
}

export default function PlacesInput({ value, onChange, onResolve, error, ...textFieldProps }: PlacesInputProps) {
  const [inputValue, setInputValue] = useState(value)

  // Narrow filter: addresses only (not POIs) — appropriate for form inputs
  const { suggestions, loading, onInputChange, resolvePlace } = usePlacesAutocomplete({
    includedPrimaryTypes: ['geocode', 'street_address', 'premise'],
  })

  const handleInputChange = useCallback(
    (_: unknown, newInput: string) => {
      setInputValue(newInput)
      onInputChange(newInput)
    },
    [onInputChange]
  )

  const handleSelect = useCallback(
    async (_: unknown, selected: string | PlaceSuggestion | null) => {
      if (!selected || typeof selected === 'string') return
      const resolved = await resolvePlace(selected.placeId)
      setInputValue(resolved.address)
      onChange(resolved.address)
      onResolve?.(resolved)
    },
    [resolvePlace, onChange, onResolve]
  )

  // When user finishes typing without selecting, resolve to best suggestion
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

  const activeColor = error ? ERROR : CYAN

  return (
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
      renderInput={(params) => (
        <TextField
          {...params}
          {...textFieldProps}
          fullWidth
          variant="standard"
          error={error}
          onBlur={handleBlur}
          InputProps={{
            ...params.InputProps,
            disableUnderline: false,
            endAdornment: (
              <>
                {loading && <CircularProgress size={16} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
          sx={{
            '& .MuiInputBase-root': { color: '#fff' },
            '& .MuiInput-underline:before': {
              borderBottomColor: error ? `${ERROR}80` : 'rgba(255,255,255,0.2)',
            },
            '& .MuiInput-underline:hover:before': { borderBottomColor: activeColor },
            '& .MuiInput-underline:after':        { borderBottomColor: activeColor },
          }}
        />
      )}
    />
  )
}