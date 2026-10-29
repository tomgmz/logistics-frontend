import {
  Users, Files, ListMinus, Truck, CalendarRange,
  MapPin, CreditCard, History, MonitorCog,
  LayoutDashboard, Ticket
} from 'lucide-react'

export const NAV_ITEMS_BY_ROLE: Record<string, { href: string; label: string; icon: React.ReactNode }[]> = {
  admin: [
    { href: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { href: '/admin/user-management', label: 'User Management', icon: <Users size={20} /> },
    { href: '/admin/booking-management', label: 'Booking Management', icon: <CalendarRange size={20} /> },
    { href: '/admin/transit-tracking', label: 'Transit Tracking', icon: <MapPin size={20} /> },
    { href: '/admin/vehicle-management', label: 'Vehicle Management', icon: <Truck size={20} /> },
    { href: '/admin/transaction-history', label: 'Transaction History', icon: <History size={20} /> },
    { href: '/admin/document-management', label: 'Document Management', icon: <Files size={20} /> },
    { href: '/admin/system-maintenance', label: 'System Maintenance', icon: <MonitorCog size={20} /> },
    { href: '/admin/audit-logs', label: 'Audit Logs', icon: <ListMinus size={20} /> },
    { href: '/admin/support-tickets', label: 'Tickets', icon: <Ticket size={20} /> },
  ],
  client: [
    { href: '/client/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { href: '/client/booking', label: 'Booking', icon: <CalendarRange size={20} /> },
    { href: '/client/tracking', label: 'Transit Tracking', icon: <MapPin size={20} /> },
    { href: '/client/history', label: 'Transaction History', icon: <History size={20} /> },
  ],
  fleet_manager: [
    { href: '/fleet_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { href: '/fleet_admin/vehicle-management', label: 'Vehicle Management', icon: <Truck size={20} /> },
    { href: '/fleet_admin/transit-tracking', label: 'Transit Tracking', icon: <MapPin size={20} /> },
  ],
  general_manager: [
    { href: '/general_manager/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { href: '/general_manager/booking-management', label: 'Booking Management', icon: <CalendarRange size={20} /> },
    { href: '/general_manager/vehicle-management', label: 'Vehicle Management', icon: <Truck size={20} /> },
    { href: '/general_manager/transaction-history', label: 'Transaction History', icon: <History size={20} /> },
    { href: '/general_manager/document-management', label: 'Document Management', icon: <Files size={20} /> },
  ],
  it_admin: [
    { href: '/it_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { href: '/it_admin/administrator-management', label: 'User Management', icon: <Users size={20} /> },
    { href: '/it_admin/logs', label: 'Logs', icon: <ListMinus size={20} /> },
  ],
  operations_manager: [
    { href: '/operations_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { href: '/operations_admin/booking-management', label: 'Booking Management', icon: <CalendarRange size={20} /> },
    { href: '/operations_admin/transit-tracking', label: 'Transit Tracking', icon: <MapPin size={20} /> },
    { href: '/operations_admin/document-management', label: 'Document Management', icon: <Files size={20} /> },
  ],
}