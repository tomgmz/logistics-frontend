import proxyApi, { initCsrf } from '@/lib/api/auth.api'

interface ApiResponse<T> {
  status: string
  data:   T
  message?: string
}

// ── Types ───────────────────────────────────────────────────────────────────

export type HandlingCodeType = 'standard' | 'additional'

export interface HandlingCode {
  handling_code_id: string
  code:             string
  name:             string
  description?:     string | null
  type:             HandlingCodeType
  is_active:        boolean
  created_at?:      string
}

export interface Commodity {
  commodity_id: string
  name:         string
  description?: string | null
  category?:    string | null
  is_active:    boolean
  created_at?:  string
}

export interface Product {
  product_id:   string
  commodity_id: string
  name:         string
  description?: string | null
  unit?:        string | null
  is_active:    boolean
  created_at?:  string
  commodities?: { name: string; category?: string | null } | null
}

export interface LandlinePrefix {
  prefix_id:  string
  prefix:     string
  city:       string
  region:     string | null
  is_active:  boolean
  created_at: string
}

// ── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateHandlingCodePayload {
  code:         string
  name:         string
  description?: string
  type:         HandlingCodeType
  is_active?:   boolean
}

export interface UpdateHandlingCodePayload {
  code?:        string
  name?:        string
  description?: string | null
  type?:        HandlingCodeType
  is_active?:   boolean
}

export interface CreateCommodityPayload {
  name:         string
  description?: string
  category?:    string
  is_active?:   boolean
}

export interface UpdateCommodityPayload {
  name?:        string
  description?: string | null
  category?:    string | null
  is_active?:   boolean
}

export interface CreateProductPayload {
  commodity_id: string
  name:         string
  description?: string
  unit?:        string
  is_active?:   boolean
}

export interface UpdateProductPayload {
  commodity_id?: string
  name?:         string
  description?:  string | null
  unit?:         string | null
  is_active?:    boolean
}

export interface CreateLandlinePrefixPayload {
  prefix:     string
  city:       string
  region?:    string | null
  is_active?: boolean
}

export interface UpdateLandlinePrefixPayload {
  prefix?:    string
  city?:      string
  region?:    string | null
  is_active?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function get<T>(url: string): Promise<T> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url)
  return data.data
}

async function post<T>(url: string, payload: unknown): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.post<ApiResponse<T>>(url, payload)
  return data.data
}

async function patch<T>(url: string, payload: unknown): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.patch<ApiResponse<T>>(url, payload)
  return data.data
}

async function del<T>(url: string): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.delete<ApiResponse<T>>(url)
  return data.data
}

// ── Base paths ───────────────────────────────────────────────────────────────

const HC = '/admin/handling-codes'
const CM = '/admin/commodities'
const PR = '/admin/products'
const LP = '/admin/landline-prefixes'

// ── Service ───────────────────────────────────────────────────────────────────

export const systemMaintenanceService = {

  // ── Handling Codes ──────────────────────────────────────────────────────────
  getHandlingCodes: (type?: HandlingCodeType) =>
    get<HandlingCode[]>(type ? `${HC}?type=${type}` : HC),

  getHandlingCodeById: (id: string) =>
    get<HandlingCode>(`${HC}/${id}`),

  createHandlingCode: (payload: CreateHandlingCodePayload) =>
    post<HandlingCode>(HC, payload),

  updateHandlingCode: (id: string, payload: UpdateHandlingCodePayload) =>
    patch<HandlingCode>(`${HC}/${id}`, payload),

  deleteHandlingCode: (id: string) =>
    del<null>(`${HC}/${id}`),

  // ── Commodities ─────────────────────────────────────────────────────────────
  getCommodities: () =>
    get<Commodity[]>(CM),

  getCommodityById: (id: string) =>
    get<Commodity>(`${CM}/${id}`),

  createCommodity: (payload: CreateCommodityPayload) =>
    post<Commodity>(CM, payload),

  updateCommodity: (id: string, payload: UpdateCommodityPayload) =>
    patch<Commodity>(`${CM}/${id}`, payload),

  deleteCommodity: (id: string) =>
    del<null>(`${CM}/${id}`),

  // ── Products ────────────────────────────────────────────────────────────────
  getProducts: (commodityId?: string) =>
    get<Product[]>(commodityId ? `${PR}?commodity_id=${commodityId}` : PR),

  getProductById: (id: string) =>
    get<Product>(`${PR}/${id}`),

  createProduct: (payload: CreateProductPayload) =>
    post<Product>(PR, payload),

  updateProduct: (id: string, payload: UpdateProductPayload) =>
    patch<Product>(`${PR}/${id}`, payload),

  deleteProduct: (id: string) =>
    del<null>(`${PR}/${id}`),

  // ── Landline Prefixes ───────────────────────────────────────────────────────
  getLandlinePrefixes: () =>
    get<LandlinePrefix[]>(LP),

  getLandlinePrefixById: (id: string) =>
    get<LandlinePrefix>(`${LP}/${id}`),

  createLandlinePrefix: (payload: CreateLandlinePrefixPayload) =>
    post<LandlinePrefix>(LP, payload),

  updateLandlinePrefix: (id: string, payload: UpdateLandlinePrefixPayload) =>
    patch<LandlinePrefix>(`${LP}/${id}`, payload),

  deleteLandlinePrefix: (id: string) =>
    del<null>(`${LP}/${id}`),
}