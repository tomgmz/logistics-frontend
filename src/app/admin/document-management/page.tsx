import type { Metadata } from 'next'
import DocumentManagementView from './DocumentManagementView'

export const metadata: Metadata = {
  title: 'Document Management',
}

export default function DocumentManagement() {
  return <DocumentManagementView />
}
