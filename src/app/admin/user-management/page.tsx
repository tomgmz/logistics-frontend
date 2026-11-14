import type { Metadata } from 'next'
import UserManagementClient from './UserManagementClient'

export const metadata: Metadata = {
  title: 'User Management',
}

export default function UserManagementPage() {
  return <UserManagementClient />
}