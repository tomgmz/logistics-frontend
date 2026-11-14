import type { Metadata } from 'next'
import AuditLogsPage from './AuditLogs'

export const metadata: Metadata = {
  title: 'Audit Logs',
}

export default function AuditLogs() {
  return <AuditLogsPage />
}
