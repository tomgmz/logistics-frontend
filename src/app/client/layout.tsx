import { ReactNode } from 'react'
import DashboardShell
 from './components/booking/DashboardShell'
export default function OverViewLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}