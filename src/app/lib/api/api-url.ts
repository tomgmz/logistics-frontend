export function getApiUrl(): string {
  if (process.env.NODE_ENV === 'production') return '/api'
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
}