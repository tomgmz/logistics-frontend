'use client'

import { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'

export default function AppToaster() {
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false)

  useEffect(() => {
    const check = () => setIsMobileOrTablet(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <Toaster
      position={isMobileOrTablet ? 'top-center' : 'top-center'}
      reverseOrder={false}
      gutter={8}
      containerStyle={
        isMobileOrTablet
          ? { top: 16 }
          : { bottom: 24, right: 24 }
      }
      toastOptions={{
        duration: 3000,
        style: {
          background:   '#1b1b1b',
          color:        '#ffffff',
          border:       '1px solid #2a2a2a',
          borderRadius: '12px',
          fontSize:     '15px',
          fontWeight:   500,
          padding:      '16px 20px',
          boxShadow:    '0 8px 32px rgba(0,0,0,0.5)',
          maxWidth:     '480px',
          lineHeight:   '1.6',
        },

        success: {
          duration: 3000,
          iconTheme: {
            primary:    '#4df9ed',
            secondary:  '#0a0a0a',
          },
          style: {
            background:   '#1b1b1b',
            color:        '#ffffff',
            border:       '1px solid rgba(77,249,237,0.25)',
            borderRadius: '12px',
            fontSize:     '15px',
            fontWeight:   500,
            padding:      '16px 20px',
            boxShadow:    '0 8px 32px rgba(0,0,0,0.5)',
          },
        },

        error: {
          duration: 4500,
          iconTheme: {
            primary:    '#f87171',
            secondary:  '#0a0a0a',
          },
          style: {
            background:   '#1b1b1b',
            color:        '#ffffff',
            border:       '1px solid rgba(248,113,113,0.25)',
            borderRadius: '12px',
            fontSize:     '15px',
            fontWeight:   500,
            padding:      '16px 20px',
            boxShadow:    '0 8px 32px rgba(0,0,0,0.5)',
          },
        },

        loading: {
          iconTheme: {
            primary:    '#4df9ed',
            secondary:  '#2a2a2a',
          },
          style: {
            background:   '#1b1b1b',
            color:        '#818181',
            border:       '1px solid #2a2a2a',
            borderRadius: '12px',
            fontSize:     '15px',
            fontWeight:   500,
            padding:      '16px 20px',
            boxShadow:    '0 8px 32px rgba(0,0,0,0.5)',
          },
        },
      }}
    />
  )
}