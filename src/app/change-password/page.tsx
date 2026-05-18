import { Suspense } from 'react'
import ChangePasswordPage from './ChangePasswordPage'

export default function ChangePasswordPageWrapper() {
  return (
    <Suspense fallback={
      <div className="bg-[#0a0a0a] flex items-center justify-center" style={{ minHeight: '100dvh' }}>
        <span className="inline-block w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    }>
      <ChangePasswordPage />
    </Suspense>
  )
}