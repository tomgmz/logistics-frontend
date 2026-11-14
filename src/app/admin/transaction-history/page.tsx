import type { Metadata } from 'next'
import TransactionHistoryView from './TransactionHistoryView'

export const metadata: Metadata = {
  title: 'Transaction History',
}

export default function TransactionHistory() {
  return <TransactionHistoryView />
}
