export const ROLE_ROUTES: Record<string, string> = {
  admin:      '/admin',
  general_manager:  '/general_manager',
  accountant:       '/accountant',
  human_resources:  '/human_resources',
  fleet_admin:      '/fleet_admin',
  operations_admin: '/operations_admin',
  it_admin:         '/it_admin',
  client:           '/client',
  vendor:           '/vendor',
}

export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '8338logisticsservice@example.com'