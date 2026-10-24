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

/** Title, body and button for a status change on `name`'s account. */
export function statusConfirmCopy(name: string, status: UserStatus): Omit<AccountConfirm, 'run'> {
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
