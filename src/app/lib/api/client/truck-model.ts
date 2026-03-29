import api from '../api'
import { TruckModel } from '@/app/types/truck-model'

export async function fetchTruckModels(): Promise<TruckModel[]> {
  const { data } = await api.get<{ data: TruckModel[] }>('/truck-models')
  return data.data
}

export async function fetchTruckModel(modelId: string): Promise<TruckModel> {
  const { data } = await api.get<{ data: TruckModel }>(`/truck-models/${modelId}`)
  return data.data
}