import api from './api'
import type { Truck, CreateTruckInput, UpdateTruckInput } from '@/app/types/truck.types'

export async function fetchTrucks(): Promise<Truck[]> {
  const { data } = await api.get<{ data: Truck[] }>('/trucks')
  return data.data
}

export async function fetchTruck(truckId: string): Promise<Truck> {
  const { data } = await api.get<{ data: Truck }>(`/trucks/${truckId}`)
  return data.data
}

export async function createTruck(truck: CreateTruckInput): Promise<Truck> {
  const { data } = await api.post<{ data: Truck }>('/trucks', truck)
  return data.data
}

export async function updateTruck(truckId: string, updates: UpdateTruckInput): Promise<Truck> {
  const { data } = await api.patch<{ data: Truck }>(`/trucks/${truckId}`, updates)
  return data.data
}

export async function deleteTruck(truckId: string): Promise<void> {
  await api.delete(`/trucks/${truckId}`)
}