import { configureStore } from '@reduxjs/toolkit'
import { persistReducer, persistStore, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist'
import bookingReducer from './slice/booking.slice'
import routeMapReducer from './slice/routeMap.slice'
import { BOOKING_PERSIST_KEY, sessionDraftStorage } from './booking-draft'

// The booking wizard survives a reload of the same tab (see booking-draft.ts).
// The client sidebar's open state is layout, not part of the draft.
const persistedBookingReducer = persistReducer(
  { key: BOOKING_PERSIST_KEY, version: 1, storage: sessionDraftStorage, blacklist: ['sidebarOpen'] },
  bookingReducer,
)

export const store = configureStore({
  reducer: {
    booking: persistedBookingReducer,
    routeMap: routeMapReducer,
  },
  middleware: (getDefault) =>
    getDefault({
      serializableCheck: { ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER] },
    }),
})

// Browser only: the server has no draft to restore.
export const persistor = typeof window === 'undefined' ? null : persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
