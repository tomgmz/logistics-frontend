import { ServiceType } from "@/app/lib/store/slice/booking.slice"

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