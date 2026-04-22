import type { Metadata } from 'next'
import UserManagementClient from '../components/UserManagementClient'

export const metadata: Metadata = {
  title: 'User Management | 8338 Logistics Services',
}

export default function UserManagementPage() {
  return <UserManagementClient />
}