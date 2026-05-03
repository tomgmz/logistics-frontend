import { configureStore } from '@reduxjs/toolkit'
import bookingReducer from './slice/booking.slice'
import routeMapReducer from './slice/routeMap.slice'

export const store = configureStore({
  reducer: {
    booking: bookingReducer,
    routeMap: routeMapReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch