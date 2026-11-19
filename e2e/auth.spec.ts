import { test, expect } from '@playwright/test'
import { PORTAL, startSignIn, signInWithPassword, expectSignedInto, expectRefused } from './support/session'

// Test case IDs refer to docs/testing/8338 Test Cases.xlsx (Test Cases sheet).

test.describe('Sign in: happy paths', () => {
  const roles: [string, string, string][] = [
    ['AUTH-001', 'client001', PORTAL.client],
    ['AUTH-002', 'admin001', PORTAL.admin],
    ['AUTH-003', 'gm001', PORTAL.gm],
    ['AUTH-004', 'ops001', PORTAL.ops],
    ['AUTH-005', 'fleet001', PORTAL.fleet],
    ['AUTH-006', 'it001', PORTAL.it],
  ]
  for (const [id, tag, portal] of roles) {
    test(`${id} ${tag} signs in with password and lands on ${portal}`, async ({ page }) => {
      await signInWithPassword(page, tag)
      await expectSignedInto(page, portal)
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeAttached()
    })
  }
})

test.describe('Sign in: unhappy paths', () => {
  test('AUTH-013 wrong password is refused with attempts left', async ({ page }) => {
    await signInWithPassword(page, 'client013', 'Wrong-Password-1')
    await expectRefused(page, /Incorrect password/i)
    // Clear the failed-attempt counter so the account stays usable.
    await page.getByPlaceholder('••••••••').fill(require('./support/env.cjs').seedPassword())
    await page.getByRole('button', { name: 'Sign In', exact: true }).last().click()
    await expectSignedInto(page, PORTAL.client)
  })

  test('AUTH-016 permanently locked account is refused', async ({ page }) => {
    // The email step does not reveal the lock; choosing Password checks the
    // account and shows the lock panel instead of the password field.
    await startSignIn(page, 'client019')
    await page.getByRole('button', { name: /^Password/ }).click()
    await expect(page.getByText('Account Locked')).toBeVisible()
    await expect(page.getByPlaceholder('••••••••')).toHaveCount(0)
    await expect(page.getByText(/permanently locked/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Request A Password Reset' })).toBeVisible()
    await expect(page).toHaveURL(/localhost:\d+\/?(\?.*)?$/)
  })

  test('AUTH-017 deactivated account cannot sign in', async ({ page }) => {
    await signInWithPassword(page, 'client020')
    await expectRefused(page, /.+/)
  })

  test('AUTH-018 archived account cannot sign in', async ({ page }) => {
    await signInWithPassword(page, 'client018')
    await expectRefused(page, /.+/)
  })

  test('AUTH-019 unknown email gets a generic refusal', async ({ page }) => {
    await signInWithPassword(page, 'nobody999')
    // Same wording as a wrong password: never reveals whether the email exists.
    await expectRefused(page, /^Invalid credentials$/)
  })

  test('AUTH-022 expired temporary password is refused', async ({ page }) => {
    await signInWithPassword(page, 'client016')
    await expectRefused(page, /temporary password has expired/i)
  })
})

test.describe('Portal guard and sign out', () => {
  test('AUTH-028 signed-out visitor cannot open a portal page', async ({ page }) => {
    await page.goto('/admin/user-management')
    await expect(page).not.toHaveURL(/\/admin\//)
  })

  test('AUTH-027 client cannot open a staff portal page', async ({ page }) => {
    await signInWithPassword(page, 'client002')
    await expectSignedInto(page, PORTAL.client)
    await page.goto('/admin/user-management')
    await expect(page).not.toHaveURL(/\/admin\/user-management/)
  })

  test('AUTH-029 sign out from the sidebar returns to the landing page', async ({ page }) => {
    await signInWithPassword(page, 'client003')
    await expectSignedInto(page, PORTAL.client)
    await page.getByRole('button', { name: 'Sign out' }).click()
    // Sign out asks first: "Are you sure you want to sign out of your account?" Yes / No.
    await expect(page.getByText('Are you sure you want to sign out of your account?')).toBeVisible()
    await page.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(page).toHaveURL(/localhost:\d+\/?(\?.*)?$/, { timeout: 30_000 })
    await page.goto('/client')
    await expect(page).not.toHaveURL(/\/client(\/|$)/)
  })
})
