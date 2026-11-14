import type { Metadata } from 'next'
import ReportsView from '@/app/admin/reports/ReportsView'

export const metadata: Metadata = {
  title: 'Reports',
}

export default function OperationsManagerReports() {
  return <ReportsView />
}
