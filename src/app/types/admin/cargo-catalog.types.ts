export type HandlingCodeType = 'standard' | 'additional'

export interface HandlingCode {
  handling_code_id: string
  code: string
  name: string
  description: string | null
  type: HandlingCodeType
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Commodity {
  commodity_id: string
  name: string
  description: string | null
  category: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  product_id: string
  commodity_id: string | null
  name: string
  description: string | null
  unit: string | null
  is_active: boolean
  commodities?: {
    name: string
    category: string | null
  } | null
  created_at: string
  updated_at: string
}

export interface CreateHandlingCodePayload {
  code: string
  name: string
  description?: string
  type: HandlingCodeType
  is_active?: boolean
}

export interface CreateCommodityPayload {
  name: string
  description?: string
  category?: string
  is_active?: boolean
}

export interface CreateProductPayload {
  commodity_id?: string
  name: string
  description?: string
  unit?: string
  is_active?: boolean
}
