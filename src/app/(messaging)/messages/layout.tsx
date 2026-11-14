import type { Metadata } from 'next'

// The page is a client component, so its tab title lives here.
export const metadata: Metadata = {
  title: 'Messages',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
