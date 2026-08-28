import BillingManagementView from './BillingManagementView'

export const metadata = { title: 'Billing Management' }

export default function AdminBilling() {
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[var(--color-bg)]">
      <BillingManagementView roleView="admin" />
    </div>
  )
}
