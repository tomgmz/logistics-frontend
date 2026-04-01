'use client'

import { useState, useCallback } from 'react'
import MuiAutocomplete from '@mui/material/Autocomplete'
import TextField, { TextFieldProps } from '@mui/material/TextField'
import CircularProgress from '@mui/material/CircularProgress'
import { usePlacesAutocomplete, PlaceSuggestion } from '../../hooks/usePlacesAutoComplete'

type PlacesInputProps = Omit<TextFieldProps, 'onChange'> & {
  value: string
  onChange: (value: string) => void
  showIcon?: boolean 
}

export default function PlacesInput({ value, onChange, ...textFieldProps }: PlacesInputProps) {
  const [inputValue, setInputValue] = useState(value)
  const { suggestions, loading, onInputChange, resolvePlace } = usePlacesAutocomplete()

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
      const address = await resolvePlace(selected.placeId)
      setInputValue(address)
      onChange(address)
    },
    [resolvePlace, onChange]
  )

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
            '& .MuiInputBase-root': {
              color: '#fff',
            },
            '& .MuiInput-underline:before': {
              borderBottomColor: 'rgba(255,255,255,0.2)',
            },
            '& .MuiInput-underline:hover:before': {
              borderBottomColor: '#4DF9ED',
            },
            '& .MuiInput-underline:after': {
              borderBottomColor: '#4DF9ED',
            },
          }}
        />
      )}
    />
  )
}