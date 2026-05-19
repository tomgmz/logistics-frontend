import proxyApi from '@/lib/api/auth.api'
import type {
  Commodity,
  CreateCommodityPayload,
  CreateHandlingCodePayload,
  CreateProductPayload,
  HandlingCode,
  Product,
} from '@/app/types/admin/cargo-catalog.types'

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
}

const B = '/admin'

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url, { params })
  return data.data
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const { data } = await proxyApi.post<ApiResponse<T>>(url, body)
  return data.data
}

export const cargoCatalogService = {
  getHandlingCodes: (type?: 'standard' | 'additional') =>
    get<HandlingCode[]>(`${B}/handling-codes`, type ? { type } : undefined),

  createHandlingCode: (body: CreateHandlingCodePayload) =>
    post<HandlingCode>(`${B}/handling-codes`, body),

  getCommodities: () => get<Commodity[]>(`${B}/commodities`),
  createCommodity: (body: CreateCommodityPayload) =>
    post<Commodity>(`${B}/commodities`, body),

  getProducts: (commodityId?: string) =>
    get<Product[]>(`${B}/products`, commodityId ? { commodity_id: commodityId } : undefined),
  createProduct: (body: CreateProductPayload) =>
    post<Product>(`${B}/products`, body),
}
