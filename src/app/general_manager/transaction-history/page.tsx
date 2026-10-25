import TransactionHistoryView from '@/app/admin/transaction-history/TransactionHistoryView'

// The Company Administrator's Transaction History, shared with the General
// Manager (2026-10-25). The transaction-history module tier gates both.
export default function GeneralManagerTransactionHistory() {
  return <TransactionHistoryView />
}
