import authApi, { initCsrf } from '../../api/auth.api'
import type { Truck, CreateTruckInput, UpdateTruckInput, CreateTruckModelInput,UpdateTruckModelInput } from '@/app/types/truck.types'
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
  owned_by: string
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
      owned_by: params.owned_by,
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
        delete headers['Content-Type']   // remove instance-level JSON header
        return data                       // let axios/browser set multipart + boundary
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

export async function adminDeleteTruckModel(modelId: string): Promise<void> {
  await initCsrf()
  await authApi.delete(`${ADMIN}/truck-models/${modelId}`)
}

export async function adminFetchVendorsRaw(): Promise<unknown[]> {
  const { data } = await authApi.get<{ data: unknown[] }>(`${ADMIN}/vendors`)
  return data?.data ?? []
}