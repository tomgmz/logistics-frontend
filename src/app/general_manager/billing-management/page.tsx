import BillingManagementView from '@/app/admin/billing-management/BillingManagementView'

export const metadata = { title: 'Billing Management' }

export default function GeneralManagerBilling() {
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[var(--color-bg)]">
      <BillingManagementView roleView="general_manager" />
    </div>
  )
}
