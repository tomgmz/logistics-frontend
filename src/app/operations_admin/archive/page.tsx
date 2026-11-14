import type { Metadata } from 'next'
import ArchiveModule from '@/components/archive/ArchiveModule'

export const metadata: Metadata = {
  title: 'Archive',
}

export default function ArchivePage() {
  return <ArchiveModule portal="operations_admin" />
}
