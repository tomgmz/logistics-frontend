import { redirect } from 'next/navigation'

export default function AccountantIndex() {
  redirect('/accountant/transaction-history')
}

