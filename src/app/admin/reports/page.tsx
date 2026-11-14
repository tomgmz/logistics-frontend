import type { Metadata } from 'next'
import ReportsView from './ReportsView'

export const metadata: Metadata = {
  title: 'Reports',
}

export default function Reports() {
  return <ReportsView />
}
