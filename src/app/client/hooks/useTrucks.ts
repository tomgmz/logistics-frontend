import { useState, useEffect } from 'react'
import { fetchTruckModels } from '@/app/lib/api/client/truck-model'
import { TruckModel } from '@/app/types/truck-model'

export interface VehicleData {
  id: string
  name: string
  maxWeightKG: number
  maxVolumeCBM: number
  maxLengthCM: number
  bodyType: string
  dimension: string
  suitableFor: string
  stackableFriendly: boolean
  imageUrl?: string
}

export function useTrucks() {
  const [vehicles, setVehicles] = useState<VehicleData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadTrucks() {
      try {
        setLoading(true)
        const models = await fetchTruckModels()
        setVehicles(models.map(mapTruckModelToVehicle))
        setError(null)
      } catch (err: unknown) {
        console.error('Failed to fetch truck models:', err)
        setError(err instanceof Error ? err.message : 'Failed to load vehicles')
      } finally {
        setLoading(false)
      }
    }

    loadTrucks()
  }, [])

  return { vehicles, loading, error }
}

function mapTruckModelToVehicle(model: TruckModel): VehicleData {
  return {
    id:               model.model_id,
    name:             model.name,
    maxWeightKG:      model.max_weight_kg ?? 0,
    maxVolumeCBM:     model.max_volume_cbm ?? 0,
    maxLengthCM:      model.max_length_cm ?? 0,
    bodyType:         model.body_type ?? 'Standard',
    dimension:        model.dimension_mm
                        ? `${model.dimension_mm}mm (L×W×H)`
                        : 'Standard dimensions',
    suitableFor:      model.suitable_for ?? 'General cargo',
    stackableFriendly: model.stackable_friendly,
    imageUrl:         model.image_url,
  }
}