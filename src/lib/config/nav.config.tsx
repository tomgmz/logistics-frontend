import {
  Users, FileSearch, ScrollText, Truck, CalendarCheck,
  MapPin, CreditCard, History, Layers,
  LayoutDashboard, Activity, ClipboardList
} from 'lucide-react'

export const NAV_ITEMS_BY_ROLE: Record<string, { href: string; label: string; icon: React.ReactNode }[]> = {
  admin: [
    { href: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
    { href: '/admin/user-management', label: 'User Management', icon: <Users size={17} /> },
    { href: '/admin/booking-management', label: 'Booking Management', icon: <CalendarCheck size={17} /> },
    { href: '/admin/transit-tracking', label: 'Transit Tracking', icon: <MapPin size={17} /> },
    { href: '/admin/vehicle-management', label: 'Vehicle Management', icon: <Truck size={17} /> },
    { href: '/admin/billing-management', label: 'Billing Management', icon: <CreditCard size={17} /> },
    { href: '/admin/transaction-history', label: 'Transaction History', icon: <History size={17} /> },
    { href: '/admin/document-management', label: 'Document Management', icon: <FileSearch size={17} /> },
    { href: '/admin/system-maintenance', label: 'System Maintenance', icon: <Layers size={17} /> },
    { href: '/admin/audit-logs', label: 'Audit Logs', icon: <ScrollText size={17} /> },
  ],
  client: [
    { href: '/client/booking', label: 'Booking', icon: <CalendarCheck size={17} /> },
    { href: '/client/tracking', label: 'Delivery Tracking', icon: <MapPin size={17} /> },
    { href: '/client/reverse-billing', label: 'Reverse Billing', icon: <CreditCard size={17} /> },
    { href: '/client/history', label: 'Transaction History', icon: <History size={17} /> },
  ],
  fleet_manager: [
    { href: '/fleet_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
    { href: '/fleet_admin/vehicle-management', label: 'Vehicle Management', icon: <Truck size={17} /> },
    { href: '/fleet_admin/transit-tracking', label: 'Transit Tracking', icon: <Truck size={17} /> },
  ],
  general_manager: [
    { href: '/general-manager/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
    { href: '/general_manager/vehicle-management', label: 'Vehicle Management', icon: <Truck size={17} /> },
    { href: '/general_manager/booking-management', label: 'Booking Management', icon: <ClipboardList size={17} /> },
    { href: '/general_manager/billing-management', label: 'Billing Management', icon: <ClipboardList size={17} /> },
    { href: '/general_manager/document-management', label: 'Document Management', icon: <ClipboardList size={17} /> },
  ],
  it_admin: [
    { href: '/it_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
    { href: '/it_admin/administrator-management', label: 'Admin Management', icon: <Users size={17} /> },
    { href: '/it_admin/logs', label: 'Audit Logs', icon: <Activity size={17} /> },
  ],
  operations_manager: [
    { href: '/operations_admin/booking-management', label: 'Booking Management', icon: <CalendarCheck size={17} /> },
    { href: '/operations_admin/document-management', label: 'Document Management', icon: <FileSearch size={17} /> },
    { href: '/operations_admin/transit-tracking', label: 'Transit Tracking', icon: <MapPin size={17} /> },
  ],
  accountant: [
    { href: '/accountant/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
    { href: '/accountant/transaction-history', label: 'Transaction History', icon: <History size={17} /> },
    { href: '/accountant/expenses', label: 'Expenses', icon: <CreditCard size={17} /> },
    { href: '/accountant/document-management', label: 'Document Management', icon: <FileSearch size={17} /> },
    { href: '/accountant/booking-management', label: 'Booking Management', icon: <CalendarCheck size={17} /> },
    { href: '/accountant/billing-management', label: 'Billing Management', icon: <CreditCard size={17} /> },
  ],
}