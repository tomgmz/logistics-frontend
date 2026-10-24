'use client'

import ReusableModal from '@/components/layout/ReusableModal'
import type { UserStatus } from '@/app/types/admin/user-management.types'

/**
 * The confirm pop-up in front of every account action in User Management:
 * Activate, Deactivate, Archive, Restore, and a vendor driver's Revoke Access /
 * Restore Access. Nothing changes until it is confirmed.
 *
 * The page holds one `AccountConfirm | null`; a row menu sets it instead of
 * acting, and Confirm closes the pop-up, then runs the action.
 */
export interface AccountConfirm {
  title:        string
  description:  string
  confirmLabel: string
  run:          () => Promise<unknown> | void
}

/** Who the account belongs to, for what the pop-up says about passkeys. */
export type AccountKind = 'company-driver' | 'vendor-driver' | 'other'

/** What a status change does to a driver's passkeys (deactivate keeps them, archive ends them). */
const PASSKEY_NOTE: Record<Exclude<AccountKind, 'other'>, Partial<Record<UserStatus, string>>> = {
  'company-driver': {
    active:      'They sign in with their password, or with the passkey they already set up. No new setup is needed.',
    deactivated: 'Their passkeys are kept but cannot be used while deactivated. When activated again, the same passkey works.',
    archived:    'Their passkeys are removed. If the account is restored, they sign in with their password and can set up a new passkey.',
  },
  'vendor-driver': {
    active:      'They sign in with the passkey they already set up. No new setup is needed.',
    deactivated: 'Their passkeys are kept but cannot be used while deactivated. When activated again, the same passkey works.',
    archived:    'Their passkeys are removed. If the account is restored, they need a new setup link to sign in.',
  },
}

/** Title, body and button for a status change on `name`'s account. */
export function statusConfirmCopy(name: string, status: UserStatus, kind: AccountKind = 'other'): Omit<AccountConfirm, 'run'> {
  const base = baseCopy(name, status)
  const note = kind === 'other' ? undefined : PASSKEY_NOTE[kind][status]
  if (!note) return base
  // For Activate the note IS the description; otherwise it follows it.
  return { ...base, description: status === 'active' ? note : `${base.description} ${note}` }
}

/** What a restored archived account can sign in with, per kind. */
export function restoreConfirmDescription(kind: AccountKind): string {
  if (kind === 'vendor-driver') {
    return 'The account comes back as Active. Their old passkeys no longer work: send them a new setup link from Vendor Drivers so they can sign in.'
  }
  if (kind === 'company-driver') {
    return 'The account comes back as Active. Their old passkeys no longer work: they sign in with their password and can set up a new passkey from the account menu.'
  }
  return 'The account comes back as Active and they can sign in again.'
}

function baseCopy(name: string, status: UserStatus): Omit<AccountConfirm, 'run'> {
  switch (status) {
    case 'active':
      return {
        title:        `Activate ${name}?`,
        description:  'They can sign in again with their usual sign-in.',
        confirmLabel: 'Activate',
      }
    case 'deactivated':
      return {
        title:        `Deactivate ${name}?`,
        description:  'They are signed out everywhere and cannot sign in until the account is activated again. Their records are kept.',
        confirmLabel: 'Deactivate',
      }
    case 'archived':
      return {
        title:        `Archive ${name}?`,
        description:  'They are signed out everywhere and can no longer sign in. Their records are kept, and the account can be restored by picking Archived in the Status filter.',
        confirmLabel: 'Archive',
      }
    default:
      return {
        title:        `Change ${name}'s account?`,
        description:  'The account status will be updated.',
        confirmLabel: 'Confirm',
      }
  }
}

export default function AccountActionConfirm({ pending, onClose }: {
  pending: AccountConfirm | null
  onClose: () => void
}) {
  return (
    <ReusableModal
      open={!!pending}
      title={pending?.title ?? ''}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel ?? 'Confirm'}
      cancelLabel="Cancel"
      onCancel={onClose}
      onConfirm={() => {
        const action = pending
        onClose()
        if (action) void action.run()
      }}
    />
  )
}
