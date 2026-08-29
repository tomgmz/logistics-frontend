import { redirect } from 'next/navigation'

export default function ClientPage() {
  // Every login path funnels through /client (ROLE_ROUTES, SignInModal,
  // AuthRehydrator, the proxy middleware), so this is the client's landing page.
  redirect('/client/dashboard')
}