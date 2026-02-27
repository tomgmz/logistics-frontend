import api from "./api";
import type { Truck, CreateTruckInput, UpdateTruckInput } from "@/app/types/truck.types";

export async function fetchTrucks(): Promise<Truck[]> {
  const { data } = await api.get('/trucks');
  return data;
}

export async function fetchTruck(truckId: string): Promise<Truck> {
  const { data } = await api.get(`/trucks/${truckId}`);
  return data;  
}

export async function createTruck(truck: CreateTruckInput): Promise<Truck> {
  const { data } = await api.post('/trucks', truck);
  return data;
}

export async function updateTruck(truckId: string, updates: UpdateTruckInput): Promise<Truck> {
  const { data } = await api.put(`/trucks/${truckId}`, updates);
  return data;
}

export async function deleteTruck(truckId: string): Promise<void> {
  await api.delete(`/trucks/${truckId}`);
}