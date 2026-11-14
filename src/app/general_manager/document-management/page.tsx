import type { Metadata } from 'next'
import DocumentManagementView from '@/app/admin/document-management/DocumentManagementView'

export const metadata: Metadata = {
  title: 'Document Management',
}

export default function GeneralManagerDocuments() {
  return <DocumentManagementView />
}
