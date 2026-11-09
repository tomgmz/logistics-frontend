import type { ServiceType } from "@/lib/store/booking.store"

export const ASSETS = {
  svcFmcg: '/clientside/fmcg.jpg',
}

export const SERVICE_TYPES: {
  id: ServiceType
  title: string
  description: string
  sub?: string
  image: string
}[] = [
  {
    id: 'fmcg',
    title: 'FMCG',
    description: 'Pick-up point only, for fast-moving consumer goods',
    image: ASSETS.svcFmcg,
  },
]