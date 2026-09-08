// Same view as the administrator's. Both portals answer to the
// transaction-history module, which the dashboard shell resolves from the URL
// segment, so the accountant's copy needs no extra gating of its own.
import TransactionHistoryView from '@/app/admin/transaction-history/TransactionHistoryView'

export default function TransactionHistory() {
  return <TransactionHistoryView />
}
