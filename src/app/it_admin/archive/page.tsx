import type { Metadata } from 'next'
import ArchiveModule from '@/components/archive/ArchiveModule'

export const metadata: Metadata = {
  title: 'Archive | 8338 Logistics Services',
}

export default function ArchivePage() {
  return <ArchiveModule portal="it_admin" />
}
