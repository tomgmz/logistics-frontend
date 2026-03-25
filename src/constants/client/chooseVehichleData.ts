export interface Vehicle {
  id: string
  name: string
  bodyType: string
  dimension: string
  suitableFor: string
  stackableFriendly: boolean
  maxVolumeCBM: number
  maxWeightKG: number
  maxLengthCM: number
}

export const VEHICLE_IMAGES: Record<Vehicle['id'], string> = {
  sedan:      '/images/vehicles/sedan.png',
  l300:    '/landingpage/aboutSection/l300-van.png',
  truck4w:    '/landingpage/aboutSection/cargo-truck.png',
  wingvan:    '/images/vehicles/wing-van.png',
  trailer:    '/images/vehicles/trailer.png',
}

export const VEHICLES: Vehicle[] = [
  {
    id: 'sedan',
    name: 'Sedan / Car',
    bodyType: 'Closed',
    dimension: '1200 × 900 × 700 MM',
    suitableFor: 'Small packages',
    stackableFriendly: true,
    maxVolumeCBM: 0.8,
    maxWeightKG: 200,
    maxLengthCM: 120,
  },
  {
    id: 'l300',
    name: 'L300',
    bodyType: 'FB Van',
    dimension: '2430 × 1445 × 1345 MM',
    suitableFor: 'Best for bulk goods',
    stackableFriendly: true,
    maxVolumeCBM: 5.5,
    maxWeightKG: 1000,
    maxLengthCM: 0,
  },
  {
    id: 'truck4w',
    name: 'Truck (4W)',
    bodyType: 'Closed Van',
    dimension: '4200 × 2100 × 2100 MM',
    suitableFor: 'Medium to large cargo',
    stackableFriendly: true,
    maxVolumeCBM: 18.5,
    maxWeightKG: 3000,
    maxLengthCM: 420,
  },
  {
    id: 'wingvan',
    name: 'Wing Van',
    bodyType: 'Wing Van',
    dimension: '8500 × 2400 × 2400 MM',
    suitableFor: 'Large volume shipments',
    stackableFriendly: true,
    maxVolumeCBM: 48.9,
    maxWeightKG: 12000,
    maxLengthCM: 850,
  },
  {
    id: 'trailer',
    name: 'Trailer Truck',
    bodyType: 'Flatbed / Closed',
    dimension: '12000 × 2400 × 2600 MM',
    suitableFor: 'Extra-large freight',
    stackableFriendly: false,
    maxVolumeCBM: 74.9,
    maxWeightKG: 22000,
    maxLengthCM: 1200,
  },
]