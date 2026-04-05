import { ServiceType } from "@/app/lib/store/slice/booking.slice"

export const ASSETS = {
  svcEcommerce: '/clientside/e-commerce.jpg',
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
    id: 'ecommerce',
    title: 'ECOMMERCE',
    description: 'One pick-up point with multiple delivery addresses',
    image: ASSETS.svcEcommerce,
  },
  {
    id: 'fmcg',
    title: 'FMCG',
    description: 'Pick-up point only, for fast-moving consumer goods',
    image: ASSETS.svcFmcg,
  },
]