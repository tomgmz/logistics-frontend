import { ReactNode } from 'react'
import ReusableDashboardShell from '@/components/ui/ReusableDashboardShell'
import { Activity, UsersRound } from 'lucide-react'

const SUPERADMIN_NAV = [
  { href: '/superadmin/system-logs', label: 'System Logs', icon: <Activity size={20} /> },
  { href: '/superadmin/admin-management', label: 'Admin Management', icon: <UsersRound size={20} /> },
]

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return <ReusableDashboardShell navItems={SUPERADMIN_NAV}>{children}</ReusableDashboardShell>
}
