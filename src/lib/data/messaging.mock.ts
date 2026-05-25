import type { Conversation, Message } from '@/app/types/messaging/messaging.types'

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    participants: [{ user_id: 'u1', first_name: 'Juan', last_name: 'Dela Cruz', role: 'driver', is_online: true }],
    last_message: {
      id: 'ml1', conversation_id: 'conv-1', sender_id: 'u1',
      body: 'Copy that, on my way to the depot now.',
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), read_at: null,
    },
    unread_count: 2,
    updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'conv-2',
    participants: [{ user_id: 'u2', first_name: 'Maria', last_name: 'Santos', role: 'operations_admin', is_online: false }],
    last_message: {
      id: 'ml2', conversation_id: 'conv-2', sender_id: 'current',
      body: 'Please confirm the booking status for BK-2025-0042.',
      created_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(), read_at: new Date().toISOString(),
    },
    unread_count: 0,
    updated_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  },
  {
    id: 'conv-3',
    participants: [{ user_id: 'u3', first_name: 'Roberto', last_name: 'Reyes', role: 'fleet_admin', is_online: true }],
    last_message: {
      id: 'ml3', conversation_id: 'conv-3', sender_id: 'u3',
      body: 'Truck T-08 is ready for inspection.',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), read_at: new Date().toISOString(),
    },
    unread_count: 0,
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'conv-4',
    participants: [{ user_id: 'u4', first_name: 'Ana', last_name: 'Lim', role: 'accountant', is_online: false }],
    last_message: {
      id: 'ml4', conversation_id: 'conv-4', sender_id: 'u4',
      body: 'Invoice #INV-2025-119 has been processed.',
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), read_at: new Date().toISOString(),
    },
    unread_count: 0,
    updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'conv-5',
    participants: [{ user_id: 'u5', first_name: 'Carlos', last_name: 'Mendoza', role: 'driver', is_online: false }],
    last_message: {
      id: 'ml5', conversation_id: 'conv-5', sender_id: 'u5',
      body: 'Good morning po. Arrived at Cebu hub.',
      created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), read_at: null,
    },
    unread_count: 1,
    updated_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  },
]

export const MOCK_MESSAGES: Record<string, Message[]> = {
  'conv-1': [
    { id: 'm1-1', conversation_id: 'conv-1', sender_id: 'current', body: 'Juan, please proceed to the Makati depot for cargo pickup.', created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
    { id: 'm1-2', conversation_id: 'conv-1', sender_id: 'u1', body: 'Noted po. ETA around 30 minutes. Maayos naman ang daan.', created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
    { id: 'm1-3', conversation_id: 'conv-1', sender_id: 'current', body: 'Good. Make sure to have your trip ticket ready for the guard on duty.', created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
    { id: 'm1-4', conversation_id: 'conv-1', sender_id: 'u1', body: 'Opo, handa na lahat. May dalang trip ticket, manifest, and PO.', created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
    { id: 'm1-5', conversation_id: 'conv-1', sender_id: 'current', body: 'Perfect. Report back once cargo is loaded.', created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
    { id: 'm1-6', conversation_id: 'conv-1', sender_id: 'u1', body: 'Copy that, on my way to the depot now.', created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), read_at: null },
  ],
  'conv-2': [
    { id: 'm2-1', conversation_id: 'conv-2', sender_id: 'u2', body: 'Good afternoon. I need an update on the pending Cebu bookings.', created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
    { id: 'm2-2', conversation_id: 'conv-2', sender_id: 'current', body: 'On it. Checking the system now.', created_at: new Date(Date.now() - 150 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
    { id: 'm2-3', conversation_id: 'conv-2', sender_id: 'current', body: 'Please confirm the booking status for BK-2025-0042.', created_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
  ],
  'conv-3': [
    { id: 'm3-1', conversation_id: 'conv-3', sender_id: 'current', body: 'Roberto, schedule T-08 for preventive maintenance this Friday.', created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
    { id: 'm3-2', conversation_id: 'conv-3', sender_id: 'u3', body: 'Truck T-08 is ready for inspection.', created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
  ],
  'conv-4': [
    { id: 'm4-1', conversation_id: 'conv-4', sender_id: 'current', body: 'Ana, has INV-2025-119 been processed?', created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
    { id: 'm4-2', conversation_id: 'conv-4', sender_id: 'u4', body: 'Invoice #INV-2025-119 has been processed.', created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), read_at: new Date().toISOString() },
  ],
  'conv-5': [
    { id: 'm5-1', conversation_id: 'conv-5', sender_id: 'u5', body: 'Good morning po. Arrived at Cebu hub.', created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), read_at: null },
  ],
}