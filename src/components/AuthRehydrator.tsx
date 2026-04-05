'use client'

import { useEffect } from 'react'
import { getMe } from '@/app/lib/api/auth.api'
import { useAuthStore } from '@/app/lib/store/auth.store'

export default function AuthRehydrator() {
  const setUser = useAuthStore((s) => s.setUser)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => {
      })
  }, [setUser])

  return null
}