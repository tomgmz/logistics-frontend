
export function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL

  if (!url) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        '[getApiUrl] NEXT_PUBLIC_API_URL is not set. ' +
        'Add it to your .env.local file (e.g. NEXT_PUBLIC_API_URL=http://localhost:4000/api).'
      )
    }
    return '/api'
  }

  return url
}