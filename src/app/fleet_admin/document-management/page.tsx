import DocumentManagementView from '@/app/admin/document-management/DocumentManagementView'

// Vehicle files only: the server scopes every documents endpoint for the Fleet Manager.
export default function FleetManagerDocuments() {
  return <DocumentManagementView fleetOnly />
}
