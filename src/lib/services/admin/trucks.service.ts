import authApi, { initCsrf } from '../../api/auth.api'
import type { Truck, TruckInspection, CreateTruckInput, UpdateTruckInput, CreateTruckModelInput,UpdateTruckModelInput, MaintenanceTruck, OdometerReading, TruckService } from '@/app/types/truck.types'
import type { BlowbagetsItems } from '@/lib/services/client/booking.service'
import type { TruckModel } from '@/app/types/truck-model'

const ADMIN = '/admin'

export async function adminFetchTrucks(): Promise<Truck[]> {
  const { data } = await authApi.get<{ data: Truck[] }>(`${ADMIN}/trucks`)
  return data?.data ?? []
}

export async function adminFetchTrucksPaginated(params: {
  page: number
  limit: number
  status: string
  search: string
}): Promise<{
  rows: Truck[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}> {
  const { data: body } = await authApi.get<{
    status: string
    data: Truck[]
    meta: { total: number; page: number; limit: number; totalPages: number }
  }>(`${ADMIN}/trucks`, {
    params: {
      page:     params.page,
      limit:    params.limit,
      status:   params.status,
      search:   params.search || undefined,
    },
  })
  return {
    rows: body?.data ?? [],
    meta: body.meta ?? {
      total:      0,
      page:       params.page,
      limit:      params.limit,
      totalPages: 1,
    },
  }
}

export async function adminFetchTruck(truckId: string): Promise<Truck> {
  const { data } = await authApi.get<{ data: Truck }>(`${ADMIN}/trucks/${truckId}`)
  return data.data
}

export async function adminCreateTruck(body: CreateTruckInput): Promise<Truck> {
  await initCsrf()
  const { data } = await authApi.post<{ data: Truck }>(`${ADMIN}/trucks`, body)
  return data.data
}

/**
 * Set when the change took a vehicle off a live booking: that booking is now
 * flagged and Operations has been told.
 */
export interface FlaggedBooking {
  booking_id:       string
  reference_number: string | null
  status:           string
}

export async function adminUpdateTruck(
  truckId: string,
  body: UpdateTruckInput,
): Promise<Truck & { flagged_booking?: FlaggedBooking | null }> {
  await initCsrf()
  const { data } = await authApi.patch<{ data: Truck & { flagged_booking?: FlaggedBooking | null } }>(`${ADMIN}/trucks/${truckId}`, body)
  return data.data
}

/** Toast copy for a status change that flagged a booking, or null. */
export function flaggedBookingNotice(plate: string, flagged: FlaggedBooking | null | undefined): string | null {
  if (!flagged) return null
  const ref = flagged.reference_number ?? 'its booking'
  return flagged.status === 'assigned'
    ? `${plate} is out of service. Booking ${ref} was flagged and Operations was told to choose another vehicle.`
    : `${plate} is out of service while on the road for booking ${ref}. Operations was told.`
}

/** Retire a vehicle. Refused (409) while it is out on a booking. */
export async function adminArchiveTruck(truckId: string): Promise<void> {
  await initCsrf()
  await authApi.post(`${ADMIN}/trucks/${truckId}/archive`)
}

// --- BLOWBAGETS vehicle inspections ----------------------------------------
// Recorded by the fleet manager against a vehicle. Only a vehicle whose latest
// inspection passed can be assigned to a booking by operations.

export async function adminFetchTruckInspections(truckId: string): Promise<TruckInspection[]> {
  const { data } = await authApi.get<{ data: TruckInspection[] }>(`${ADMIN}/trucks/${truckId}/inspections`)
  return data?.data ?? []
}

export async function adminRecordTruckInspection(
  truckId: string,
  body: { items: BlowbagetsItems; notes?: string | null; odometer_km: number; odometer_photo_url: string },
): Promise<TruckInspection> {
  await initCsrf()
  const { data } = await authApi.post<{ data: TruckInspection }>(`${ADMIN}/trucks/${truckId}/inspections`, body)
  return data.data
}

export async function adminFetchTruckModels(): Promise<TruckModel[]> {
  const { data } = await authApi.get<{ data: TruckModel[] }>(`${ADMIN}/truck-models`)
  return data?.data ?? []
}

export async function adminFetchTruckModelById(modelId: string): Promise<TruckModel> {
  const { data } = await authApi.get<{ data: TruckModel }>(`${ADMIN}/truck-models/${modelId}`)
  return data.data
}

export async function adminUploadTruckModelImage(file: File): Promise<string> {
  await initCsrf()
  const formData = new FormData()
  formData.append('image', file)

  const { data } = await authApi.post<{ data: { url: string } }>(
    `${ADMIN}/upload/image`,
    formData,
    {
      transformRequest: (data, headers) => {
        delete headers['Content-Type']
        return data
      },
    }
  )
  return data.data.url
}

export async function adminCreateTruckModel(body: CreateTruckModelInput): Promise<TruckModel> {
  await initCsrf()
  const { data } = await authApi.post<{ data: TruckModel }>(`${ADMIN}/truck-models`, body)
  return data.data
}

export async function adminUpdateTruckModel(modelId: string, body: UpdateTruckModelInput): Promise<TruckModel> {
  await initCsrf()
  const { data } = await authApi.patch<{ data: TruckModel }>(`${ADMIN}/truck-models/${modelId}`, body)
  return data.data
}

/** Hide a model from the catalog. Refused (409) while active vehicles use it. */
export async function adminArchiveTruckModel(modelId: string): Promise<void> {
  await initCsrf()
  await authApi.post(`${ADMIN}/truck-models/${modelId}/archive`)
}
/**
 * Vehicle Management → Maintenance: vehicles that need a mechanic (out of
 * service, failed BLOWBAGETS, or an open breakdown/accident report from a
 * driver), each with the reasons and the open reports that put it there.
 */
export async function adminFetchMaintenanceQueue(): Promise<MaintenanceTruck[]> {
  const { data } = await authApi.get<{ data: MaintenanceTruck[] }>(`${ADMIN}/trucks/maintenance`)
  return data?.data ?? []
}

// --- Odometer + routine service ---------------------------------------------

/** Dashboard odometer photo or service receipt → hosted URL. */
export async function adminUploadFleetPhoto(file: File): Promise<string> {
  await initCsrf()
  const formData = new FormData()
  formData.append('image', file)
  const { data } = await authApi.post<{ data: { url: string } }>(
    `${ADMIN}/upload/fleet-photo`,
    formData,
    {
      transformRequest: (data, headers) => {
        delete headers['Content-Type']
        return data
      },
    },
  )
  return data.data.url
}

/** The after-delivery odometer, once the driver has stamped the vehicle back. */
export async function adminRecordReturnOdometer(
  truckId: string,
  body: { reading_km: number; photo_url: string },
): Promise<OdometerReading> {
  await initCsrf()
  const { data } = await authApi.post<{ data: OdometerReading }>(`${ADMIN}/trucks/${truckId}/odometer`, body)
  return data.data
}

/** A routine service — restarts the km and month counters. */
export async function adminRecordTruckService(
  truckId: string,
  body: { serviced_at: string; odometer_km: number; work_done: string; workshop?: string | null; receipt_url?: string | null },
): Promise<TruckService> {
  await initCsrf()
  const { data } = await authApi.post<{ data: TruckService }>(`${ADMIN}/trucks/${truckId}/services`, body)
  return data.data
}

export async function adminFetchTruckUpkeep(
  truckId: string,
): Promise<{ services: TruckService[]; readings: OdometerReading[] }> {
  const { data } = await authApi.get<{ data: { services: TruckService[]; readings: OdometerReading[] } }>(
    `${ADMIN}/trucks/${truckId}/upkeep`,
  )
  return data?.data ?? { services: [], readings: [] }
}
