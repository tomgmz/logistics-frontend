import type { Metadata } from 'next'
import DocumentManagementView from '@/app/admin/document-management/DocumentManagementView'

export const metadata: Metadata = {
  title: 'Document Management',
}

// Vehicle files only: the server scopes every documents endpoint for the Fleet Manager.
export default function FleetManagerDocuments() {
  return <DocumentManagementView fleetOnly />
}
