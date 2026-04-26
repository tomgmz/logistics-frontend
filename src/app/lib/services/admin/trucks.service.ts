import authApi, { initCsrf } from '../../api/auth.api'
import type { Truck, CreateTruckInput, UpdateTruckInput } from '@/app/types/truck.types'
import type { TruckModel } from '@/app/types/truck-model'

const ADMIN = '/admin'

export async function adminFetchTrucks(): Promise<Truck[]> {
  const { data } = await authApi.get<{ data: Truck[] }>(`${ADMIN}/trucks`)
  return data?.data ?? []
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

export async function adminUpdateTruck(truckId: string, body: UpdateTruckInput): Promise<Truck> {
  await initCsrf()
  const { data } = await authApi.patch<{ data: Truck }>(`${ADMIN}/trucks/${truckId}`, body)
  return data.data
}

export async function adminDeleteTruck(truckId: string): Promise<void> {
  await initCsrf()
  await authApi.delete(`${ADMIN}/trucks/${truckId}`)
}

export async function adminFetchTruckModels(): Promise<TruckModel[]> {
  const { data } = await authApi.get<{ data: TruckModel[] }>(`${ADMIN}/truck-models`)
  return data?.data ?? []
}

/** Raw rows from GET /admin/vendors (users + nested vendors) */
export async function adminFetchVendorsRaw(): Promise<unknown[]> {
  const { data } = await authApi.get<{ data: unknown[] }>(`${ADMIN}/vendors`)
  return data?.data ?? []
}
