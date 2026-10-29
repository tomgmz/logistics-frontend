'use client'

import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, XCircle } from 'lucide-react'
import StepBookingDetails from './BookingDetails'
import StepReview from './ReviewBooking'
import { useAppDispatch, useAppSelector } from '@/lib/hooks/hooks'
import { setStep, resetBooking, loadResubmitDraft } from '@/lib/store/slice/booking.slice'
import { bookingService } from '@/lib/services/client/booking.service'
import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { bookingToResubmitDraft, isAwaitingResubmit } from '@/lib/booking-resubmit'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { loadDraftFiles, saveDraftFiles } from '@/lib/store/booking-draft'
import './BookingDetails.css'

const STEPS = [
  { id: 1, label: 'Booking Details' },
  { id: 2, label: 'Review'          },
]

const slideVariants = {
  enter:  (dir: number) => ({ x: dir > 0 ?  56 : -56, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (dir: number) => ({ x: dir > 0 ? -56 :  56, opacity: 0 }),
}

/**
 * Reads `?resubmit=<bookingId>` (the Edit & Resubmit button on a rejected
 * booking) and loads that booking into the wizard for the client to correct.
 * Leaving the parameter off while a correction is loaded drops back to a blank
 * new booking. Isolated so useSearchParams sits under its own Suspense boundary.
 */
function ResubmitLoader({ onLoaded, onLoading }: {
  onLoaded:  () => void
  onLoading: (loading: boolean) => void
}) {
  const dispatch     = useAppDispatch()
  const router       = useRouter()
  const id           = useSearchParams().get('resubmit')
  const loadedId     = useAppSelector((s) => s.booking.resubmit?.bookingId ?? null)
  const loadedIdRef  = useRef(loadedId)
  loadedIdRef.current = loadedId

  useEffect(() => {
    if (!id) {
      if (loadedIdRef.current) {
        dispatch(resetBooking())
        onLoaded()
      }
      return
    }
    // Already loaded — keep the client's edits (e.g. coming back to this page).
    if (loadedIdRef.current === id) return

    let cancelled = false
    onLoading(true)
    ;(async () => {
      try {
        const booking = await bookingService.getBookingById(id) as BookingWithRelations
        if (cancelled) return
        if (!booking || !isAwaitingResubmit(booking)) {
          appToast.error('This booking can no longer be edited and resubmitted.')
          router.replace('/client/booking')
          return
        }
        dispatch(loadResubmitDraft(bookingToResubmitDraft(booking)))
        onLoaded()
      } catch (err) {
        if (cancelled) return
        appToast.error(getApiErrorMessage(err, 'Could not load the booking.'))
        router.replace('/client/booking')
      } finally {
        if (!cancelled) onLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, dispatch, router, onLoaded, onLoading])

  return null
}

export default function BookingWizard() {
  const dispatch = useAppDispatch()
  const router   = useRouter()
  const step     = useAppSelector((s) => s.booking.step)
  const service  = useAppSelector((s) => s.booking.service)
  const resubmit = useAppSelector((s) => s.booking.resubmit)
  // The form is restored from this tab's draft before anything reads it, so a
  // reload neither flashes an empty form nor lets ResubmitLoader refetch over
  // the client's edits.
  const rehydrated = useAppSelector((s) => s.booking._persist?.rehydrated ?? false)
  const [loadingDraft, setLoadingDraft] = useState(false)

  const [dir,          setDir]          = useState(1)
  const [wizardKey,    setWizardKey]    = useState(0)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [filesRestored, setFilesRestored] = useState(false)

  // Attached documents survive the reload too (kept in IndexedDB, not Redux).
  useEffect(() => {
    let cancelled = false
    loadDraftFiles().then((files) => {
      if (cancelled) return
      if (files.length) setPendingFiles(files)
      setFilesRestored(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (filesRestored) void saveDraftFiles(pendingFiles)
  }, [pendingFiles, filesRestored])

  const goNext = () => {
    setDir(1)
    dispatch(setStep(step + 1))
  }
  const goBack = () => {
    setDir(-1)
    dispatch(setStep(step - 1))
  }

  const handleNewBooking = useCallback(() => {
    setPendingFiles([])
    dispatch(resetBooking())
    setWizardKey(k => k + 1)
    // Drop a ?resubmit= left over from correcting a rejected booking.
    router.replace('/client/booking')
  }, [dispatch, router])

  // A booking loaded for correction starts the wizard over, without any files
  // queued for the previous one.
  const handleDraftLoaded = useCallback(() => {
    setPendingFiles([])
    setDir(1)
    setWizardKey(k => k + 1)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">

      <div className="sticky top-0 z-10 shrink-0 border-b border-white/[0.07] bg-[var(--color-bg)]
                      px-4 lg:px-6 h-auto py-3 lg:py-0 lg:h-[62px]
                      grid grid-cols-[1fr_auto_1fr] items-center gap-4">

        <h1 className="font-[family-name:var(--font-alegreya-sc)] text-[17px] 3xl:text-[20px] font-bold text-white whitespace-nowrap">
          {resubmit ? 'Edit & Resubmit' : 'New Booking'}
          {resubmit?.reference ? (
            <>
              <span className="text-white/30 mx-1.5">/</span>
              <span>{resubmit.reference}</span>
            </>
          ) : service && (
            <>
              <span className="text-white/30 mx-1.5">/</span>
              <span className="uppercase">{service}</span>
            </>
          )}
        </h1>

        <div className="hidden sm:flex items-center gap-8 lg:gap-12 justify-self-center">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <StepPip
                step={s}
                isActive={step === s.id}
                isDone={step > s.id}
                onClick={() => {
                  if (s.id < step) {
                    setDir(-1)
                    dispatch(setStep(s.id))
                  }
                }}
              />
              {i < STEPS.length - 1 && (
                <div className={`w-8 lg:w-12 h-px mx-1 transition-colors duration-500
                  ${step > s.id ? 'bg-[var(--color-cyan)]' : 'bg-white/10'}`}
                />
              )}
            </div>
          ))}
        </div>

        <span className="sm:hidden justify-self-end ff-regular text-sm whitespace-nowrap text-white">
          {STEPS.find((s) => s.id === step)?.label}
        </span>

        <div className="hidden sm:block" />
      </div>

      {rehydrated && (
        <Suspense fallback={null}>
          <ResubmitLoader onLoaded={handleDraftLoaded} onLoading={setLoadingDraft} />
        </Suspense>
      )}

      {/* Why the booking being corrected was turned down, kept in view while editing. */}
      {resubmit && (
        <div className="shrink-0 flex items-start gap-2 px-4 lg:px-6 py-2.5 border-b border-white/[0.07]"
          style={{ background: 'rgba(246,38,38,0.08)' }}>
          <XCircle size={15} className="shrink-0 mt-0.5" style={{ color: '#f62626' }} />
          <p className="ff-sc booking-text text-xs lg:text-sm text-white/85">
            This booking was not approved{resubmit.rejectionReason ? <>: <span className="text-white">{resubmit.rejectionReason}</span></> : '.'}
            {' '}Correct the details below and resubmit it for another review.
          </p>
        </div>
      )}

      {/* Step content — key forces full remount on new booking */}
      <div key={wizardKey} className="flex-1 min-h-0 relative overflow-hidden">
        {loadingDraft && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-bg)]/80">
            <span className="ff-sc booking-text text-sm text-white/70">Loading booking…</span>
          </div>
        )}
        {rehydrated && filesRestored && <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            className="absolute inset-0 overflow-y-auto"
          >
            {step === 1 && (
              <StepBookingDetails
                onNext={goNext}
                files={pendingFiles}
                onFilesChange={setPendingFiles}
              />
            )}
            {step === 2 && (
              <StepReview
                selectedService={service}
                onBack={goBack}
                onNewBooking={handleNewBooking}
                onClearFiles={() => setPendingFiles([])}
                pendingFiles={pendingFiles}
              />
            )}
          </motion.div>
        </AnimatePresence>}
      </div>
    </div>
  )
}

function StepPip({
  step, isActive, isDone, onClick,
}: {
  step: { id: number; label: string }
  isActive: boolean
  isDone: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 group">
      <motion.div
        animate={{
          backgroundColor: isDone
            ? '#3AF626'
            : isActive
            ? '#4DF9ED'
            : 'rgba(255,255,255,0.08)',
          scale: isActive ? 1.1 : 1,
        }}
        transition={{ duration: 0.3 }}
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0"
      >
        {isDone ? (
          <Check size={11} strokeWidth={3} className="text-[var(--color-bg)]" />
        ) : (
          <span className={`text-[9px] font-bold leading-none
            ${isActive ? 'text-[var(--color-bg)]' : 'text-[var(--color-muted)]'}`}>
            {step.id}
          </span>
        )}
      </motion.div>
      <span className={`ff-regular booking-text text-xs lg:text-sm transition-colors whitespace-nowrap
        ${isActive ? 'text-white' : isDone ? 'text-[var(--color-cyan)]' : 'text-[var(--color-muted)]'}`}>
        {step.label}
      </span>
    </button>
  )
}